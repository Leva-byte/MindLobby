import os
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
)

# ============================================================================
# BLUEPRINT SETUP
# ============================================================================

flashcard_bp = Blueprint('flashcards', __name__)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt'}

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
        flashcards, _ = process_file_to_flashcards(file_path, safe_filename)

        # Save document record to DB
        doc_id = save_document(
            user_id=user_id,
            filename=stored_filename,
            original_filename=original_filename,
            file_type=file_ext,
            file_path=file_path,
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

    docs = get_documents_for_user(session['user_id'])
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
