from flask import Blueprint, request, jsonify, session
from database import (
    log_user_activity,
    create_topic,
    get_topics_for_user,
    get_topic_by_id,
    update_topic,
    delete_topic,
    add_document_to_topic,
    remove_document_from_topic,
    get_documents_for_topic,
)

# ============================================================================
# BLUEPRINT SETUP
# ============================================================================

topics_bp = Blueprint('topics', __name__)

VALID_COLORS = [
    '#7c77c6', '#e74c3c', '#e67e22', '#f1c40f',
    '#2ecc71', '#1abc9c', '#3498db', '#9b59b6',
    '#e91e63', '#00bcd4',
]


# ============================================================================
# TOPIC CRUD ROUTES
# ============================================================================

@topics_bp.route('/api/topics', methods=['GET'])
def list_topics():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    topics = get_topics_for_user(session['user_id'])
    return jsonify({'success': True, 'topics': topics})


@topics_bp.route('/api/topics', methods=['POST'])
def create_new_topic():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    data = request.get_json() or {}
    name = data.get('name', '').strip()
    color = data.get('color', '#7c77c6').strip()

    if not name:
        return jsonify({'success': False, 'message': 'Topic name is required'}), 400
    if len(name) > 80:
        return jsonify({'success': False, 'message': 'Topic name too long (max 80 chars)'}), 400
    if color not in VALID_COLORS:
        color = '#7c77c6'

    topic_id = create_topic(session['user_id'], name, color)
    log_user_activity(session['user_id'], session.get('username'), 'topic_create',
                      detail=f'Created topic: "{name}"',
                      ip_address=request.remote_addr)
    return jsonify({'success': True, 'topic_id': topic_id, 'message': f'Topic "{name}" created'})


@topics_bp.route('/api/topics/<int:topic_id>', methods=['GET'])
def get_topic(topic_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    topic = get_topic_by_id(topic_id, session['user_id'])
    if not topic:
        return jsonify({'success': False, 'message': 'Topic not found'}), 404
    return jsonify({'success': True, 'topic': topic})


@topics_bp.route('/api/topics/<int:topic_id>', methods=['PATCH'])
def edit_topic(topic_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    data = request.get_json() or {}
    name = data.get('name', None)
    color = data.get('color', None)

    if name is not None:
        name = name.strip()
        if not name:
            return jsonify({'success': False, 'message': 'Name cannot be empty'}), 400
        if len(name) > 80:
            return jsonify({'success': False, 'message': 'Topic name too long'}), 400
    if color is not None and color not in VALID_COLORS:
        return jsonify({'success': False, 'message': 'Invalid color'}), 400

    updated = update_topic(topic_id, session['user_id'], name=name, color=color)
    if not updated:
        return jsonify({'success': False, 'message': 'Topic not found'}), 404
    changes = []
    if name is not None:
        changes.append(f'name="{name}"')
    if color is not None:
        changes.append(f'color={color}')
    log_user_activity(session['user_id'], session.get('username'), 'topic_update',
                      detail=f"Updated topic #{topic_id}: {', '.join(changes)}",
                      ip_address=request.remote_addr)
    return jsonify({'success': True, 'message': 'Topic updated'})


@topics_bp.route('/api/topics/<int:topic_id>', methods=['DELETE'])
def remove_topic(topic_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    deleted = delete_topic(topic_id, session['user_id'])
    if not deleted:
        return jsonify({'success': False, 'message': 'Topic not found'}), 404
    log_user_activity(session['user_id'], session.get('username'), 'topic_delete',
                      detail=f"Deleted topic #{topic_id}",
                      ip_address=request.remote_addr)
    return jsonify({'success': True, 'message': 'Topic deleted'})


# ============================================================================
# DOCUMENT-TOPIC LINKING ROUTES
# ============================================================================

@topics_bp.route('/api/topics/<int:topic_id>/documents', methods=['GET'])
def list_topic_documents(topic_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    topic = get_topic_by_id(topic_id, session['user_id'])
    if not topic:
        return jsonify({'success': False, 'message': 'Topic not found'}), 404
    docs = get_documents_for_topic(topic_id, session['user_id'])
    return jsonify({'success': True, 'topic': topic, 'documents': docs})


@topics_bp.route('/api/topics/<int:topic_id>/documents/<int:document_id>', methods=['POST'])
def link_document(topic_id, document_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    ok = add_document_to_topic(document_id, topic_id, session['user_id'])
    if not ok:
        return jsonify({'success': False, 'message': 'Document or topic not found, or already linked'}), 400
    return jsonify({'success': True, 'message': 'Document added to topic'})


@topics_bp.route('/api/topics/<int:topic_id>/documents/<int:document_id>', methods=['DELETE'])
def unlink_document(topic_id, document_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401
    ok = remove_document_from_topic(document_id, topic_id, session['user_id'])
    if not ok:
        return jsonify({'success': False, 'message': 'Link not found'}), 404
    return jsonify({'success': True, 'message': 'Document removed from topic'})
