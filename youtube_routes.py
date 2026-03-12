import re
import logging
import requests as http_requests
import yt_dlp
from concurrent.futures import ThreadPoolExecutor
from flask import Blueprint, request, jsonify, session
from utils import get_real_ip
from flashcard_service import generate_flashcards, generate_notes
from database import save_document, save_flashcards, log_user_activity

logger = logging.getLogger(__name__)

# ============================================================================
# BLUEPRINT SETUP
# ============================================================================

youtube_bp = Blueprint('youtube', __name__)

# Regex patterns for extracting YouTube video IDs
_YT_PATTERNS = [
    re.compile(r'(?:youtube\.com/watch\?.*v=)([\w-]{11})'),
    re.compile(r'(?:youtu\.be/)([\w-]{11})'),
    re.compile(r'(?:youtube\.com/shorts/)([\w-]{11})'),
    re.compile(r'(?:youtube\.com/embed/)([\w-]{11})'),
]


def _extract_video_id(url):
    """Extract the 11-character video ID from various YouTube URL formats."""
    for pattern in _YT_PATTERNS:
        match = pattern.search(url)
        if match:
            return match.group(1)
    return None


def _fetch_transcript(video_id):
    """
    Fetch transcript using yt-dlp (reliable) and return (title, transcript_text).
    Prefers manual English subs, falls back to auto-generated.
    """
    ydl_opts = {
        'skip_download': True,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'subtitleslangs': ['en'],
        'quiet': True,
        'no_warnings': True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(
            f'https://www.youtube.com/watch?v={video_id}', download=False
        )

    title = info.get('title', f'YouTube Video {video_id}')

    # Prefer manual subs, fall back to auto-generated
    subs = info.get('subtitles', {})
    auto_subs = info.get('automatic_captions', {})
    en_subs = subs.get('en') or auto_subs.get('en')

    if not en_subs:
        raise ValueError('no_transcript')

    # Get json3 format for clean structured text
    json3_url = next((f['url'] for f in en_subs if f['ext'] == 'json3'), None)
    if not json3_url:
        raise ValueError('no_transcript')

    resp = http_requests.get(json3_url, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    # Extract text from json3 segments
    text_parts = []
    for event in data.get('events', []):
        for seg in event.get('segs', []):
            text = seg.get('utf8', '').strip()
            if text and text != '\n':
                text_parts.append(text)

    transcript = ' '.join(text_parts)
    return title, transcript


# ============================================================================
# ROUTES
# ============================================================================

@youtube_bp.route('/api/youtube/import', methods=['POST'])
def import_youtube():
    """Import a YouTube video transcript and generate flashcards + notes."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    data = request.get_json() or {}
    url = data.get('url', '').strip()
    max_flashcards = data.get('max_flashcards')  # optional cap

    if not url:
        return jsonify({'success': False, 'message': 'Please enter a YouTube URL.'}), 400

    # Extract video ID
    video_id = _extract_video_id(url)
    if not video_id:
        return jsonify({
            'success': False,
            'message': 'Please enter a valid YouTube URL (e.g., youtube.com/watch?v=...).'
        }), 400

    user_id = session['user_id']

    # Fetch transcript via yt-dlp
    try:
        logger.info(f"Fetching transcript for video {video_id}")
        video_title, transcript_text = _fetch_transcript(video_id)
    except ValueError as e:
        if 'no_transcript' in str(e):
            return jsonify({
                'success': False,
                'message': "This video doesn't have English captions or subtitles available."
            }), 400
        return jsonify({'success': False, 'message': str(e)}), 400
    except yt_dlp.utils.DownloadError as e:
        error_str = str(e).lower()
        if 'private' in error_str or 'unavailable' in error_str:
            return jsonify({
                'success': False,
                'message': 'This video is private or unavailable. Check the URL and try again.'
            }), 400
        logger.error(f"yt-dlp error for {video_id}: {e}")
        return jsonify({
            'success': False,
            'message': 'Could not access this YouTube video. Check the URL and try again.'
        }), 400
    except Exception as e:
        logger.error(f"YouTube transcript error for {video_id}: {e}")
        return jsonify({
            'success': False,
            'message': 'Failed to fetch video transcript. Please try again in a moment.'
        }), 503

    if not transcript_text or len(transcript_text.strip()) < 50:
        return jsonify({
            'success': False,
            'message': 'The transcript is too short to generate meaningful content.'
        }), 400

    # Generate flashcards and notes in parallel to cut processing time in half
    try:
        logger.info(f"Generating flashcards + notes from YouTube transcript ({len(transcript_text)} chars)")
        with ThreadPoolExecutor(max_workers=2) as executor:
            fc_future = executor.submit(generate_flashcards, transcript_text)
            notes_future = executor.submit(generate_notes, transcript_text, 'youtube')

            flashcards = fc_future.result()
            # Apply optional cap from the slider
            if max_flashcards and isinstance(max_flashcards, int) and max_flashcards > 0:
                flashcards = flashcards[:max_flashcards]

            try:
                notes = notes_future.result()
            except Exception:
                notes = transcript_text  # Fallback to raw transcript
    except ValueError as e:
        return jsonify({'success': False, 'message': str(e)}), 500

    # Save document to DB
    display_title = f"YouTube: {video_title}"
    doc_id = save_document(
        user_id=user_id,
        filename=video_id,
        original_filename=display_title,
        file_type='youtube',
        file_path='',
        markdown_text=notes,
    )

    # Save flashcards
    save_flashcards(doc_id, user_id, flashcards)

    logger.info(f"YouTube import complete: doc_id={doc_id}, {len(flashcards)} flashcards")
    log_user_activity(user_id, session.get('username'), 'youtube_import',
                      detail=f"{display_title} — {len(flashcards)} flashcards generated",
                      ip_address=get_real_ip())

    return jsonify({
        'success': True,
        'document_id': doc_id,
        'filename': display_title,
        'flashcards_generated': len(flashcards),
        'message': f'Generated {len(flashcards)} flashcards from "{video_title}"!'
    })