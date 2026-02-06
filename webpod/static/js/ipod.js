/**
 * WebPod - iPod Panel
 * Detection, connection, playlists, iPod track management
 */
var IPod = {
    connected: false,
    currentMountpoint: null,
    selectedPlaylistId: null,
    deviceName: null,
    playlists: [],

    /**
     * Detect connected iPods and populate dropdown
     */
    detect: function() {
        WebPod.api('/api/ipod/detect').then(function(data) {
            var select = document.getElementById('ipod-select');
            select.innerHTML = '';

            var devices = data.devices || data || [];
            if (devices.length === 0) {
                var opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'No iPods detected';
                select.appendChild(opt);
            } else {
                devices.forEach(function(device) {
                    var opt = document.createElement('option');
                    opt.value = device.mountpoint || device.path || device;
                    opt.textContent = device.name || device.mountpoint || device;
                    select.appendChild(opt);
                });
            }

            // Add manual option
            var manualOpt = document.createElement('option');
            manualOpt.value = '__manual__';
            manualOpt.textContent = 'Manual...';
            select.appendChild(manualOpt);

            select.addEventListener('change', function() {
                IPod.handleDeviceSelect();
            });
        }).catch(function() {
            var select = document.getElementById('ipod-select');
            select.innerHTML = '<option value="">Detection failed</option>';
            var manualOpt = document.createElement('option');
            manualOpt.value = '__manual__';
            manualOpt.textContent = 'Manual...';
            select.appendChild(manualOpt);
        });
    },

    /**
     * Handle device selection change
     */
    handleDeviceSelect: function() {
        var select = document.getElementById('ipod-select');
        if (select.value === '__manual__') {
            // Replace select with text input temporarily
            var input = document.createElement('input');
            input.type = 'text';
            input.id = 'ipod-manual-input';
            input.placeholder = '/mnt/ipod';
            input.style.width = '100%';
            select.style.display = 'none';
            select.parentNode.insertBefore(input, select.nextSibling);
            input.focus();

            // Allow pressing Enter to confirm
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    IPod.currentMountpoint = input.value.trim();
                    input.remove();
                    select.style.display = '';
                    if (IPod.currentMountpoint) {
                        IPod.connect();
                    }
                } else if (e.key === 'Escape') {
                    input.remove();
                    select.style.display = '';
                    select.value = '';
                }
            });
        }
    },

    /**
     * Connect to selected iPod
     */
    connect: function() {
        var select = document.getElementById('ipod-select');
        var mountpoint = IPod.currentMountpoint || select.value;
        if (!mountpoint || mountpoint === '__manual__') {
            WebPod.toast('Please select an iPod', 'warning');
            return;
        }

        IPod.currentMountpoint = mountpoint;
        WebPod.api('/api/ipod/connect', {
            method: 'POST',
            body: { mountpoint: mountpoint }
        }).then(function(data) {
            IPod.connected = true;
            IPod.deviceName = data.name || mountpoint;
            var statusText = document.getElementById('ipod-status-text');
            statusText.textContent = 'Connected: ' + IPod.deviceName;
            statusText.style.cursor = 'pointer';
            statusText.title = 'Click to open iPod';
            document.getElementById('playlists-area').classList.remove('hidden');
            document.getElementById('connect-btn').classList.add('hidden');
            document.getElementById('disconnect-btn').classList.remove('hidden');
            document.getElementById('sync-btn').disabled = false;
            IPod.loadPlaylists();
            WebPod.toast('iPod connected', 'success');
        });
    },

    /**
     * Disconnect from iPod
     */
    disconnect: function() {
        // Exit iPod mode if active
        if (WebPod.ipodMode) {
            WebPod.exitIpodMode();
        }

        WebPod.api('/api/ipod/disconnect', { method: 'POST' }).then(function() {
            IPod.connected = false;
            IPod.currentMountpoint = null;
            IPod.selectedPlaylistId = null;
            IPod.deviceName = null;
            var statusText = document.getElementById('ipod-status-text');
            statusText.textContent = 'No iPod connected';
            statusText.style.cursor = 'default';
            statusText.title = '';
            document.getElementById('playlists-area').classList.add('hidden');
            document.getElementById('connect-btn').classList.remove('hidden');
            document.getElementById('disconnect-btn').classList.add('hidden');
            document.getElementById('sync-btn').disabled = true;
            document.getElementById('sync-btn').classList.remove('btn-pulse');
            document.getElementById('playlists-list').innerHTML = '';
            document.getElementById('ipod-tracks-tbody').innerHTML = '';
            WebPod.toast('iPod disconnected', 'info');
        });
    },

    /**
     * Load and render playlists
     */
    loadPlaylists: function() {
        WebPod.api('/api/ipod/playlists').then(function(data) {
            var list = document.getElementById('playlists-list');
            var playlists = data.playlists || data || [];
            IPod.playlists = playlists;
            list.innerHTML = '';

            playlists.forEach(function(pl) {
                var li = document.createElement('li');
                li.dataset.playlistId = pl.id;
                li.className = 'playlist-item';

                var nameSpan = document.createElement('span');
                nameSpan.className = 'playlist-name';
                nameSpan.textContent = pl.name || 'Untitled';

                var badge = document.createElement('span');
                badge.className = 'playlist-count';
                badge.textContent = pl.track_count || 0;

                li.appendChild(nameSpan);
                li.appendChild(badge);

                // Delete button (not on master playlist)
                if (!pl.is_master) {
                    var deleteBtn = document.createElement('button');
                    deleteBtn.className = 'playlist-delete';
                    deleteBtn.textContent = '\u00d7';
                    deleteBtn.title = 'Delete playlist';
                    deleteBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        IPod.deletePlaylist(pl.id, pl.name);
                    });
                    li.appendChild(deleteBtn);
                }

                // Click to select and load tracks
                li.addEventListener('click', function() {
                    var items = list.querySelectorAll('li');
                    items.forEach(function(item) { item.classList.remove('selected'); });
                    li.classList.add('selected');
                    IPod.selectedPlaylistId = pl.id;
                    IPod.loadPlaylistTracks(pl.id);
                });

                list.appendChild(li);
            });

            // Update the "Add to Playlist" dropdown
            IPod.updatePlaylistDropdown();
        });
    },

    /**
     * Load tracks for a specific playlist
     */
    loadPlaylistTracks: function(playlistId) {
        WebPod.api('/api/ipod/playlists/' + playlistId + '/tracks').then(function(data) {
            var tracks = data.tracks || data || [];
            IPod.renderIpodTracks(tracks);

            // Switch to iPod tracks view
            if (WebPod.currentView !== 'ipod-tracks') {
                WebPod.switchView('ipod-tracks');
            }
        });
    },

    /**
     * Load all iPod tracks
     */
    loadTracks: function() {
        if (!IPod.connected) {
            document.getElementById('ipod-tracks-tbody').innerHTML = '';
            return;
        }
        WebPod.api('/api/ipod/tracks').then(function(data) {
            var tracks = data.tracks || data || [];
            IPod.renderIpodTracks(tracks);
        });
    },

    /**
     * Render tracks into the iPod tracks table
     */
    renderIpodTracks: function(tracks) {
        var tbody = document.getElementById('ipod-tracks-tbody');
        tbody.innerHTML = '';

        tracks.forEach(function(track) {
            var tr = document.createElement('tr');
            tr.dataset.trackId = track.id;

            var tdTitle = document.createElement('td');
            tdTitle.textContent = track.title || 'Unknown';

            var tdArtist = document.createElement('td');
            tdArtist.textContent = track.artist || 'Unknown';

            var tdAlbum = document.createElement('td');
            tdAlbum.textContent = track.album || 'Unknown';

            var tdDuration = document.createElement('td');
            tdDuration.textContent = WebPod.formatDuration(track.duration);

            tr.appendChild(tdTitle);
            tr.appendChild(tdArtist);
            tr.appendChild(tdAlbum);
            tr.appendChild(tdDuration);

            tbody.appendChild(tr);
        });
    },

    /**
     * Show create playlist dialog
     */
    createPlaylist: function() {
        var dialog = document.getElementById('playlist-dialog');
        var input = document.getElementById('playlist-name-input');
        var cancelBtn = document.getElementById('playlist-cancel');
        var confirmBtn = document.getElementById('playlist-confirm');

        input.value = '';
        dialog.classList.remove('hidden');
        input.focus();

        function cleanup() {
            dialog.classList.add('hidden');
            cancelBtn.removeEventListener('click', onCancel);
            confirmBtn.removeEventListener('click', onConfirm);
            input.removeEventListener('keydown', onKeydown);
        }

        function onCancel() {
            cleanup();
        }

        function onConfirm() {
            var name = input.value.trim();
            if (!name) {
                WebPod.toast('Please enter a playlist name', 'warning');
                return;
            }
            WebPod.api('/api/ipod/playlists', {
                method: 'POST',
                body: { name: name }
            }).then(function() {
                WebPod.toast('Playlist "' + name + '" created', 'success');
                IPod.loadPlaylists();
                cleanup();
            });
        }

        function onKeydown(e) {
            if (e.key === 'Enter') onConfirm();
            else if (e.key === 'Escape') onCancel();
        }

        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        input.addEventListener('keydown', onKeydown);
    },

    /**
     * Delete a playlist with confirmation
     */
    deletePlaylist: function(id, name) {
        if (!confirm('Delete playlist "' + (name || 'Untitled') + '"?')) return;

        WebPod.api('/api/ipod/playlists/' + id, {
            method: 'DELETE'
        }).then(function() {
            WebPod.toast('Playlist deleted', 'success');
            IPod.selectedPlaylistId = null;
            IPod.loadPlaylists();
        });
    },

    /**
     * Show M3U import dialog
     */
    showM3UDialog: function() {
        var dialog = document.getElementById('m3u-dialog');
        var input = document.getElementById('m3u-path-input');
        var results = document.getElementById('m3u-results');
        var importBtn = document.getElementById('m3u-import');
        var addBtn = document.getElementById('m3u-add-to-ipod');

        input.value = '';
        results.classList.add('hidden');
        importBtn.classList.remove('hidden');
        addBtn.classList.add('hidden');
        dialog.classList.remove('hidden');
        input.focus();
    },

    /**
     * Load M3U file and show matched tracks
     */
    loadM3U: function() {
        var input = document.getElementById('m3u-path-input');
        var path = input.value.trim();
        if (!path) {
            WebPod.toast('Please enter a path', 'error');
            return;
        }

        WebPod.api('/api/library/import-m3u', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        }).then(function(data) {
            var results = document.getElementById('m3u-results');
            var stats = document.getElementById('m3u-stats');
            var list = document.getElementById('m3u-tracks-list');
            var importBtn = document.getElementById('m3u-import');
            var addBtn = document.getElementById('m3u-add-to-ipod');

            stats.innerHTML = '<strong>' + data.matched_count + '</strong> tracks matched, ' +
                '<strong>' + data.unmatched_count + '</strong> not found';

            list.innerHTML = '';
            if (data.matched_tracks && data.matched_tracks.length > 0) {
                var ul = document.createElement('ul');
                ul.className = 'm3u-track-list';
                data.matched_tracks.slice(0, 20).forEach(function(track) {
                    var li = document.createElement('li');
                    li.textContent = (track.artist || 'Unknown') + ' - ' + (track.title || 'Unknown');
                    ul.appendChild(li);
                });
                if (data.matched_tracks.length > 20) {
                    var more = document.createElement('li');
                    more.textContent = '... and ' + (data.matched_tracks.length - 20) + ' more';
                    more.className = 'm3u-more';
                    ul.appendChild(more);
                }
                list.appendChild(ul);
            }

            results.classList.remove('hidden');
            importBtn.classList.add('hidden');
            addBtn.classList.remove('hidden');

            // Store matched track IDs for adding
            IPod._m3uMatchedIds = data.matched_tracks.map(function(t) { return t.id; });
        }).catch(function(err) {
            WebPod.toast(err.message || 'Failed to load playlist', 'error');
        });
    },

    /**
     * Add M3U matched tracks to iPod
     */
    addM3UToIPod: function() {
        if (!IPod._m3uMatchedIds || IPod._m3uMatchedIds.length === 0) {
            WebPod.toast('No tracks to add', 'error');
            return;
        }

        WebPod.api('/api/ipod/add-tracks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_ids: IPod._m3uMatchedIds,
                playlist_id: IPod.selectedPlaylistId
            })
        }).then(function(data) {
            var msg = 'Added ' + (data.added || 0) + ' tracks';
            if (data.duplicates) msg += ' (' + data.duplicates + ' duplicates skipped)';
            WebPod.toast(msg, 'success');
            document.getElementById('m3u-dialog').classList.add('hidden');
            IPod._m3uMatchedIds = null;
            IPod.loadTracks();
        }).catch(function(err) {
            WebPod.toast(err.message || 'Failed to add tracks', 'error');
        });
    },

    /**
     * Update "Add to Playlist" dropdown with current playlists
     */
    updatePlaylistDropdown: function() {
        var list = document.getElementById('playlist-dropdown-list');
        if (!list) return;

        list.innerHTML = '';
        IPod.playlists.forEach(function(pl) {
            if (pl.is_master) return; // Skip master playlist
            var item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = pl.name;
            item.dataset.playlistId = pl.id;
            item.addEventListener('click', function() {
                IPod.addSelectedToPlaylist(pl.id, pl.name);
            });
            list.appendChild(item);
        });
    },

    /**
     * Add currently selected library tracks to a playlist
     */
    addSelectedToPlaylist: function(playlistId, playlistName) {
        // Check for expansion selection first, then fall back to tracks view selection
        var trackIds = Library.expansionSelectedIds.length > 0
            ? Library.expansionSelectedIds
            : Library.selectedTrackIds;

        if (!trackIds || trackIds.length === 0) {
            WebPod.toast('No tracks selected', 'error');
            return;
        }

        document.getElementById('playlist-dropdown').classList.add('hidden');

        WebPod.api('/api/ipod/add-tracks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_ids: trackIds,
                playlist_id: playlistId
            })
        }).then(function(data) {
            var msg = 'Added ' + (data.added || 0) + ' tracks to ' + (playlistName || 'iPod');
            if (data.duplicates) msg += ' (' + data.duplicates + ' duplicates skipped)';
            WebPod.toast(msg, 'success');

            // Clear appropriate selection
            if (Library.expansionSelectedIds.length > 0) {
                Library.expansionSelectedIds = [];
                Library.updateExpansionSelection();
            } else {
                Library.clearSelection();
            }

            IPod.loadTracks();
            IPod.loadPlaylists();
        }).catch(function(err) {
            WebPod.toast(err.message || 'Failed to add tracks', 'error');
        });
    },

    /**
     * Initialize Add All Content modal
     */
    initAddAllContent: function() {
        var dialog = document.getElementById('add-all-dialog');
        var openBtn = document.getElementById('add-all-content-btn');
        var cancelBtn = document.getElementById('add-all-cancel');
        var syncBtn = document.getElementById('add-all-sync');
        var musicCheckbox = document.getElementById('add-all-music');
        var podcastCheckbox = document.getElementById('add-all-podcasts');
        var formatSelect = document.getElementById('add-all-format');
        var musicOptions = document.getElementById('music-options');
        var summary = document.getElementById('add-all-summary');

        // Track IDs to sync
        var pendingTrackIds = [];

        // Open dialog
        openBtn.addEventListener('click', function() {
            if (!IPod.connected) {
                WebPod.toast('Connect an iPod first', 'error');
                return;
            }
            dialog.classList.remove('hidden');
            updateSummary();
        });

        // Close dialog
        cancelBtn.addEventListener('click', function() {
            dialog.classList.add('hidden');
        });

        // Toggle music options visibility
        musicCheckbox.addEventListener('change', function() {
            musicOptions.classList.toggle('hidden', !this.checked);
            updateSummary();
        });

        // Update on podcast checkbox change
        podcastCheckbox.addEventListener('change', updateSummary);

        // Update on format change
        formatSelect.addEventListener('change', updateSummary);

        // Update summary with track counts
        function updateSummary() {
            var includeMusic = musicCheckbox.checked;
            var includePodcasts = podcastCheckbox.checked;
            var format = formatSelect.value;

            if (!includeMusic && !includePodcasts) {
                summary.textContent = 'Select content to add';
                syncBtn.disabled = true;
                pendingTrackIds = [];
                return;
            }

            summary.textContent = 'Calculating...';
            syncBtn.disabled = true;

            // Build requests
            var requests = [];

            if (includeMusic) {
                var musicUrl = '/api/library/all-track-ids?type=music';
                if (format !== 'all') {
                    musicUrl += '&formats=' + format;
                }
                requests.push(WebPod.api(musicUrl).then(function(data) {
                    return { type: 'music', ids: data.track_ids, count: data.count };
                }));
            }

            if (includePodcasts) {
                requests.push(WebPod.api('/api/library/all-track-ids?type=podcast').then(function(data) {
                    return { type: 'podcast', ids: data.track_ids, count: data.count };
                }));
            }

            Promise.all(requests).then(function(results) {
                var musicCount = 0;
                var podcastCount = 0;
                pendingTrackIds = [];

                results.forEach(function(result) {
                    if (result.type === 'music') {
                        musicCount = result.count;
                        pendingTrackIds = pendingTrackIds.concat(result.ids);
                    } else {
                        podcastCount = result.count;
                        pendingTrackIds = pendingTrackIds.concat(result.ids);
                    }
                });

                var parts = [];
                if (musicCount > 0) parts.push(musicCount + ' music track' + (musicCount !== 1 ? 's' : ''));
                if (podcastCount > 0) parts.push(podcastCount + ' podcast episode' + (podcastCount !== 1 ? 's' : ''));

                if (parts.length > 0) {
                    summary.textContent = 'Will add: ' + parts.join(', ');
                    syncBtn.disabled = false;
                } else {
                    summary.textContent = 'No content found';
                    syncBtn.disabled = true;
                }
            }).catch(function(err) {
                summary.textContent = 'Error loading content';
                syncBtn.disabled = true;
            });
        }

        // Sync to iPod
        syncBtn.addEventListener('click', function() {
            if (pendingTrackIds.length === 0) return;

            syncBtn.disabled = true;
            syncBtn.textContent = 'Syncing...';

            WebPod.api('/api/ipod/add-tracks', {
                method: 'POST',
                body: { track_ids: pendingTrackIds }
            }).then(function(data) {
                var added = data.added ? data.added.length : 0;
                var skipped = data.skipped_duplicates ? data.skipped_duplicates.length : 0;
                var errors = data.errors ? data.errors.length : 0;

                var msg = 'Added ' + added + ' tracks to iPod';
                if (skipped > 0) msg += ', ' + skipped + ' duplicates skipped';
                if (errors > 0) msg += ', ' + errors + ' errors';

                WebPod.toast(msg, errors > 0 ? 'warning' : 'success');
                dialog.classList.add('hidden');
                IPod.loadTracks();

                syncBtn.textContent = 'Sync to iPod';
                syncBtn.disabled = false;
            }).catch(function(err) {
                WebPod.toast('Sync failed: ' + (err.message || 'Unknown error'), 'error');
                syncBtn.textContent = 'Sync to iPod';
                syncBtn.disabled = false;
            });
        });
    },

    /**
     * Initialize iPod module
     */
    init: function() {
        document.getElementById('connect-btn').addEventListener('click', function() {
            IPod.connect();
        });
        document.getElementById('disconnect-btn').addEventListener('click', function() {
            IPod.disconnect();
        });

        // Click on iPod status text to enter iPod Mode
        document.getElementById('ipod-status-text').addEventListener('click', function() {
            if (IPod.connected) {
                WebPod.enterIpodMode();
            }
        });

        document.getElementById('new-playlist-btn').addEventListener('click', function() {
            IPod.createPlaylist();
        });

        // M3U import handlers
        document.getElementById('import-m3u-btn').addEventListener('click', function() {
            IPod.showM3UDialog();
        });
        document.getElementById('m3u-cancel').addEventListener('click', function() {
            document.getElementById('m3u-dialog').classList.add('hidden');
        });
        document.getElementById('m3u-import').addEventListener('click', function() {
            IPod.loadM3U();
        });
        document.getElementById('m3u-add-to-ipod').addEventListener('click', function() {
            IPod.addM3UToIPod();
        });
        document.getElementById('m3u-path-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') IPod.loadM3U();
        });

        // Add to Playlist dropdown
        var addBtn = document.getElementById('add-to-playlist-btn');
        var dropdown = document.getElementById('playlist-dropdown');
        if (addBtn && dropdown) {
            addBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                dropdown.classList.toggle('hidden');
            });

            // Create new playlist option
            dropdown.querySelector('[data-action="new"]').addEventListener('click', function() {
                dropdown.classList.add('hidden');
                IPod.createPlaylist();
            });

            // Close dropdown when clicking elsewhere
            document.addEventListener('click', function() {
                dropdown.classList.add('hidden');
            });
        }

        // Initialize Add All Content modal
        IPod.initAddAllContent();
    }
};

