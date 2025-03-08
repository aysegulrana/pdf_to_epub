import re
import fitz  # PyMuPDF
from ebooklib import epub
import io
from PIL import Image
import os
import logging
from typing import List, Tuple, Optional, Dict, Any

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger('pdf2epub')

class PDFToEPUBConverter:
    """A class to convert PDF files to EPUB format with chapter detection and formatting preservation."""
    
    def __init__(self, pdf_path: str, epub_path: str, title: str = None, author: str = "Unknown"):
        """Initialize the converter with file paths and metadata.
        
        Args:
            pdf_path: Path to the input PDF file
            epub_path: Path to save the output EPUB file
            title: Title for the EPUB book (defaults to filename if None)
            author: Author for the EPUB book
        """
        self.pdf_path = pdf_path
        self.epub_path = epub_path
        self.title = title or os.path.basename(pdf_path).replace('.pdf', '')
        self.author = author
        self.book = epub.EpubBook()
        self.book.set_title(self.title)
        self.book.add_author(self.author)
        
        # Patterns
        self.chapter_pattern = self._build_chapter_pattern()
        self.prologue_epilogue_pattern = self._build_prologue_epilogue_pattern()
    
    def convert(self) -> bool:
        """Main conversion method that orchestrates the PDF to EPUB transformation.
        
        Returns:
            bool: True if conversion was successful, False otherwise
        """
        try:
            # Extract text and process PDF
            pdf_text = self._extract_text_from_pdf()
            
            # Process text
            merged_text = self._merge_split_lines(pdf_text.splitlines())
            
            # Detect chapters
            chapters, intro_text_lines = self._detect_chapters(merged_text)
            
            # Create EPUB content
            self._add_intro_to_epub(intro_text_lines)
            self._add_chapters_to_epub(chapters)
            
            # Generate navigation
            self._build_navigation()
            
            # Write the EPUB file
            epub.write_epub(self.epub_path, self.book)
            logger.info(f"EPUB successfully created at: {self.epub_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error during conversion: {e}", exc_info=True)
            return False
    
    def _extract_text_from_pdf(self) -> str:
        """Extract text and images from the PDF file.
        
        Returns:
            str: Extracted text from the PDF
        """
        pdf_text = ""
        
        try:
            with fitz.open(self.pdf_path) as pdf_document:
                # Extract cover image from first page if available
                self._extract_cover_image(pdf_document)
                
                # Process each page
                for page_num in range(pdf_document.page_count):
                    page = pdf_document[page_num]
                    
                    # Extract text with formatting
                    page_text = self._preserve_formatting(page)
                    
                    # If page has no text, try to extract images
                    if not page_text.strip():
                        logger.info(f"Page {page_num + 1} has no text. Extracting images if present.")
                        self._extract_images_from_page(page, page_num)
                    
                    pdf_text += page_text
            
            # Ensure proper encoding
            pdf_text = pdf_text.encode('utf-8', errors='replace').decode('utf-8')
            return pdf_text
            
        except Exception as e:
            logger.error(f"Error reading PDF: {e}", exc_info=True)
            raise
    
    def _extract_cover_image(self, pdf_document: fitz.Document) -> None:
        """Extract the cover image from the first page of the PDF.
        
        Args:
            pdf_document: Open PDF document
        """
        try:
            first_page = pdf_document[0]
            images = first_page.get_images(full=True)
            
            if images:
                xref = images[0][0]  # Get the first image on the first page
                base_image = pdf_document.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                
                cover_image_name = f"cover.{image_ext}"
                self.book.set_cover(cover_image_name, image_bytes)
                logger.info("Cover image extracted and added to EPUB")
        except Exception as e:
            logger.warning(f"Could not extract cover image: {e}")
    
    def _extract_images_from_page(self, page: fitz.Page, page_num: int) -> None:
        """Extract images from a PDF page and add them to the EPUB.
        
        Args:
            page: The PDF page to extract images from
            page_num: The page number
        """
        try:
            images = page.get_images(full=True)
            
            for img_index, img in enumerate(images):
                xref = img[0]
                base_image = page.parent.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                
                # Compress the image
                compressed_image_bytes = self._compress_image(image_bytes)
                
                # Create image name and add to EPUB
                image_name = f"page_{page_num + 1}_{img_index + 1}.{image_ext}"
                
                # Add the image as a standalone HTML page
                img_html = epub.EpubHtml(
                    title=f"Image Page {page_num + 1}",
                    file_name=f"image_page_{page_num + 1}_{img_index + 1}.xhtml",
                    lang="en",
                )
                img_html.content = f'<img src="{image_name}" alt="Page {page_num + 1} Image"/>'
                
                epub_image = epub.EpubItem(
                    uid=f"image_{page_num + 1}_{img_index + 1}",
                    file_name=image_name,
                    media_type=f"image/{image_ext}",
                    content=compressed_image_bytes,
                )
                
                self.book.add_item(epub_image)
                self.book.add_item(img_html)
                
                logger.info(f"Added image from page {page_num + 1}")
        except Exception as e:
            logger.warning(f"Error extracting images from page {page_num + 1}: {e}")
    
    def _preserve_formatting(self, page: fitz.Page) -> str:
        """Preserve formatting (bold, italic) in extracted text.
        
        Args:
            page: The PDF page
            
        Returns:
            str: Text with HTML formatting tags
        """
        text_with_formatting = ""
        try:
            for block in page.get_text("dict")["blocks"]:
                if "lines" not in block:
                    continue
                    
                for line in block["lines"]:
                    line_text = ""
                    
                    for span in line["spans"]:
                        span_text = span["text"]
                        is_italic = span["flags"] & 2  # Check italic flag
                        is_bold = "bold" in span["font"].lower() or span["flags"] & 16  # Check bold flag
                        
                        # Apply formatting
                        if is_bold and is_italic:
                            span_text = f"<b><i>{span_text}</i></b>"
                        elif is_bold:
                            span_text = f"<b>{span_text}</b>"
                        elif is_italic:
                            span_text = f"<i>{span_text}</i>"
                            
                        line_text += span_text
                        
                    text_with_formatting += line_text + "\n"
                    
            return text_with_formatting
        except Exception as e:
            logger.warning(f"Error preserving formatting: {e}")
            return page.get_text("text")  # Fallback to plain text
    
    def _compress_image(self, image_bytes: bytes, quality: int = 75) -> bytes:
        """Compress an image to reduce file size.
        
        Args:
            image_bytes: The original image bytes
            quality: Compression quality (1-100)
            
        Returns:
            bytes: Compressed image bytes
        """
        try:
            image = Image.open(io.BytesIO(image_bytes))
            compressed = io.BytesIO()
            
            # Use JPEG for RGB or CMYK images for better compression
            if image.mode in ('RGB', 'CMYK'):
                image.save(compressed, format='JPEG', quality=quality, optimize=True)
            else:
                # For PNG or GIF with transparency
                image.save(compressed, format=image.format, optimize=True)
                
            return compressed.getvalue()
        except Exception as e:
            logger.warning(f"Image compression failed: {e}")
            return image_bytes  # Return original if compression fails
    
    def _merge_split_lines(self, lines: List[str]) -> str:
        """Merge lines intelligently to address split words across lines, preserving chapter headings.
        
        Args:
            lines: List of text lines
            
        Returns:
            str: Merged text
        """
        merged_text = ""
        prev_is_chapter = False
        
        for i, line in enumerate(lines):
            stripped_line = line.strip()
            
            if not stripped_line:
                continue
                
            stripped_line_wo_tags = self._strip_tags(stripped_line)
            
            # Check if line is a chapter heading
            is_chapter = (self.chapter_pattern.match(stripped_line_wo_tags) or 
                          self.prologue_epilogue_pattern.match(stripped_line_wo_tags))
            
            if is_chapter:
                # Add as standalone line with spacing
                prev_is_chapter = True
                if merged_text:
                    merged_text += "\n"  # End the previous paragraph
                merged_text += "\n" + stripped_line + "\n"  # Add chapter line
            elif merged_text and not merged_text.endswith((".", ":", "!", "?", "\n", '"', "'", ")", "]", "}")):
                # Merge with previous line (likely continuing a sentence)
                prev_is_chapter = False
                merged_text += f" {stripped_line}"
            else:
                # Start a new paragraph
                if merged_text:
                    merged_text += "\n"
                merged_text += stripped_line
                
                # Special case for single word after chapter heading (possible subtitle)
                if len(stripped_line_wo_tags.split()) == 1 and prev_is_chapter:
                    merged_text += "\n"
                
                prev_is_chapter = False
        
        return merged_text
    
    def _detect_chapters(self, pdf_text: str) -> Tuple[List[Tuple[str, str]], List[str]]:
        """Detect chapter headings and split text into chapters.
        
        Args:
            pdf_text: The merged PDF text
            
        Returns:
            tuple: List of chapter texts and names, and introductory text lines
        """
        chapters = []
        lines = pdf_text.splitlines()
        start_indices = []
        original_chapter_names = []
        
        prev_is_chapter = False
        chapter_number = 1
        consecutive_chapter_index = 0
        
        # Detect lines that match chapter patterns
        for i, line in enumerate(lines):
            clean_line = self._strip_tags(line.strip())
            
            if not clean_line:  # Skip empty lines
                continue
            
            # Check if line matches chapter pattern
            if self.chapter_pattern.match(clean_line):
                clean_line_numeric = str(self._convert_line_if_roman(clean_line))
                
                if prev_is_chapter:
                    consecutive_chapter_index += 1
                else:
                    consecutive_chapter_index = 0
                
                # Skip if not a valid chapter sequence or is a consecutive chapter-like line
                if (clean_line_numeric.isnumeric() and int(clean_line_numeric) != chapter_number) or prev_is_chapter:
                    logger.debug(f"Skipped potential chapter indicator at line {i + 1}: {clean_line}")
                    
                    # Discard false positive chapter detection
                    if consecutive_chapter_index == 1:
                        if start_indices:
                            start_indices.pop()
                            original_chapter_names.pop()
                            chapter_number -= 1
                    
                    prev_is_chapter = False
                    continue
                
                logger.info(f"Chapter {chapter_number} found at line {i + 1}: {clean_line}")
                chapter_number += 1
                prev_is_chapter = True
                start_indices.append(i)
                
                # Check for subtitle (one word on next line)
                chapter_name = clean_line
                for j in range(i+1, min(i+3, len(lines))):
                    if lines[j].strip():
                        next_line = lines[j].strip()
                        words = self._strip_tags(next_line).split()
                        if len(words) <= 2:  # Consider 1-2 words as potential subtitle
                            chapter_name += " " + next_line
                        break
                        
                original_chapter_names.append(chapter_name)
                
            elif self.prologue_epilogue_pattern.match(clean_line):
                logger.info(f"Prologue or Epilogue found at line {i + 1}: {clean_line}")
                
                # Skip epilogue if it's the first chapter-like element
                if not (clean_line.upper() == "EPILOGUE" and len(start_indices) == 0):
                    prev_is_chapter = True
                    start_indices.append(i)
                    original_chapter_names.append(line)
            else:
                prev_is_chapter = False
        
        # Add the last line index to complete the last chapter
        start_indices.append(len(lines))
        
        # Extract chapters based on start indices
        if start_indices:
            for i in range(len(start_indices) - 1):
                chapter_lines = lines[start_indices[i]:start_indices[i + 1]]
                chapters.append((
                    "\n".join(chapter_lines).strip(),
                    original_chapter_names[i]
                ))
            
            return chapters, lines[:start_indices[0]]
        else:
            # No chapters found, treat entire document as single chapter
            logger.warning("No chapters found in document")
            return [(pdf_text, "Chapter 1")], []
    
    def _add_intro_to_epub(self, intro_text_lines: List[str]) -> None:
        """Add introductory text to the EPUB if it exists.
        
        Args:
            intro_text_lines: The introductory text lines
        """
        if not intro_text_lines:
            return
            
        intro_text = "\n".join(intro_text_lines)
        intro_paragraphs = intro_text.splitlines()
        
        # Clean and process paragraphs
        clean_paragraphs = []
        for para in intro_paragraphs:
            if para.strip():
                clean_paragraphs.append(para.strip())
        
        # Create proper HTML content
        intro_html_content = "<h1>Introduction</h1>"
        for para in clean_paragraphs:
            intro_html_content += f"<p>{para}</p>"
        
        # Create EPUB chapter
        intro_chapter = epub.EpubHtml(
            title="Introduction",
            file_name="intro.xhtml",
            lang="en"
        )
        intro_chapter.content = intro_html_content
        self.book.add_item(intro_chapter)
        
        # Store for navigation
        self.intro_chapter = intro_chapter
    
    def _add_chapters_to_epub(self, chapters: List[Tuple[str, str]]) -> None:
        """Add chapters to the EPUB.
        
        Args:
            chapters: List of tuples containing chapter text and name
        """
        self.chapter_items = []
        
        for i, (chapter_text, chapter_name) in enumerate(chapters, start=1):
            # Create chapter item
            chapter = epub.EpubHtml(
                title=chapter_name,
                file_name=f"chapter_{i}.xhtml",
                lang="en"
            )
            
            # Process paragraphs
            paragraphs = self._detect_paragraphs(chapter_text.splitlines())
            
            # Create HTML content
            html_content = f"<h1>{chapter_name}</h1>"
            
            # Remove chapter title from content to avoid duplication
            start_idx = chapter_text.find(chapter_name) + len(chapter_name)
            content_text = chapter_text[start_idx:].strip()
            
            # Add paragraphs
            for para in paragraphs:
                if para not in chapter_name and para.strip():
                    html_content += f"<p>{para}</p>"
            
            chapter.content = html_content
            self.book.add_item(chapter)
            self.chapter_items.append(chapter)
            
            logger.info(f"Added chapter {i}: {chapter_name}")
    
    def _build_navigation(self) -> None:
        """Build the EPUB navigation structure."""
        self.book.add_item(epub.EpubNcx())
        self.book.add_item(epub.EpubNav())
        
        # Create spine (reading order)
        spine = ["nav"]
        
        # Add intro if exists
        if hasattr(self, 'intro_chapter'):
            spine.append(self.intro_chapter)
        
        # Add chapters
        spine.extend(self.chapter_items)
        
        self.book.spine = spine
        
        # Create table of contents
        toc = []
        
        # Add intro to TOC if exists
        if hasattr(self, 'intro_chapter'):
            toc.append(self.intro_chapter)
        
        # Add chapters to TOC
        toc.extend(self.chapter_items)
        
        self.book.toc = toc
    
    def _detect_paragraphs(self, lines: List[str]) -> List[str]:
        """Detect paragraphs from a list of lines using multiple heuristics.
        
        Args:
            lines: List of text lines
            
        Returns:
            list: List of paragraphs
        """
        paragraphs = []
        current_paragraph = []

        for i, line in enumerate(lines):
            stripped_line = line.strip()

            # Heuristic to detect a new paragraph:
            if (
                stripped_line and
                (i == 0 or stripped_line[0].isupper() and current_paragraph and current_paragraph[-1].endswith('.'))
            ):
                # Start a new paragraph if line starts with a capital letter after a period
                if current_paragraph:
                    paragraphs.append(" ".join(current_paragraph))
                    current_paragraph = []

            # Add the line to the current paragraph
            if stripped_line:
                current_paragraph.append(stripped_line)

        # Add any remaining text as the last paragraph
        if current_paragraph:
            paragraphs.append(" ".join(current_paragraph))
        
        return paragraphs
    
    def _strip_tags(self, text: str) -> str:
        """Remove HTML-like tags from a line.
        
        Args:
            text: Text with potential HTML tags
            
        Returns:
            str: Text without HTML tags
        """
        return re.sub(r"<[^>]*>", "", text)
    
    def _convert_line_if_roman(self, line: str) -> Any:
        """Convert a line to a number if it is a valid Roman numeral.
        
        Args:
            line: The line to check
            
        Returns:
            Either a number or the original line
        """
        roman_pattern = re.compile(r"^[IVXLCDM]+$", re.IGNORECASE)
        stripped_line = line.strip().upper()
        
        if roman_pattern.match(stripped_line):
            return self._roman_to_int(stripped_line)
        return line
    
    def _roman_to_int(self, roman: str) -> int:
        """Convert a Roman numeral to an integer.
        
        Args:
            roman: Roman numeral
            
        Returns:
            int: Converted integer
        """
        roman_map = {
            'I': 1, 'V': 5, 'X': 10, 'L': 50,
            'C': 100, 'D': 500, 'M': 1000
        }
        value = 0
        prev_value = 0
        
        for char in reversed(roman):
            current_value = roman_map.get(char, 0)
            if current_value < prev_value:
                value -= current_value
            else:
                value += current_value
            prev_value = current_value
            
        return value
    
    def _build_chapter_pattern(self) -> re.Pattern:
        """Build regex pattern for detecting chapter headings.
        
        Returns:
            re.Pattern: Compiled regex pattern
        """
        textual_numbers = self._generate_textual_numbers()
        textual_numbers_regex = "|".join(re.escape(num) for num in textual_numbers)
        
        pattern = re.compile(
            rf"^(?:"
            rf"Chapter\s+(?:\d{{1,3}}(?=\b)|[IVXLCDM]+|{textual_numbers_regex})|"
            rf"CHAPTER\s+(?:\d{{1,3}}(?=\b)|[IVXLCDM]+|{textual_numbers_regex})|"
            rf"CHAPTER\s+(?:\d{{1,3}}(?=\b)|[IVXLCDM]+|{textual_numbers_regex})(?:[:\-\s]+.+)?|"
            rf"[IVXLCDM]+|\d{{1,3}}(?=\b)"
            rf")$",
            re.IGNORECASE
        )
        
        return pattern
    
    def _build_prologue_epilogue_pattern(self) -> re.Pattern:
        """Build regex pattern for detecting prologue and epilogue headings.
        
        Returns:
            re.Pattern: Compiled regex pattern
        """
        return re.compile(
            r"^(?:PROLOGUE|EPILOGUE|PREFACE|FOREWORD|INTRODUCTION|AFTERWORD|POSTSCRIPT)$",
            re.IGNORECASE
        )
    
    def _generate_textual_numbers(self) -> List[str]:
        """Generate a list of textual numbers up to ONE THOUSAND.
        
        Returns:
            list: List of textual number representations
        """
        units = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"]
        teens = [
            "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN",
            "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"
        ]
        tens = ["TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"]
        
        # Generate numbers below 100
        textual_numbers = units + teens
        for ten in tens:
            textual_numbers.append(ten)
            for unit in units:
                textual_numbers.append(f"{ten}-{unit}")
                textual_numbers.append(f"{ten} {unit}")
        
        # Add hundreds
        hundreds = []
        for unit in units:
            hundreds.append(f"{unit} HUNDRED")
            for number in textual_numbers:
                hundreds.append(f"{unit} HUNDRED AND {number}")
        textual_numbers += hundreds
        
        # Add one thousand
        textual_numbers.append("ONE THOUSAND")
        
        return textual_numbers


def convert_pdf_to_epub(pdf_path: str, epub_path: str, title: str = None, author: str = "Unknown") -> bool:
    """Convenience function to convert PDF to EPUB.
    
    Args:
        pdf_path: Path to the input PDF file
        epub_path: Path to save the output EPUB file
        title: Title for the EPUB book (defaults to filename if None)
        author: Author for the EPUB book
        
    Returns:
        bool: True if conversion was successful, False otherwise
    """
    converter = PDFToEPUBConverter(pdf_path, epub_path, title, author)
    return converter.convert()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Convert PDF files to EPUB format")
    parser.add_argument("pdf_path", help="Path to the input PDF file")
    parser.add_argument("epub_path", help="Path to save the output EPUB file")
    parser.add_argument("--title", help="Book title (defaults to filename)")
    parser.add_argument("--author", default="Unknown", help="Book author")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    
    args = parser.parse_args()
    
    if args.debug:
        logger.setLevel(logging.DEBUG)
    
    success = convert_pdf_to_epub(args.pdf_path, args.epub_path, args.title, args.author)
    
    if success:
        print(f"Successfully converted {args.pdf_path} to {args.epub_path}")
    else:
        print(f"Failed to convert {args.pdf_path}")
        exit(1)