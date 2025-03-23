"""
This file provides a serverless function implementation for the PDF to EPUB converter.
This can be deployed to a service like Netlify Functions, Vercel Functions, or AWS Lambda.

Requirements:
- PyMuPDF
- ebooklib
- Pillow
- python-multipart (for FastAPI implementation)
"""

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn
import os
import tempfile
import uuid
from pdf_to_epub import convert_pdf_to_epub  # Import your converter

app = FastAPI()

# Add CORS middleware to allow requests from your GitHub Pages domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace with your GitHub Pages URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create a temporary directory to store files
TEMP_DIR = tempfile.mkdtemp()

@app.post("/convert")
async def convert_pdf(
    file: UploadFile = File(...),
    title: str = Form(None),
    author: str = Form("Unknown")
):
    """
    Endpoint to convert PDF files to EPUB format
    """
    # Generate unique filenames
    file_id = str(uuid.uuid4())
    pdf_path = os.path.join(TEMP_DIR, f"{file_id}.pdf")
    epub_path = os.path.join(TEMP_DIR, f"{file_id}.epub")
    
    try:
        # Save the uploaded PDF file
        with open(pdf_path, "wb") as pdf_file:
            pdf_file.write(await file.read())
        
        # Use the title from the form or default to filename
        book_title = title or os.path.splitext(file.filename)[0]
        
        # Perform the conversion
        success = convert_pdf_to_epub(pdf_path, epub_path, book_title, author)
        
        if not success:
            return {"status": "error", "message": "Conversion failed"}
        
        # Return the EPUB file
        return FileResponse(
            path=epub_path,
            filename=f"{os.path.splitext(file.filename)[0]}.epub",
            media_type="application/epub+zip"
        )
        
    except Exception as e:
        return {"status": "error", "message": str(e)}
    
    finally:
        # Clean up temporary files
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
        # The EPUB file will be automatically removed after being sent

# For local development
if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)