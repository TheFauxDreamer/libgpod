"""M3U/M3U8 playlist parser for WebPod."""

import os
from pathlib import Path


def parse_m3u(file_path):
    """
    Parse an M3U or M3U8 playlist file.

    Args:
        file_path: Path to the .m3u or .m3u8 file

    Returns:
        List of dicts with track info:
        [{'path': '/path/to/song.mp3', 'title': 'Artist - Title', 'duration': 123}, ...]
    """
    tracks = []
    playlist_dir = os.path.dirname(os.path.abspath(file_path))

    current_info = {}

    # Try different encodings
    for encoding in ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']:
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                lines = f.readlines()
            break
        except UnicodeDecodeError:
            continue
    else:
        return []  # Could not decode file

    for line in lines:
        line = line.strip()

        if not line:
            continue

        if line.startswith('#EXTM3U'):
            # Header, skip
            continue

        if line.startswith('#EXTINF:'):
            # Extended info: #EXTINF:duration,title
            try:
                info_part = line[8:]  # Remove '#EXTINF:'
                if ',' in info_part:
                    duration_str, title = info_part.split(',', 1)
                    current_info['duration'] = int(float(duration_str))
                    current_info['title'] = title.strip()
                else:
                    current_info['duration'] = int(float(info_part))
            except (ValueError, IndexError):
                pass
            continue

        if line.startswith('#'):
            # Other comment/directive, skip
            continue

        # This is a file path
        track_path = line

        # Handle relative paths
        if not os.path.isabs(track_path):
            track_path = os.path.join(playlist_dir, track_path)

        # Normalize path
        track_path = os.path.normpath(track_path)

        tracks.append({
            'path': track_path,
            'title': current_info.get('title', ''),
            'duration': current_info.get('duration', 0)
        })

        current_info = {}

    return tracks


def match_tracks_to_library(m3u_tracks, library_tracks):
    """
    Match M3U track paths to library tracks.

    Args:
        m3u_tracks: List of dicts from parse_m3u()
        library_tracks: List of library track dicts with 'filepath' key

    Returns:
        Tuple of (matched_ids, unmatched_paths)
    """
    # Build lookup by normalized path and by filename
    path_to_id = {}
    filename_to_ids = {}

    for track in library_tracks:
        filepath = track.get('filepath', '')
        track_id = track.get('id')

        if filepath and track_id:
            # Exact path match
            norm_path = os.path.normpath(filepath)
            path_to_id[norm_path] = track_id
            path_to_id[norm_path.lower()] = track_id

            # Filename match (fallback)
            filename = os.path.basename(filepath).lower()
            if filename not in filename_to_ids:
                filename_to_ids[filename] = []
            filename_to_ids[filename].append(track_id)

    matched_ids = []
    unmatched_paths = []

    for m3u_track in m3u_tracks:
        track_path = m3u_track['path']
        norm_path = os.path.normpath(track_path)

        # Try exact path match
        if norm_path in path_to_id:
            matched_ids.append(path_to_id[norm_path])
            continue

        # Try case-insensitive path match
        if norm_path.lower() in path_to_id:
            matched_ids.append(path_to_id[norm_path.lower()])
            continue

        # Try filename match
        filename = os.path.basename(track_path).lower()
        if filename in filename_to_ids and len(filename_to_ids[filename]) == 1:
            matched_ids.append(filename_to_ids[filename][0])
            continue

        # No match found
        unmatched_paths.append(track_path)

    return matched_ids, unmatched_paths
