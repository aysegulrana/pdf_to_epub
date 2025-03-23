// netlify/functions/convert-pdf.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const formidable = require('formidable');
const { v4: uuidv4 } = require('uuid');

// Helper to handle file uploads
const parseMultipartForm = (event) => {
  return new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm();
    
    form.parse(event, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
};

// Main handler function
exports.handler = async (event, context) => {
  // Only allow POST method
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse form data
    const { fields, files } = await parseMultipartForm(event);
    const pdfFile = files.file;
    
    if (!pdfFile) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No PDF file uploaded' }),
      };
    }

    // Generate unique filenames
    const fileId = uuidv4();
    const tempDir = os.tmpdir();
    const pdfPath = path.join(tempDir, `${fileId}.pdf`);
    const epubPath = path.join(tempDir, `${fileId}.epub`);
    
    // Copy uploaded file to temp location
    fs.copyFileSync(pdfFile.path, pdfPath);
    
    // Get title and author from form fields
    const title = fields.title || path.basename(pdfFile.name, '.pdf');
    const author = fields.author || 'Unknown';
    
    // Execute Python script
    // Note: In Netlify Functions, you need to bundle Python and required dependencies
    // This is a simplified example, actual implementation would require more setup
    const conversionResult = await new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', [
        './pdf_to_epub.py',  // Path to your script
        pdfPath,
        epubPath,
        '--title', title,
        '--author', author
      ]);
      
      let errorOutput = '';
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Conversion failed: ${errorOutput}`));
        } else {
          resolve(true);
        }
      });
    });
    
    // Read the EPUB file
    const epubContent = fs.readFileSync(epubPath);
    
    // Clean up temp files
    fs.unlinkSync(pdfPath);
    fs.unlinkSync(epubPath);
    
    // Return the EPUB file
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `attachment; filename="${title.replace(/[^a-z0-9]/gi, '_')}.epub"`,
      },
      body: epubContent.toString('base64'),
      isBase64Encoded: true,
    };
    
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Conversion failed', details: error.message }),
    };
  }
};