// netlify/functions/convert-pdf.js
const os = require('os');
const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');
const busboy = require('busboy');
const { PDFToEPUBConverter } = require('../../pdf-to-epub');

// Parse multipart form data from event
async function parseMultipartForm(event) {
  return new Promise((resolve, reject) => {
    // Create unique temp directory for this request
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-upload-'));
    const fields = {};
    const files = {};
    
    // Create busboy instance
    const bb = busboy({ 
      headers: event.headers,
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
      }
    });
    
    // Handle fields
    bb.on('field', (name, val) => {
      fields[name] = val;
    });
    
    // Handle files
    bb.on('file', (name, file, info) => {
      const { filename, encoding, mimeType } = info;
      const tmpFilePath = path.join(tmpDir, filename);
      const writeStream = fs.createWriteStream(tmpFilePath);
      
      file.pipe(writeStream);
      
      file.on('end', () => {
        files[name] = {
          filename,
          contentType: mimeType,
          path: tmpFilePath
        };
      });
    });
    
    // Handle parsing complete
    bb.on('close', () => {
      resolve({ fields, files, tmpDir });
    });
    
    bb.on('error', (error) => {
      // Clean up temp directory
      try {
        fs.rmdirSync(tmpDir, { recursive: true });
      } catch (cleanupError) {
        console.error('Error cleaning up temp directory:', cleanupError);
      }
      reject(error);
    });
    
    // Pass the request body to busboy
    const buffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
    bb.write(buffer);
    bb.end();
  });
}

exports.handler = async (event, context) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  let tmpDir = null;
  
  try {
    // Parse form data
    const { fields, files, tmpDir: tempDirectory } = await parseMultipartForm(event);
    tmpDir = tempDirectory;
    
    // Get uploaded PDF file
    const pdfFile = files.file;
    if (!pdfFile || !pdfFile.path) {
      throw new Error('No PDF file uploaded');
    }
    
    // Set output path
    const epubPath = path.join(tmpDir, `${path.basename(pdfFile.filename, '.pdf')}.epub`);
    
    // Get metadata
    const title = fields.title || path.basename(pdfFile.filename, '.pdf');
    const author = fields.author || 'Unknown';
    
    console.log(`Converting PDF: ${pdfFile.path}`);
    console.log(`Output EPUB: ${epubPath}`);
    console.log(`Title: ${title}, Author: ${author}`);
    
    // Convert PDF to EPUB
    const success = await PDFToEPUBConverter.convertPdfToEpub(
      pdfFile.path,
      epubPath,
      title,
      author
    );
    
    if (!success) {
      throw new Error('Conversion failed');
    }
    
    // Check if output file exists
    if (!fs.existsSync(epubPath)) {
      throw new Error('EPUB file was not created');
    }
    
    // Read the EPUB file
    const epubData = fs.readFileSync(epubPath);
    
    // Return the EPUB file
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(title)}.epub"`,
      },
      body: epubData.toString('base64'),
      isBase64Encoded: true
    };
    
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Conversion failed', 
        details: error.message 
      })
    };
  } finally {
    // Clean up temporary files
    if (tmpDir) {
      try {
        fs.rmdirSync(tmpDir, { recursive: true });
      } catch (error) {
        console.error('Error cleaning up temp directory:', error);
      }
    }
  }
};