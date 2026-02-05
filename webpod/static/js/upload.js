/**
 * WebPod - Upload Module
 * Browser-based file upload to add music to the library
 */
var Upload = {
    files: [],
    uploading: false,

    init: function() {
        var btn = document.getElementById('upload-btn');
        var closeBtn = document.getElementById('upload-close');
        var startBtn = document.getElementById('upload-start-btn');
        var dropzone = document.getElementById('upload-dropzone');
        var fileInput = document.getElementById('upload-file-input');
        var overlay = document.getElementById('upload-dialog');

        btn.addEventListener('click', Upload.openDialog);
        closeBtn.addEventListener('click', Upload.closeDialog);
        startBtn.addEventListener('click', Upload.startUpload);

        // Click dropzone to open file picker
        dropzone.addEventListener('click', function() {
            if (!Upload.uploading) fileInput.click();
        });

        // File input change
        fileInput.addEventListener('change', function() {
            Upload.addFiles(fileInput.files);
            fileInput.value = '';
        });

        // Drag-and-drop
        dropzone.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });
        dropzone.addEventListener('dragleave', function() {
            dropzone.classList.remove('drag-over');
        });
        dropzone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            if (!Upload.uploading) Upload.addFiles(e.dataTransfer.files);
        });

        // Close on overlay click
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay && !Upload.uploading) Upload.closeDialog();
        });
    },

    openDialog: function() {
        Upload.reset();
        document.getElementById('upload-dialog').classList.remove('hidden');
    },

    closeDialog: function() {
        if (Upload.uploading) return;
        document.getElementById('upload-dialog').classList.add('hidden');
        Upload.reset();
    },

    reset: function() {
        Upload.files = [];
        Upload.uploading = false;
        document.getElementById('upload-file-list').classList.add('hidden');
        document.getElementById('upload-file-list').innerHTML = '';
        document.getElementById('upload-progress-area').classList.add('hidden');
        document.getElementById('upload-progress-bar').style.width = '0%';
        document.getElementById('upload-progress-text').textContent = '';
        document.getElementById('upload-results').classList.add('hidden');
        document.getElementById('upload-results').innerHTML = '';
        document.getElementById('upload-start-btn').classList.add('hidden');
        document.getElementById('upload-dropzone').classList.remove('hidden');
    },

    addFiles: function(fileList) {
        var validExts = ['.mp3', '.m4a', '.aac', '.mp4', '.flac', '.wav'];
        for (var i = 0; i < fileList.length; i++) {
            var file = fileList[i];
            var ext = '.' + file.name.split('.').pop().toLowerCase();
            if (validExts.indexOf(ext) === -1) continue;
            // Avoid adding the same file twice
            var isDupe = Upload.files.some(function(f) {
                return f.name === file.name && f.size === file.size;
            });
            if (!isDupe) Upload.files.push(file);
        }
        Upload.renderFileList();
    },

    renderFileList: function() {
        var listEl = document.getElementById('upload-file-list');
        var startBtn = document.getElementById('upload-start-btn');

        if (Upload.files.length === 0) {
            listEl.classList.add('hidden');
            startBtn.classList.add('hidden');
            return;
        }

        listEl.classList.remove('hidden');
        startBtn.classList.remove('hidden');
        startBtn.textContent = 'Upload ' + Upload.files.length + ' file' +
            (Upload.files.length !== 1 ? 's' : '');
        listEl.innerHTML = '';

        Upload.files.forEach(function(file, idx) {
            var item = document.createElement('div');
            item.className = 'upload-file-item';

            var info = document.createElement('span');
            info.className = 'upload-file-info';
            info.textContent = file.name + ' (' + Upload.formatSize(file.size) + ')';

            var removeBtn = document.createElement('span');
            removeBtn.className = 'upload-file-remove';
            removeBtn.textContent = '\u00d7';
            removeBtn.title = 'Remove';
            removeBtn.addEventListener('click', function() {
                Upload.files.splice(idx, 1);
                Upload.renderFileList();
            });

            item.appendChild(info);
            item.appendChild(removeBtn);
            listEl.appendChild(item);
        });
    },

    formatSize: function(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    startUpload: function() {
        if (Upload.uploading || Upload.files.length === 0) return;
        Upload.uploading = true;

        document.getElementById('upload-start-btn').classList.add('hidden');
        document.getElementById('upload-dropzone').classList.add('hidden');
        document.getElementById('upload-progress-area').classList.remove('hidden');

        var totalFiles = Upload.files.length;
        var allResults = { added: [], duplicates: [], errors: [] };
        var fileIndex = 0;

        function uploadNext() {
            if (fileIndex >= totalFiles) {
                Upload.showResults(allResults);
                return;
            }

            var file = Upload.files[fileIndex];
            var formData = new FormData();
            formData.append('files', file);

            var xhr = new XMLHttpRequest();

            xhr.upload.onprogress = function(e) {
                if (e.lengthComputable) {
                    var filePct = Math.round((e.loaded / e.total) * 100);
                    var overallPct = Math.round(((fileIndex + filePct / 100) / totalFiles) * 100);
                    document.getElementById('upload-progress-bar').style.width = overallPct + '%';
                    document.getElementById('upload-progress-text').textContent =
                        'Uploading ' + (fileIndex + 1) + ' of ' + totalFiles + ': ' +
                        file.name + ' (' + filePct + '%)';
                }
            };

            xhr.onload = function() {
                if (xhr.status === 200) {
                    try {
                        var result = JSON.parse(xhr.responseText);
                        allResults.added = allResults.added.concat(result.added || []);
                        allResults.duplicates = allResults.duplicates.concat(result.duplicates || []);
                        allResults.errors = allResults.errors.concat(result.errors || []);
                    } catch (e) {
                        allResults.errors.push({ filename: file.name, reason: 'Invalid server response' });
                    }
                } else if (xhr.status === 413) {
                    allResults.errors.push({ filename: file.name, reason: 'File too large' });
                } else {
                    allResults.errors.push({ filename: file.name, reason: 'Upload failed (status ' + xhr.status + ')' });
                }
                fileIndex++;
                uploadNext();
            };

            xhr.onerror = function() {
                allResults.errors.push({ filename: file.name, reason: 'Network error' });
                fileIndex++;
                uploadNext();
            };

            xhr.open('POST', '/api/library/upload');
            xhr.send(formData);
        }

        uploadNext();
    },

    showResults: function(results) {
        Upload.uploading = false;
        document.getElementById('upload-progress-area').classList.add('hidden');

        var resultsEl = document.getElementById('upload-results');
        resultsEl.classList.remove('hidden');
        var html = '<div class="upload-results-summary">';

        if (results.added.length > 0) {
            html += '<div class="upload-result-section">';
            html += '<strong class="upload-result-added">Added (' + results.added.length + ')</strong>';
            results.added.forEach(function(item) {
                html += '<div class="upload-result-item">' +
                    Upload.escapeHtml(item.artist || 'Unknown') + ' - ' +
                    Upload.escapeHtml(item.title || item.filename) + '</div>';
            });
            html += '</div>';
        }

        if (results.duplicates.length > 0) {
            html += '<div class="upload-result-section">';
            html += '<strong class="upload-result-duplicate">Duplicates (' + results.duplicates.length + ')</strong>';
            results.duplicates.forEach(function(item) {
                html += '<div class="upload-result-item">' +
                    Upload.escapeHtml(item.filename) + ' (already in library)</div>';
            });
            html += '</div>';
        }

        if (results.errors.length > 0) {
            html += '<div class="upload-result-section">';
            html += '<strong class="upload-result-error">Errors (' + results.errors.length + ')</strong>';
            results.errors.forEach(function(item) {
                html += '<div class="upload-result-item">' +
                    Upload.escapeHtml(item.filename) + ': ' +
                    Upload.escapeHtml(item.reason) + '</div>';
            });
            html += '</div>';
        }

        html += '</div>';
        resultsEl.innerHTML = html;

        // Refresh library view if anything was added
        if (results.added.length > 0) {
            if (WebPod.currentView === 'albums') {
                Library.loadAlbums();
            } else if (WebPod.currentView === 'tracks') {
                Library.tracksPage = 1;
                Library.loadTracks(Library.tracksSearch, Library.tracksSort);
            }
            WebPod.toast(results.added.length + ' track' +
                (results.added.length !== 1 ? 's' : '') + ' uploaded', 'success');
        }
    },

    escapeHtml: function(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

document.addEventListener('DOMContentLoaded', Upload.init);
