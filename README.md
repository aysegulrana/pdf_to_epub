# PDF to EPUB Converter

A Python code that converts PDF documents to EPUB format with chapter detection, formatting preservation, and image extraction. The conversion is not perfect, there might be errors especially in the books with unconventional chapter structure. The code will be improved to handle more edge cases. 

## Features

- **Smart Chapter Detection**: Automatically identifies chapters, prologues, epilogues, and other structural elements
- **Text Formatting Preservation**: Maintains bold and italic text formatting from the original PDF
- **Image Handling**: Extracts and compresses images, including cover images
- **Paragraph Detection**: Uses heuristics to identify paragraph breaks correctly
- **Navigation Support**: Creates a proper table of contents with detected chapters
- **Metadata Support**: Adds title and author information to the generated EPUB

## Requirements

- Python 3.6+
- Dependencies:
  - PyMuPDF (fitz)
  - EbookLib
  - Pillow (PIL)

## Installation

1. Clone or download this repository
2. Install required dependencies:

```bash
pip install pymupdf ebooklib pillow
```

## Usage

### Command Line Interface

```bash
python pdf_to_epub.py <your_pdf_file>.pdf <your_output_name>.epub [--title "Book Title"] [--author "Author Name"] [--debug]
```

#### Arguments:

- `pdf_path`: Path to the input PDF file (required)
- `epub_path`: Path to save the output EPUB file (required)
- `--title`: Book title (defaults to filename if not provided)
- `--author`: Book author (defaults to "Unknown")
- `--debug`: Enable debug logging for more detailed output

### Python API

You can also use the converter as a module in your Python code:

```python
from pdf_to_epub import convert_pdf_to_epub

# Simple usage
success = convert_pdf_to_epub("input.pdf", "output.epub")

# With additional metadata
success = convert_pdf_to_epub(
    pdf_path="input.pdf",
    epub_path="output.epub",
    title="My Book Title",
    author="Author Name"
)

if success:
    print("Conversion successful!")
else:
    print("Conversion failed.")
```

For more control, you can use the `PDFToEPUBConverter` class directly:

```python
from pdf_to_epub import PDFToEPUBConverter

converter = PDFToEPUBConverter(
    pdf_path="input.pdf",
    epub_path="output.epub",
    title="My Book Title",
    author="Author Name"
)
success = converter.convert()
```

## How It Works

1. **Text Extraction**: Extracts text from the PDF preserving formatting
2. **Image Extraction**: Identifies and extracts images, including a cover image
3. **Line Merging**: Intelligently merges split lines and words
4. **Chapter Detection**: Identifies chapter headings using pattern matching
5. **Paragraph Detection**: Uses heuristics to identify paragraph breaks
6. **EPUB Creation**: Assembles the content into a properly structured EPUB file

## Customization

The converter contains several methods that can be overridden or modified for custom behavior:

- `_detect_paragraphs()`: Customize paragraph detection logic
- `_build_chapter_pattern()`: Modify chapter detection patterns
- `_preserve_formatting()`: Change how text formatting is handled
- `_compress_image()`: Adjust image compression settings

## Troubleshooting

- **No chapters detected**: Try enabling debug mode (`--debug`) to see potential chapter candidates
- **Missing text**: Some PDFs use non-standard encoding; the converter attempts to handle these cases but may not be perfect
- **Large file size**: Adjust the image compression quality (default: 75) in the `_compress_image()` method

