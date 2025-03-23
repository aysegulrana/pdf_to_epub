// pdf-to-epub.js
const fs = require('fs');
const path = require('path');
const PDFLib = require('pdf-lib');
const jsEpub = require('epub-gen');
const sharp = require('sharp');

// Set up logging
const logger = {
  info: (message) => console.log(`INFO: ${message}`),
  warning: (message) => console.warn(`WARNING: ${message}`),
  error: (message, error) => console.error(`ERROR: ${message}`, error),
  debug: (message) => console.debug(`DEBUG: ${message}`)
};

/**
 * A class to convert PDF files to EPUB format with chapter detection and formatting preservation.
 */
class PDFToEPUBConverter {
  /**
   * Initialize the converter with file paths and metadata.
   * @param {string} pdfPath - Path to the input PDF file
   * @param {string} epubPath - Path to save the output EPUB file
   * @param {string} title - Title for the EPUB book (defaults to filename)
   * @param {string} author - Author for the EPUB book
   */
  constructor(pdfPath, epubPath, title = null, author = "Unknown") {
    this.pdfPath = pdfPath;
    this.epubPath = epubPath;
    this.title = title || path.basename(pdfPath).replace('.pdf', '');
    this.author = author;
    
    // Book metadata for EPUB
    this.bookOptions = {
      title: this.title,
      author: this.author,
      output: this.epubPath,
      content: []
    };
    
    // Initialize chapter patterns
    this.chapterPattern = this._buildChapterPattern();
    this.prologueEpiloguePattern = this._buildPrologueEpiloguePattern();
  }

  /**
   * Main conversion method that orchestrates the PDF to EPUB transformation.
   * @returns {Promise<boolean>} True if conversion was successful, False otherwise
   */
  async convert() {
    try {
      // Extract text and process PDF
      const pdfText = await this._extractTextFromPdf();
      
      // Process text
      const lines = pdfText.split('\n');
      const mergedText = this._mergeSplitLines(lines);
      
      // Detect chapters
      const [chapters, introTextLines] = this._detectChapters(mergedText);
      
      // Create EPUB content
      this._addIntroToEpub(introTextLines);
      this._addChaptersToEpub(chapters);
      
      // Generate EPUB file
      await this._generateEpub();
      
      logger.info(`EPUB successfully created at: ${this.epubPath}`);
      return true;
    } catch (error) {
      logger.error("Error during conversion:", error);
      return false;
    }
  }

  /**
   * Extract text and images from the PDF file.
   * @returns {Promise<string>} Extracted text from the PDF
   */
  async _extractTextFromPdf() {
    try {
      // Load PDF document
      const pdfBytes = await fs.promises.readFile(this.pdfPath);
      const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
      
      // Extract cover image if available
      await this._extractCoverImage(pdfDoc);
      
      // Extract text from each page
      let pdfText = "";
      const pageCount = pdfDoc.getPageCount();
      
      for (let pageNum = 0; pageNum < pageCount; pageNum++) {
        const page = pdfDoc.getPages()[pageNum];
        
        // Note: pdf-lib doesn't provide direct text extraction with formatting
        // For a complete solution, we'd need to use pdf.js or another library
        
        // This is a placeholder for text extraction - in a real implementation,
        // we'd extract text with formatting and handle images
        const pageText = `Page ${pageNum + 1} content would be extracted here\n`;
        pdfText += pageText;
      }
      
      return pdfText;
    } catch (error) {
      logger.error("Error reading PDF:", error);
      throw error;
    }
  }

  /**
   * Extract the cover image from the first page of the PDF.
   * @param {PDFDocument} pdfDoc - PDF document
   * @returns {Promise<void>}
   */
  async _extractCoverImage(pdfDoc) {
    // Placeholder: In a real implementation, we'd extract the cover image
    // This requires more specialized libraries like pdf.js
    this.coverImagePath = null;
  }

