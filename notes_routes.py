from flask import Blueprint, jsonify, session
from database import get_db_connection

# ============================================================================
# BLUEPRINT SETUP
# ============================================================================

notes_bp = Blueprint('notes', __name__)


# ============================================================================
# ROUTES
# ============================================================================

@notes_bp.route('/api/documents/<int:document_id>/notes', methods=['GET'])
def get_document_notes(document_id):
    """
    Return the raw MarkItDown-extracted markdown text for a specific document.
    This is used by the Notes panel to display the lecture content before
    the user dives into flashcards or quizzes.
    """
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    user_id = session['user_id']
    conn = get_db_connection()

    row = conn.execute(
        'SELECT id, original_filename, markdown_text FROM documents WHERE id = ? AND user_id = ?',
        (document_id, user_id)
    ).fetchone()

    conn.close()

    if row is None:
        return jsonify({'success': False, 'message': 'Document not found'}), 404

    markdown = row['markdown_text'] or ''

    if not markdown:
        return jsonify({
            'success': False,
            'message': 'No notes available for this document. It may have been uploaded before this feature was added.',
        }), 404

    return jsonify({
        'success': True,
        'document_id': document_id,
        'filename': row['original_filename'],
        'markdown': markdown,
    })