document.addEventListener('DOMContentLoaded', IPod.init);

/**
 * iPod Mode Controller
 * Manages the dedicated iPod interface when user enters iPod Mode
 */
var IPodMode = {
    currentView: 'ipod-all-songs',
    selectedTrackIds: [],
    allTracks: [],
    lastSelectedIndex: -1,
    searchTimeout: null,

    /**
     * Load device info and storage
     */
    loadDeviceInfo: function() {
        // Update name from existing IPod status
        WebPod.api('/api/ipod/status').then(function(data) {
            var name = data.name || 'iPod';
            var nameEl = document.getElementById('ipod-mode-name');
            var toolbarNameEl = document.getElementById('toolbar-ipod-name');
            if (nameEl) nameEl.textContent = name;
            if (toolbarNameEl) toolbarNameEl.textContent = name;
        });

        // Update storage
        WebPod.api('/api/ipod/storage').then(function(data) {
            var text = data.used_gb + ' GB / ' + data.total_gb + ' GB';
            var storageTextEl = document.getElementById('ipod-mode-storage-text');
            var storageFillEl = document.getElementById('ipod-storage-fill');
            if (storageTextEl) storageTextEl.textContent = text;
            if (storageFillEl) storageFillEl.style.width = data.percent_used + '%';
        }).catch(function() {
            var storageTextEl = document.getElementById('ipod-mode-storage-text');
            if (storageTextEl) storageTextEl.textContent = 'Storage unavailable';
        });

        // Load device model info
        WebPod.api('/api/ipod/device-info').then(function(data) {
            var modelImg = document.getElementById('ipod-mode-device-img');
            var genTag = document.getElementById('ipod-mode-gen-tag');

            if (modelImg) {
                var imgPath = IPodMode.getDeviceImagePath(data.generation_string);
                modelImg.src = imgPath;
            }
            if (genTag && data.generation_string && data.generation_string !== 'Unknown') {
                var tagText = IPodMode.getGenerationTag(data.generation_string);
                genTag.textContent = tagText;
            }
        }).catch(function() {
            // Keep default unknown image
        });
    },

    /**
     * Convert generation string to short tag format (e.g., "Classic 5G", "Nano 3G")
     */
    getGenerationTag: function(generation) {
        var tagMap = {
            // Original iPods (1st-4th gen are just "iPod")
            'First Generation': 'Classic 1G',
            'Second Generation': 'Classic 2G',
            'Third Generation': 'Classic 3G',
            'Fourth Generation': 'Classic 4G',
            'Photo': 'Photo',
            'Video (First Generation)': 'Classic 5G',
            'Video (Second Generation)': 'Classic 5.5G',
            'Classic (First Generation)': 'Classic 6G',
            'Classic (Second Generation)': 'Classic 6.5G',
            'Classic (Third Generation)': 'Classic 7G',
            // Mini
            'Mini (First Generation)': 'Mini 1G',
            'Mini (Second Generation)': 'Mini 2G',
            // Shuffle
            'Shuffle (First Generation)': 'Shuffle 1G',
            'Shuffle (Second Generation)': 'Shuffle 2G',
            'Shuffle (Third Generation)': 'Shuffle 3G',
            'Shuffle (Fourth Generation)': 'Shuffle 4G',
            // Nano
            'Nano (First Generation)': 'Nano 1G',
            'Nano (Second Generation)': 'Nano 2G',
            'Nano (Third Generation)': 'Nano 3G',
            'Nano (Fourth Generation)': 'Nano 4G',
            'Nano (Fifth Generation)': 'Nano 5G',
            'Nano (Sixth Generation)': 'Nano 6G',
            'Nano (Seventh Generation)': 'Nano 7G',
            // Touch
            'Touch (First Generation)': 'Touch 1G',
            'Touch (Second Generation)': 'Touch 2G',
            'Touch (Third Generation)': 'Touch 3G',
            'Touch (Fourth Generation)': 'Touch 4G',
            'Touch (Fifth Generation)': 'Touch 5G',
            'Touch (Sixth Generation)': 'Touch 6G',
            'Touch (Seventh Generation)': 'Touch 7G'
        };
        return tagMap[generation] || '';
    },

    /**
     * Map generation string to image path
     */
    getDeviceImagePath: function(generation) {
        var basePath = '/static/img/ipod/';
        var imageMap = {
            // Full-size iPods (all mapped to classic-x.svg)
            'First Generation': 'classic-1.svg',
            'Second Generation': 'classic-2.svg',
            'Third Generation': 'classic-3.svg',
            'Fourth Generation': 'classic-4.svg',
            'Photo': 'classic-4.svg',
            'Video (First Generation)': 'classic-5.svg',
            'Video (Second Generation)': 'classic-5.svg',
            'Classic (First Generation)': 'classic-6.svg',
            'Classic (Second Generation)': 'classic-6.svg',
            'Classic (Third Generation)': 'classic-7.svg',
            // Mini
            'Mini (First Generation)': 'mini-1.svg',
            'Mini (Second Generation)': 'mini-2.svg',
            // Shuffle
            'Shuffle (First Generation)': 'shuffle-1.svg',
            'Shuffle (Second Generation)': 'shuffle-2.svg',
            'Shuffle (Third Generation)': 'shuffle-3.svg',
            'Shuffle (Fourth Generation)': 'shuffle-4.svg',
            // Nano
            'Nano (First Generation)': 'nano-1.svg',
            'Nano (Second Generation)': 'nano-2.svg',
            'Nano (Third Generation)': 'nano-3.svg',
            'Nano (Fourth Generation)': 'nano-4.svg',
            'Nano (Fifth Generation)': 'nano-5.svg',
            'Nano (Sixth Generation)': 'nano-6.svg',
            'Nano (Seventh Generation)': 'nano-7.svg',
            // Touch
            'Touch (First Generation)': 'touch-1.svg',
            'Touch (Second Generation)': 'touch-2.svg',
            'Touch (Third Generation)': 'touch-3.svg',
            'Touch (Fourth Generation)': 'touch-4.svg',
            'Touch (Fifth Generation)': 'touch-5.svg',
            'Touch (Sixth Generation)': 'touch-6.svg',
            'Touch (Seventh Generation)': 'touch-7.svg'
        };
        return basePath + (imageMap[generation] || 'unknown.svg');
    },

    /**
     * Load playlists into iPod mode sidebar
     */
    loadPlaylists: function() {
        WebPod.api('/api/ipod/playlists').then(function(data) {
            var list = document.getElementById('ipod-mode-playlists-list');
            var playlists = data.playlists || [];
            if (!list) return;
            list.innerHTML = '';

            playlists.forEach(function(pl) {
                var li = document.createElement('li');
                li.dataset.playlistId = pl.id;
                li.innerHTML = '<span class="playlist-name">' + (pl.name || 'Untitled') + '</span>' +
                               '<span class="playlist-count">' + (pl.track_count || 0) + '</span>';

                li.addEventListener('click', function() {
                    IPodMode.loadPlaylistTracks(pl.id, pl.name);
                });

                list.appendChild(li);
            });
        });
    },

    /**
     * Switch between iPod mode views
     */
    switchView: function(view) {
        IPodMode.currentView = view;

        // Update sidebar navigation
        var navItems = document.querySelectorAll('#ipod-browse-list li');
        navItems.forEach(function(item) {
            item.classList.toggle('active', item.dataset.view === view);
        });

        // Clear playlist selection when switching to browse views
        var playlistItems = document.querySelectorAll('#ipod-mode-playlists-list li');
        if (view !== 'ipod-playlist') {
            playlistItems.forEach(function(item) {
                item.classList.remove('selected');
            });
        }

        // Hide all iPod views
        ['ipod-all-songs-view', 'ipod-albums-view', 'ipod-artists-view',
         'ipod-genres-view', 'ipod-playlist-view'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        // Show selected view
        var viewEl = document.getElementById(view + '-view');
        if (viewEl) viewEl.classList.remove('hidden');

        // Load data for the view
        switch (view) {
            case 'ipod-all-songs':
                IPodMode.loadAllSongs();
                break;
            case 'ipod-albums':
                IPodMode.loadAlbums();
                break;
            case 'ipod-artists':
                IPodMode.loadArtists();
                break;
            case 'ipod-genres':
                IPodMode.loadGenres();
                break;
        }
    },

    /**
     * Load all songs on iPod
     */
    loadAllSongs: function() {
        WebPod.api('/api/ipod/tracks').then(function(data) {
            var tracks = data.tracks || [];
            IPodMode.allTracks = tracks;
            IPodMode.renderAllSongs(tracks);
        });
    },

    /**
     * Render all songs table
     */
    renderAllSongs: function(tracks) {
        var tbody = document.getElementById('ipod-all-songs-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        tracks.forEach(function(track, index) {
            var tr = document.createElement('tr');
            tr.dataset.trackId = track.id;
            tr.dataset.index = index;

            // Checkbox
            var tdCheck = document.createElement('td');
            tdCheck.className = 'col-select';
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.trackId = track.id;
            checkbox.addEventListener('change', function(e) {
                e.stopPropagation();
                IPodMode.toggleTrackSelection(track.id, index, e.target.checked);
            });
            tdCheck.appendChild(checkbox);
            tr.appendChild(tdCheck);

            // Track info columns
            ['title', 'artist', 'album', 'genre'].forEach(function(field) {
                var td = document.createElement('td');
                td.textContent = track[field] || 'Unknown';
                tr.appendChild(td);
            });

            // Duration
            var tdDuration = document.createElement('td');
            tdDuration.textContent = WebPod.formatDuration(track.duration_ms);
            tr.appendChild(tdDuration);

            // Play count
            var tdPlays = document.createElement('td');
            tdPlays.textContent = track.playcount || 0;
            tr.appendChild(tdPlays);

            // Click handler for row
            tr.addEventListener('click', function(e) {
                if (e.target.type !== 'checkbox') {
                    IPodMode.handleTrackClick(e, track.id, index);
                }
            });

            tbody.appendChild(tr);
        });
    },

    /**
     * Load albums on iPod
     */
    loadAlbums: function() {
        WebPod.api('/api/ipod/albums').then(function(data) {
            var albums = data.albums || [];
            IPodMode.renderAlbums(albums);
        });
    },

    /**
     * Render albums grid
     */
    renderAlbums: function(albums) {
        var grid = document.getElementById('ipod-albums-grid');
        if (!grid) return;
        grid.innerHTML = '';

        albums.forEach(function(album) {
            var card = document.createElement('div');
            card.className = 'album-card';

            var img = document.createElement('img');
            img.src = '/static/img/placeholder.png';
            img.alt = album.album;

            var info = document.createElement('div');
            info.className = 'album-card-info';
            info.innerHTML = '<div class="album-card-title">' + (album.album || 'Unknown') + '</div>' +
                            '<div class="album-card-artist">' + (album.artist || 'Unknown') + '</div>' +
                            '<div class="album-card-count">' + album.track_count + ' tracks</div>';

            card.appendChild(img);
            card.appendChild(info);

            card.addEventListener('click', function() {
                IPodMode.showAlbumTracks(album.album, album.artist);
            });

            grid.appendChild(card);
        });
    },

    /**
     * Show tracks for an album (temporary - shows in All Songs filtered)
     */
    showAlbumTracks: function(albumName, artistName) {
        var url = '/api/ipod/albums/' + encodeURIComponent(albumName) + '/tracks';
        if (artistName) {
            url += '?artist=' + encodeURIComponent(artistName);
        }
        WebPod.api(url).then(function(data) {
            var tracks = data.tracks || [];
            IPodMode.allTracks = tracks;
            IPodMode.renderAllSongs(tracks);

            // Switch to all songs view to show the filtered tracks
            document.getElementById('ipod-albums-view').classList.add('hidden');
            document.getElementById('ipod-all-songs-view').classList.remove('hidden');
        });
    },

    /**
     * Load artists on iPod
     */
    loadArtists: function() {
        WebPod.api('/api/ipod/artists').then(function(data) {
            var artists = data.artists || [];
            IPodMode.renderArtists(artists);
        });
    },

    /**
     * Render artists list
     */
    renderArtists: function(artists) {
        var container = document.getElementById('ipod-artists-list');
        if (!container) return;
        container.innerHTML = '';

        artists.forEach(function(artist) {
            var item = document.createElement('div');
            item.className = 'artist-item';
            item.innerHTML = '<span class="artist-name">' + artist.name + '</span>' +
                            '<span class="artist-meta">' + artist.album_count + ' albums, ' +
                            artist.track_count + ' tracks</span>';

            item.addEventListener('click', function() {
                IPodMode.loadArtistTracks(artist.name);
            });

            container.appendChild(item);
        });
    },

    /**
     * Load tracks for a specific artist
     */
    loadArtistTracks: function(artistName) {
        // Filter all tracks by artist
        WebPod.api('/api/ipod/tracks').then(function(data) {
            var tracks = (data.tracks || []).filter(function(t) {
                return (t.artist || 'Unknown Artist') === artistName;
            });
            IPodMode.allTracks = tracks;
            IPodMode.renderAllSongs(tracks);

            // Switch to all songs view
            document.getElementById('ipod-artists-view').classList.add('hidden');
            document.getElementById('ipod-all-songs-view').classList.remove('hidden');
        });
    },

    /**
     * Load genres on iPod
     */
    loadGenres: function() {
        WebPod.api('/api/ipod/genres').then(function(data) {
            var genres = data.genres || [];
            IPodMode.renderGenres(genres);
        });
    },

    /**
     * Render genres list
     */
    renderGenres: function(genres) {
        var container = document.getElementById('ipod-genres-list');
        if (!container) return;
        container.innerHTML = '';

        genres.forEach(function(genre) {
            var item = document.createElement('div');
            item.className = 'genre-item';
            item.innerHTML = '<span class="genre-name">' + genre.name + '</span>' +
                            '<span class="genre-count">' + genre.track_count + ' tracks</span>';

            item.addEventListener('click', function() {
                IPodMode.loadGenreTracks(genre.name);
            });

            container.appendChild(item);
        });
    },

    /**
     * Load tracks for a specific genre
     */
    loadGenreTracks: function(genreName) {
        // Filter all tracks by genre
        WebPod.api('/api/ipod/tracks').then(function(data) {
            var tracks = (data.tracks || []).filter(function(t) {
                return (t.genre || 'Unknown') === genreName;
            });
            IPodMode.allTracks = tracks;
            IPodMode.renderAllSongs(tracks);

            // Switch to all songs view
            document.getElementById('ipod-genres-view').classList.add('hidden');
            document.getElementById('ipod-all-songs-view').classList.remove('hidden');
        });
    },

    /**
     * Load tracks for a playlist
     */
    loadPlaylistTracks: function(playlistId, playlistName) {
        WebPod.api('/api/ipod/playlists/' + playlistId + '/tracks').then(function(data) {
            var tracks = data.tracks || [];

            // Update header
            var nameEl = document.getElementById('ipod-playlist-name');
            var countEl = document.getElementById('ipod-playlist-count');
            if (nameEl) nameEl.textContent = playlistName || 'Playlist';
            if (countEl) countEl.textContent = tracks.length + ' tracks';

            // Render tracks
            var tbody = document.getElementById('ipod-playlist-tracks-tbody');
            if (!tbody) return;
            tbody.innerHTML = '';

            tracks.forEach(function(track, index) {
                var tr = document.createElement('tr');
                tr.dataset.trackId = track.id;

                var tdNr = document.createElement('td');
                tdNr.textContent = index + 1;
                tr.appendChild(tdNr);

                ['title', 'artist', 'album'].forEach(function(field) {
                    var td = document.createElement('td');
                    td.textContent = track[field] || 'Unknown';
                    tr.appendChild(td);
                });

                var tdDuration = document.createElement('td');
                tdDuration.textContent = WebPod.formatDuration(track.duration_ms);
                tr.appendChild(tdDuration);

                tbody.appendChild(tr);
            });

            // Show playlist view, hide others
            ['ipod-all-songs-view', 'ipod-albums-view', 'ipod-artists-view', 'ipod-genres-view'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
            var playlistView = document.getElementById('ipod-playlist-view');
            if (playlistView) playlistView.classList.remove('hidden');

            // Highlight playlist in sidebar
            var items = document.querySelectorAll('#ipod-mode-playlists-list li');
            items.forEach(function(item) {
                item.classList.toggle('selected',
                    parseInt(item.dataset.playlistId) === playlistId);
            });

            // Clear browse navigation selection
            var navItems = document.querySelectorAll('#ipod-browse-list li');
            navItems.forEach(function(item) {
                item.classList.remove('active');
            });
        });
    },

    /**
     * Toggle track selection
     */
    toggleTrackSelection: function(trackId, index, selected) {
        if (selected) {
            if (IPodMode.selectedTrackIds.indexOf(trackId) === -1) {
                IPodMode.selectedTrackIds.push(trackId);
            }
        } else {
            var idx = IPodMode.selectedTrackIds.indexOf(trackId);
            if (idx >= 0) {
                IPodMode.selectedTrackIds.splice(idx, 1);
            }
        }
        IPodMode.lastSelectedIndex = index;
        IPodMode.updateSelectionUI();
    },

    /**
     * Handle track row click (for selection)
     */
    handleTrackClick: function(e, trackId, index) {
        if (e.shiftKey && IPodMode.lastSelectedIndex >= 0) {
            // Shift-click: select range
            var start = Math.min(IPodMode.lastSelectedIndex, index);
            var end = Math.max(IPodMode.lastSelectedIndex, index);
            if (!e.ctrlKey && !e.metaKey) {
                IPodMode.selectedTrackIds = [];
            }
            for (var i = start; i <= end; i++) {
                var id = IPodMode.allTracks[i].id;
                if (IPodMode.selectedTrackIds.indexOf(id) === -1) {
                    IPodMode.selectedTrackIds.push(id);
                }
            }
        } else if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd-click: toggle selection
            var idx = IPodMode.selectedTrackIds.indexOf(trackId);
            if (idx >= 0) {
                IPodMode.selectedTrackIds.splice(idx, 1);
            } else {
                IPodMode.selectedTrackIds.push(trackId);
            }
        } else {
            // Regular click: select only this track
            IPodMode.selectedTrackIds = [trackId];
        }
        IPodMode.lastSelectedIndex = index;
        IPodMode.updateSelectionUI();
    },

    /**
     * Update visual selection state
     */
    updateSelectionUI: function() {
        var rows = document.querySelectorAll('#ipod-all-songs-tbody tr');
        rows.forEach(function(row) {
            var id = parseInt(row.dataset.trackId);
            var selected = IPodMode.selectedTrackIds.indexOf(id) >= 0;
            row.classList.toggle('selected', selected);
            var checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = selected;
        });

        // Show/hide selection actions
        var actions = document.getElementById('ipod-selection-actions');
        if (actions) {
            actions.classList.toggle('hidden', IPodMode.selectedTrackIds.length === 0);
        }
    },

    /**
     * Remove selected tracks from iPod
     */
    removeSelectedTracks: function() {
        if (IPodMode.selectedTrackIds.length === 0) {
            WebPod.toast('No tracks selected', 'warning');
            return;
        }

        if (!confirm('Remove ' + IPodMode.selectedTrackIds.length + ' track(s) from iPod?')) {
            return;
        }

        WebPod.api('/api/ipod/remove-tracks', {
            method: 'POST',
            body: { track_ids: IPodMode.selectedTrackIds }
        }).then(function(data) {
            WebPod.toast('Removed ' + data.removed + ' tracks', 'success');
            IPodMode.selectedTrackIds = [];
            IPodMode.loadAllSongs();
            IPodMode.loadDeviceInfo();
        }).catch(function(err) {
            WebPod.toast('Failed to remove tracks: ' + err.message, 'error');
        });
    },

    /**
     * Filter tracks by search query
     */
    filterTracks: function(query) {
        if (!query) {
            IPodMode.renderAllSongs(IPodMode.allTracks);
            return;
        }

        query = query.toLowerCase();
        var filtered = IPodMode.allTracks.filter(function(track) {
            return (track.title || '').toLowerCase().includes(query) ||
                   (track.artist || '').toLowerCase().includes(query) ||
                   (track.album || '').toLowerCase().includes(query);
        });

        IPodMode.renderAllSongs(filtered);
    },

    /**
     * Initialize iPod Mode event handlers
     */
    init: function() {
        // Back to library button
        var backBtn = document.getElementById('back-to-library-btn');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                WebPod.exitIpodMode();
            });
        }

        // Browse navigation
        document.querySelectorAll('#ipod-browse-list li').forEach(function(item) {
            item.addEventListener('click', function() {
                IPodMode.switchView(item.dataset.view);
            });
        });

        // New playlist button
        var newPlaylistBtn = document.getElementById('ipod-mode-new-playlist-btn');
        if (newPlaylistBtn) {
            newPlaylistBtn.addEventListener('click', function() {
                IPod.createPlaylist();
            });
        }

        // Sync button
        var syncBtn = document.getElementById('ipod-mode-sync-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', function() {
                if (typeof Sync !== 'undefined') {
                    Sync.start();
                }
            });
        }

        // Export button
        var exportBtn = document.getElementById('ipod-mode-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', function() {
                WebPod.api('/api/ipod/export', { method: 'POST' }).then(function(data) {
                    WebPod.toast('Export started', 'info');
                }).catch(function(err) {
                    WebPod.toast('Export failed: ' + err.message, 'error');
                });
            });
        }

        // Remove tracks button
        var removeBtn = document.getElementById('ipod-remove-tracks-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', function() {
                IPodMode.removeSelectedTracks();
            });
        }

        // Search input
        var searchInput = document.getElementById('ipod-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                clearTimeout(IPodMode.searchTimeout);
                var query = this.value.trim();
                IPodMode.searchTimeout = setTimeout(function() {
                    IPodMode.filterTracks(query);
                }, 300);
            });
        }

        // Select all checkbox
        var selectAllCheckbox = document.getElementById('ipod-select-all');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', function() {
                if (this.checked) {
                    IPodMode.selectedTrackIds = IPodMode.allTracks.map(function(t) { return t.id; });
                } else {
                    IPodMode.selectedTrackIds = [];
                }
                IPodMode.updateSelectionUI();
            });
        }
    }
};

// Initialize IPodMode when DOM is ready
document.addEventListener('DOMContentLoaded', IPodMode.init);
