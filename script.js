document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const fileName = document.getElementById('fileName');
    const convertBtn = document.getElementById('convertBtn');
    const statusArea = document.getElementById('statusArea');
    const progressBar = document.getElementById('progressBar');
    const statusText = document.getElementById('statusText');
    const resultArea = document.getElementById('resultArea');
    const downloadBtn = document.getElementById('downloadBtn');
    const titleInput = document.getElementById('titleInput');
    const authorInput = document.getElementById('authorInput');

    // Variables
    let selectedFile = null;
    let convertedFileUrl = null;

    // Event Listeners for File Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        dropArea.classList.add('active');
    }

    function unhighlight() {
        dropArea.classList.remove('active');
    }

    // Handle file drop
    dropArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            handleFiles(files);
        }
    }

    // Handle file selection via button
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFiles(this.files);
        }
    });

    // Click on the drop area to trigger file input
    dropArea.addEventListener('click', function() {
        fileInput.click();
    });

    // Handle the selected files
    function handleFiles(files) {
        if (files[0].type !== 'application/pdf') {
            showError('Please select a PDF file.');
            return;
        }

        selectedFile = files[0];
        fileName.textContent = selectedFile.name;
        convertBtn.disabled = false;

        // Set default title from filename
        if (!titleInput.value) {
            titleInput.value = selectedFile.name.replace('.pdf', '');
        }
    }

    // Show error message
    function showError(message) {
        statusText.textContent = message;
        statusText.style.color = 'var(--error-color)';
        statusArea.hidden = false;
        setTimeout(() => {
            statusArea.hidden = true;
            statusText.style.color = '';
        }, 5000);
    }

    // Handle conversion button click
    convertBtn.addEventListener('click', function() {
        if (!selectedFile) return;

        // Show status area and hide result area
        statusArea.hidden = false;
        resultArea.hidden = true;
        convertBtn.disabled = true;

        // Prepare form data for the API request
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('title', titleInput.value || selectedFile.name.replace('.pdf', ''));
        formData.append('author', authorInput.value || 'Unknown');

        // Reset progress
        progressBar.style.width = '0%';
        statusText.textContent = 'Uploading file...';
        progressBar.style.width = '20%';

        // Real API call to Netlify Function
        fetch('/.netlify/functions/convert-pdf', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            progressBar.style.width = '80%';
            statusText.textContent = 'Processing file...';

            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.error || 'Conversion failed');
                });
            }
            
            // For binary responses like EPUB files
            return response.blob();
        })
        .then(blob => {
            // Create a URL for the blob
            convertedFileUrl = URL.createObjectURL(blob);
            
            // Complete the progress
            progressBar.style.width = '100%';
            statusText.textContent = 'Conversion complete!';
            
            // Show the result area
            setTimeout(() => {
                statusArea.hidden = true;
                resultArea.hidden = false;
                convertBtn.disabled = false;
            }, 500);
        })
        .catch(error => {
            console.error('Conversion error:', error);
            showError('Conversion failed: ' + error.message);
            convertBtn.disabled = false;
        });
    });

    // Download the converted file
    downloadBtn.addEventListener('click', function() {
        if (!convertedFileUrl) return;
        
        const a = document.createElement('a');
        a.href = convertedFileUrl;
        a.download = selectedFile.name.replace('.pdf', '.epub');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    // Add instructional message
    const instructionElem = document.createElement('p');
    instructionElem.className = 'instruction';
    instructionElem.innerHTML = 'Note: Processing may take a minute for large files. Maximum file size is 10MB.';
    instructionElem.style.textAlign = 'center';
    instructionElem.style.marginTop = '20px';
    instructionElem.style.fontSize = '0.9rem';
    instructionElem.style.color = '#666';
    document.querySelector('.converter-card').appendChild(instructionElem);
});