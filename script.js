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
    let convertedFile = null;

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
        }, 3000);
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

        // Simulate progress (since we can't deploy a real backend yet)
        simulateConversion(formData);
    });

    // Download the converted file
    downloadBtn.addEventListener('click', function() {
        if (!convertedFile) return;
        
        // In a real app, this would be a URL to the converted file
        // For now, we'll create a simple blob
        const blob = new Blob(['Simulated EPUB content'], { type: 'application/epub+zip' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = selectedFile.name.replace('.pdf', '.epub');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Function to simulate the conversion process (since we don't have a real backend yet)
    function simulateConversion(formData) {
        // Reset progress
        progressBar.style.width = '0%';
        statusText.textContent = 'Converting...';

        // Simulate progress updates
        let progress = 0;
        const interval = setInterval(() => {
            progress += 5;
            progressBar.style.width = `${progress}%`;
            
            if (progress >= 100) {
                clearInterval(interval);
                statusText.textContent = 'Conversion complete!';
                
                setTimeout(() => {
                    // Hide status area and show result
                    statusArea.hidden = true;
                    resultArea.hidden = false;
                    
                    // Set the simulated converted file
                    convertedFile = {
                        name: selectedFile.name.replace('.pdf', '.epub'),
                        type: 'application/epub+zip'
                    };
                    
                    // Re-enable convert button
                    convertBtn.disabled = false;
                }, 500);
            }
        }, 150);

        // In a real implementation, you would make an API call here
        // For example:
        /*
        fetch('https://your-api-endpoint.com/convert', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Conversion failed');
            }
            return response.blob();
        })
        .then(blob => {
            convertedFile = new File([blob], selectedFile.name.replace('.pdf', '.epub'), {
                type: 'application/epub+zip'
            });
            
            // Complete the progress bar
            progressBar.style.width = '100%';
            
            // Hide status area and show result
            statusArea.hidden = true;
            resultArea.hidden = false;
            
            // Re-enable convert button
            convertBtn.disabled = false;
        })
        .catch(error => {
            showError('Conversion failed: ' + error.message);
            convertBtn.disabled = false;
        });
        */
    }

    // Add instructional messages
    const instructionElem = document.createElement('p');
    instructionElem.className = 'instruction';
    instructionElem.innerHTML = 'Note: Since this is a GitHub Pages demo, the file is processed in your browser. For large files, please use the <a href="https://github.com/aysegulrana/pdf_to_epub" target="_blank">command-line version</a>.';
    instructionElem.style.textAlign = 'center';
    instructionElem.style.marginTop = '20px';
    instructionElem.style.fontSize = '0.9rem';
    instructionElem.style.color = '#666';
    document.querySelector('.converter-card').appendChild(instructionElem);
});