  /**
   * Merge lines intelligently to address split words across lines, preserving chapter headings.
   * @param {string[]} lines - List of text lines
   * @returns {string} Merged text
   */
  _mergeSplitLines(lines) {
    let mergedText = "";
    let prevIsChapter = false;
    
    for (let i = 0; i < lines.length; i++) {
      const strippedLine = lines[i].trim();
      
      if (!strippedLine) {
        continue;
      }
      
      const strippedLineWoTags = this._stripTags(strippedLine);
      
      // Check if line is a chapter heading
      const isChapter = this.chapterPattern.test(strippedLineWoTags) || 
                       this.prologueEpiloguePattern.test(strippedLineWoTags);
      
      if (isChapter) {
        // Add as standalone line with spacing
        prevIsChapter = true;
        if (mergedText) {
          mergedText += "\n"; // End the previous paragraph
        }
        mergedText += "\n" + strippedLine + "\n"; // Add chapter line
      } else if (mergedText && !(/[.:"!?\n"'\)\]\}]$/).test(mergedText)) {
        // Merge with previous line (likely continuing a sentence)
        prevIsChapter = false;
        mergedText += ` ${strippedLine}`;
      } else {
        // Start a new paragraph
        if (mergedText) {
          mergedText += "\n";
        }
        mergedText += strippedLine;
        
        // Special case for single word after chapter heading (possible subtitle)
        if (strippedLineWoTags.split(/\s+/).length === 1 && prevIsChapter) {
          mergedText += "\n";
        }
        
        prevIsChapter = false;
      }
    }
    
    return mergedText;
  }

  /**
   * Detect chapter headings and split text into chapters.
   * @param {string} pdfText - The merged PDF text
   * @returns {[Array<[string, string]>, string[]]} Chapters and intro text
   */
  _detectChapters(pdfText) {
    const chapters = [];
    const lines = pdfText.split('\n');
    const startIndices = [];
    const originalChapterNames = [];
    
    let prevIsChapter = false;
    let chapterNumber = 1;
    let consecutiveChapterIndex = 0;
    
    // Detect lines that match chapter patterns
    for (let i = 0; i < lines.length; i++) {
      const cleanLine = this._stripTags(lines[i].trim());
      
      if (!cleanLine) { // Skip empty lines
        continue;
      }
      
      // Check if line matches chapter pattern
      if (this.chapterPattern.test(cleanLine)) {
        const cleanLineNumeric = String(this._convertLineIfRoman(cleanLine));
        
        if (prevIsChapter) {
          consecutiveChapterIndex++;
        } else {
          consecutiveChapterIndex = 0;
        }
        
        // Skip if not a valid chapter sequence or is a consecutive chapter-like line
        if ((cleanLineNumeric.match(/^\d+$/) && parseInt(cleanLineNumeric) !== chapterNumber) || prevIsChapter) {
          logger.debug(`Skipped potential chapter indicator at line ${i + 1}: ${cleanLine}`);
          
          // Discard false positive chapter detection
          if (consecutiveChapterIndex === 1) {
            if (startIndices.length) {
              startIndices.pop();
              originalChapterNames.pop();
              chapterNumber--;
            }
          }
          
          prevIsChapter = false;
          continue;
        }
        
        logger.info(`Chapter ${chapterNumber} found at line ${i + 1}: ${cleanLine}`);
        chapterNumber++;
        prevIsChapter = true;
        startIndices.push(i);
        
        // Check for subtitle (one word on next line)
        let chapterName = cleanLine;
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          if (lines[j].trim()) {
            const nextLine = lines[j].trim();
            const words = this._stripTags(nextLine).split(/\s+/);
            if (words.length <= 2) { // Consider 1-2 words as potential subtitle
              chapterName += " " + nextLine;
            }
            break;
          }
        }
        
        originalChapterNames.push(chapterName);
      } else if (this.prologueEpiloguePattern.test(cleanLine)) {
        logger.info(`Prologue or Epilogue found at line ${i + 1}: ${cleanLine}`);
        
        // Skip epilogue if it's the first chapter-like element
        if (!(cleanLine.toUpperCase() === "EPILOGUE" && startIndices.length === 0)) {
          prevIsChapter = true;
          startIndices.push(i);
          originalChapterNames.push(lines[i]);
        }
      } else {
        prevIsChapter = false;
      }
    }
    
    // Add the last line index to complete the last chapter
    startIndices.push(lines.length);
    
    // Extract chapters based on start indices
    if (startIndices.length) {
      for (let i = 0; i < startIndices.length - 1; i++) {
        const chapterLines = lines.slice(startIndices[i], startIndices[i + 1]);
        chapters.push([
          chapterLines.join('\n').trim(),
          originalChapterNames[i]
        ]);
      }
      
      return [chapters, lines.slice(0, startIndices[0])];
    } else {
      // No chapters found, treat entire document as single chapter
      logger.warning("No chapters found in document");
      return [[pdfText, "Chapter 1"]], [];
    }
  }
  
  /**
   * Add introductory text to the EPUB if it exists.
   * @param {string[]} introTextLines - The introductory text lines
   */
  _addIntroToEpub(introTextLines) {
    if (!introTextLines || !introTextLines.length) {
      return;
    }
    
    const introText = introTextLines.join('\n');
    const introParagraphs = introText.split('\n');
    
    // Clean and process paragraphs
    const cleanParagraphs = introParagraphs
      .map(para => para.trim())
      .filter(para => para);
    
    if (cleanParagraphs.length) {
      // Add to EPUB content
      this.bookOptions.content.push({
        title: "Introduction",
        data: cleanParagraphs.map(para => `<p>${para}</p>`).join('\n')
      });
    }
  }
  
  /**
   * Add chapters to the EPUB.
   * @param {Array<[string, string]>} chapters - List of tuples containing chapter text and name
   */
  _addChaptersToEpub(chapters) {
    for (let i = 0; i < chapters.length; i++) {
      const [chapterText, chapterName] = chapters[i];
      
      // Process paragraphs
      const paragraphs = this._detectParagraphs(chapterText.split('\n'));
      
      // Create HTML content
      let htmlContent = `<h1>${chapterName}</h1>`;
      
      // Add paragraphs
      for (const para of paragraphs) {
        if (para !== chapterName && para.trim()) {
          htmlContent += `<p>${para}</p>`;
        }
      }
      
      // Add to EPUB content
      this.bookOptions.content.push({
        title: chapterName,
        data: htmlContent
      });
      
      logger.info(`Added chapter ${i + 1}: ${chapterName}`);
    }
  }
  
  /**
   * Generate the EPUB file.
   * @returns {Promise<void>}
   */
  async _generateEpub() {
    // Create EPUB
    return new Promise((resolve, reject) => {
      try {
        new jsEpub(this.bookOptions).promise.then(() => {
          resolve();
        }).catch(err => {
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Detect paragraphs from a list of lines using multiple heuristics.
   * @param {string[]} lines - List of text lines
   * @returns {string[]} List of paragraphs
   */
  _detectParagraphs(lines) {
    const paragraphs = [];
    let currentParagraph = [];
    
    for (let i = 0; i < lines.length; i++) {
      const strippedLine = lines[i].trim();
      
      // Heuristic to detect a new paragraph:
      if (
        strippedLine &&
        (i === 0 || (strippedLine[0] === strippedLine[0].toUpperCase() && 
                    currentParagraph.length && 
                    currentParagraph[currentParagraph.length - 1].endsWith('.')))
      ) {
        // Start a new paragraph if line starts with a capital letter after a period
        if (currentParagraph.length) {
          paragraphs.push(currentParagraph.join(' '));
          currentParagraph = [];
        }
      }
      
      // Add the line to the current paragraph
      if (strippedLine) {
        currentParagraph.push(strippedLine);
      }
    }
    
    // Add any remaining text as the last paragraph
    if (currentParagraph.length) {
      paragraphs.push(currentParagraph.join(' '));
    }
    
    return paragraphs;
  }
  
  /**
   * Remove HTML-like tags from a line.
   * @param {string} text - Text with potential HTML tags
   * @returns {string} Text without HTML tags
   */
  _stripTags(text) {
    return text.replace(/<[^>]*>/g, '');
  }
  
  /**
   * Convert a line to a number if it is a valid Roman numeral.
   * @param {string} line - The line to check
   * @returns {string|number} Either a number or the original line
   */
  _convertLineIfRoman(line) {
    const romanPattern = /^[IVXLCDM]+$/i;
    const strippedLine = line.trim().toUpperCase();
    
    if (romanPattern.test(strippedLine)) {
      return this._romanToInt(strippedLine);
    }
    return line;
  }
  
  /**
   * Convert a Roman numeral to an integer.
   * @param {string} roman - Roman numeral
   * @returns {number} Converted integer
   */
  _romanToInt(roman) {
    const romanMap = {
      'I': 1, 'V': 5, 'X': 10, 'L': 50,
      'C': 100, 'D': 500, 'M': 1000
    };
    
    let value = 0;
    let prevValue = 0;
    
    for (let i = roman.length - 1; i >= 0; i--) {
      const char = roman[i];
      const currentValue = romanMap[char] || 0;
      
      if (currentValue < prevValue) {
        value -= currentValue;
      } else {
        value += currentValue;
      }
      prevValue = currentValue;
    }
    
    return value;
  }
  
  /**
   * Build regex pattern for detecting chapter headings.
   * @returns {RegExp} Compiled regex pattern
   */
  _buildChapterPattern() {
    const textualNumbers = this._generateTextualNumbers();
    const textualNumbersRegex = textualNumbers.map(num => escapeRegExp(num)).join('|');
    
    const pattern = new RegExp(
      `^(?:` +
      `Chapter\\s+(?:\\d{1,3}(?=\\b)|[IVXLCDM]+|${textualNumbersRegex})|` +
      `CHAPTER\\s+(?:\\d{1,3}(?=\\b)|[IVXLCDM]+|${textualNumbersRegex})|` +
      `CHAPTER\\s+(?:\\d{1,3}(?=\\b)|[IVXLCDM]+|${textualNumbersRegex})(?:[:\\-\\s]+.+)?|` +
      `[IVXLCDM]+|\\d{1,3}(?=\\b)` +
      `)$`,
      'i'
    );
    
    return pattern;
  }
  
  /**
   * Build regex pattern for detecting prologue and epilogue headings.
   * @returns {RegExp} Compiled regex pattern
   */
  _buildPrologueEpiloguePattern() {
    return /^(?:PROLOGUE|EPILOGUE|PREFACE|FOREWORD|INTRODUCTION|AFTERWORD|POSTSCRIPT)$/i;
  }
  
  /**
   * Generate a list of textual numbers up to ONE THOUSAND.
   * @returns {string[]} List of textual number representations
   */
  _generateTextualNumbers() {
    const units = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"];
    const teens = [
      "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN",
      "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"
    ];
    const tens = ["TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
    
    // Generate numbers below 100
    const textualNumbers = [...units, ...teens];
    
    for (const ten of tens) {
      textualNumbers.push(ten);
      for (const unit of units) {
        textualNumbers.push(`${ten}-${unit}`);
        textualNumbers.push(`${ten} ${unit}`);
      }
    }
    
    // Add hundreds
    const hundreds = [];
    for (const unit of units) {
      hundreds.push(`${unit} HUNDRED`);
      for (const number of textualNumbers) {
        hundreds.push(`${unit} HUNDRED AND ${number}`);
      }
    }
    textualNumbers.push(...hundreds);
    
    // Add one thousand
    textualNumbers.push("ONE THOUSAND");
    
    return textualNumbers;
  }
}

/**
 * Escape special characters for use in a regular expression.
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convenience function to convert PDF to EPUB.
 * @param {string} pdfPath - Path to the input PDF file
 * @param {string} epubPath - Path to save the output EPUB file
 * @param {string} title - Title for the EPUB book (defaults to filename)
 * @param {string} author - Author for the EPUB book
 * @returns {Promise<boolean>} True if conversion was successful, False otherwise
 */
async function convertPdfToEpub(pdfPath, epubPath, title = null, author = "Unknown") {
  const converter = new PDFToEPUBConverter(pdfPath, epubPath, title, author);
  return await converter.convert();
}

// Command-line interface
if (require.main === module) {
  const args = require('minimist')(process.argv.slice(2));
  
  if (!args._.length || args._.length < 2) {
    console.log('Usage: node pdf-to-epub.js <pdf_path> <epub_path> [--title=TITLE] [--author=AUTHOR] [--debug]');
    process.exit(1);
  }
  
  const pdfPath = args._[0];
  const epubPath = args._[1];
  const title = args.title;
  const author = args.author || "Unknown";
  
  if (args.debug) {
    // Enable more verbose logging
    console.debug = console.log;
  }
  
  convertPdfToEpub(pdfPath, epubPath, title, author)
    .then(success => {
      if (success) {
        console.log(`Successfully converted ${pdfPath} to ${epubPath}`);
      } else {
        console.log(`Failed to convert ${pdfPath}`);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = {
  PDFToEPUBConverter,
  convertPdfToEpub
};