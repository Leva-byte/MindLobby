from flask import Blueprint, request, jsonify, session
from database import (
    log_user_activity,
    get_flashcards_for_document,
    save_quiz_result,
    get_quiz_results_for_user,
    get_quiz_history_for_document,
    get_latest_wrong_answers,
)
from flashcard_service import generate_mcq_questions

# ============================================================================
# BLUEPRINT SETUP
# ============================================================================

quiz_bp = Blueprint('quizzes', __name__)

MIN_CARDS_FOR_QUIZ = 4


# ============================================================================
# ROUTES
# ============================================================================

@quiz_bp.route('/api/quiz/generate/<int:document_id>', methods=['GET'])
def generate_quiz(document_id):
    """Generate a multiple-choice quiz from a document's flashcards."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    doc, cards = get_flashcards_for_document(document_id, session['user_id'])
    if doc is None:
        return jsonify({'success': False, 'message': 'Document not found'}), 404

    if len(cards) < MIN_CARDS_FOR_QUIZ:
        return jsonify({
            'success': False,
            'message': f'Need at least {MIN_CARDS_FOR_QUIZ} flashcards to generate a quiz',
        }), 400

    questions = generate_mcq_questions(cards)

    return jsonify({
        'success': True,
        'document_id': document_id,
        'filename': doc['original_filename'],
        'total': len(questions),
        'questions': questions,
    })


@quiz_bp.route('/api/quiz/submit', methods=['POST'])
def submit_quiz():
    """Save a completed quiz result."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    data = request.get_json() or {}
    document_id = data.get('document_id')
    score = data.get('score')
    total = data.get('total')

    if document_id is None or score is None or total is None:
        return jsonify({'success': False, 'message': 'Missing fields'}), 400

    if not isinstance(score, int) or not isinstance(total, int) or total < 1:
        return jsonify({'success': False, 'message': 'Invalid score data'}), 400

    wrong_answers = data.get('wrong_answers', [])
    result_id = save_quiz_result(document_id, session['user_id'], score, total, wrong_answers)
    log_user_activity(session['user_id'], session.get('username'), 'quiz_attempt',
                      detail=f"Score: {score}/{total} on document ID {document_id}",
                      ip_address=request.remote_addr)
    return jsonify({'success': True, 'result_id': result_id})


@quiz_bp.route('/api/quiz/results', methods=['GET'])
def get_results():
    """Return quiz result summaries grouped by document."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    results = get_quiz_results_for_user(session['user_id'])
    return jsonify({'success': True, 'results': results})


@quiz_bp.route('/api/quiz/history/<int:document_id>', methods=['GET'])
def get_history(document_id):
    """Return quiz attempt history for a specific document."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    history = get_quiz_history_for_document(document_id, session['user_id'])
    return jsonify({'success': True, 'history': history})


@quiz_bp.route('/api/quiz/heatmap/<int:document_id>', methods=['GET'])
def get_heatmap(document_id):
    """Return the most recent quiz attempt's score and wrong answers for a document."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    result, wrong_answers = get_latest_wrong_answers(document_id, session['user_id'])
    if not result:
        return jsonify({'success': False, 'message': 'No quiz attempts found'}), 404

    return jsonify({
        'success': True,
        'score': result['score'],
        'total': result['total'],
        'wrong_answers': wrong_answers,
    })