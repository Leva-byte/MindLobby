import os
from datetime import datetime
from flask import Blueprint, request, jsonify, session
from werkzeug.utils import secure_filename
from flashcard_service import process_file_to_flashcards
from database import (
    save_document,
    save_flashcards,
    get_documents_for_user,
    get_flashcards_for_document,
    rename_document,
    delete_document_and_flashcards,
    get_topics_for_all_documents,
    get_db_connection,
    get_user_by_id,
)

# ============================================================================
# BLUEPRINT SETUP
# ============================================================================

flashcard_bp = Blueprint('flashcards', __name__)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'pptx', 'txt'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ============================================================================
# ROUTES
# ============================================================================

@flashcard_bp.route('/api/upload', methods=['POST'])
def upload_document():
    """
    Accepts a file upload, extracts text, generates flashcards via OpenRouter,
    and saves everything to mindlobby.db using the shared database module.
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    user_id = session['user_id']

    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file provided'}), 400

    file = request.files['file']

    if not file.filename:
        return jsonify({'success': False, 'message': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'success': False, 'message': 'File type not allowed'}), 400

    # Save file to the uploads folder
    original_filename = file.filename
    safe_filename = secure_filename(original_filename)
    # Prefix with user_id to avoid name collisions between users
    stored_filename = f"{user_id}_{safe_filename}"
    file_path = os.path.join(UPLOAD_FOLDER, stored_filename)
    file.save(file_path)

    file_ext = safe_filename.rsplit('.', 1)[1].lower()

    try:
        # Extract text -> generate flashcards via OpenRouter
        flashcards, markdown_text = process_file_to_flashcards(file_path, safe_filename)

        # Save document record to DB
        doc_id = save_document(
            user_id=user_id,
            filename=stored_filename,
            original_filename=original_filename,
            file_type=file_ext,
            file_path=file_path,
            markdown_text=markdown_text,
        )

        # Save all flashcards to DB
        save_flashcards(doc_id, user_id, flashcards)

        return jsonify({
            'success': True,
            'message': f'Successfully generated {len(flashcards)} flashcards!',
            'document_id': doc_id,
            'filename': original_filename,
            'flashcards_generated': len(flashcards),
            'flashcards': flashcards,
        })

    except ValueError as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({'success': False, 'message': str(e)}), 422

    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({'success': False, 'message': f'Unexpected error: {str(e)}'}), 500


@flashcard_bp.route('/api/documents', methods=['GET'])
def get_documents():
    """Return all documents uploaded by the logged-in user."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    user_id = session['user_id']
    docs = get_documents_for_user(user_id)
    topic_map = get_topics_for_all_documents(user_id)
    for doc in docs:
        doc['topics'] = topic_map.get(doc['id'], [])
    return jsonify({'success': True, 'documents': docs})


@flashcard_bp.route('/api/flashcards/<int:document_id>', methods=['GET'])
def get_flashcards(document_id):
    """Return all flashcards for a specific document."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    doc, cards = get_flashcards_for_document(document_id, session['user_id'])

    if doc is None:
        return jsonify({'success': False, 'message': 'Document not found'}), 404

    return jsonify({
        'success': True,
        'document_id': document_id,
        'filename': doc['original_filename'],
        'flashcards': cards,
    })


@flashcard_bp.route('/api/documents/<int:document_id>', methods=['DELETE'])
def delete_document(document_id):
    """Delete a document and all its flashcards."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    file_path = delete_document_and_flashcards(document_id, session['user_id'])

    if file_path is None:
        return jsonify({'success': False, 'message': 'Document not found'}), 404

    # Remove the physical file if it still exists
    if file_path and os.path.exists(file_path):
        os.remove(file_path)

    return jsonify({'success': True, 'message': 'Document and flashcards deleted'})


@flashcard_bp.route('/api/documents/<int:document_id>/rename', methods=['PATCH'])
def rename_doc(document_id):
    """Rename a document's display name."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    data = request.get_json()
    new_name = (data or {}).get('name', '').strip()

    if not new_name:
        return jsonify({'success': False, 'message': 'Name cannot be empty'}), 400

    updated = rename_document(document_id, session['user_id'], new_name)

    if not updated:
        return jsonify({'success': False, 'message': 'Document not found'}), 404

    return jsonify({'success': True, 'message': 'Document renamed'})


@flashcard_bp.route('/api/stats', methods=['GET'])
def get_stats():
    """Return dashboard statistics and recent activity for the logged-in user."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    user_id = session['user_id']
    conn = get_db_connection()

    # --- Counts ---
    topic_count = conn.execute(
        'SELECT COUNT(*) AS cnt FROM topics WHERE user_id = ?', (user_id,)
    ).fetchone()['cnt']

    flashcard_count = conn.execute(
        'SELECT COUNT(*) AS cnt FROM flashcards WHERE user_id = ?', (user_id,)
    ).fetchone()['cnt']

    # --- Account created_at (for "study time" elapsed) ---
    user = get_user_by_id(user_id)
    created_at = user['created_at'] if user else None

    # --- Recent Activity (last 20 events, newest first) ---
    # We build a UNION of event types: account creation, document uploads,
    # topic creations.  Each row has: event_type, title, icon, timestamp.
    activities = []

    # 1) Document uploads
    doc_rows = conn.execute('''
        SELECT original_filename, upload_date
        FROM documents WHERE user_id = ?
        ORDER BY upload_date DESC LIMIT 20
    ''', (user_id,)).fetchall()
    for r in doc_rows:
        activities.append({
            'type': 'upload',
            'text': f'Uploaded "{r["original_filename"]}"',
            'icon': 'fas fa-cloud-upload-alt',
            'time': r['upload_date'],
        })

    # 2) Topic creations
    topic_rows = conn.execute('''
        SELECT name, created_at FROM topics WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 20
    ''', (user_id,)).fetchall()
    for r in topic_rows:
        activities.append({
            'type': 'topic',
            'text': f'Created topic "{r["name"]}"',
            'icon': 'fas fa-folder-plus',
            'time': r['created_at'],
        })

    # 3) Room history (multiplayer sessions — future-proof)
    try:
        room_rows = conn.execute('''
            SELECT room_code, created_at FROM room_history WHERE host_id = ?
            ORDER BY created_at DESC LIMIT 10
        ''', (user_id,)).fetchall()
        for r in room_rows:
            activities.append({
                'type': 'room',
                'text': f'Hosted study room {r["room_code"]}',
                'icon': 'fas fa-gamepad',
                'time': r['created_at'],
            })
    except Exception:
        pass  # room_history may be empty or table may not exist yet

    # 4) Account creation (always present)
    if created_at:
        activities.append({
            'type': 'account',
            'text': 'Account created — Welcome to MindLobby!',
            'icon': 'fas fa-rocket',
            'time': created_at,
        })

    conn.close()

    # Sort all activities by time descending, keep top 15
    activities.sort(key=lambda a: a['time'], reverse=True)
    activities = activities[:15]

    return jsonify({
        'success': True,
        'topics': topic_count,
        'flashcards': flashcard_count,
        'created_at': created_at,
        'activities': activities,
    })
