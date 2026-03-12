import os
import base64
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, session
from werkzeug.security import check_password_hash
from database import (
    get_user_by_id,
    update_user_profile_picture,
    update_user_banner,
    update_username,
    delete_user_account,
    create_password_reset_token,
)
from validators import validate_username
from email_service import send_password_reset_email

logger = logging.getLogger(__name__)

# ============================================================================
# BLUEPRINT SETUP
# ============================================================================

profile_bp = Blueprint('profile', __name__)

ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB

# MIME type map for base64 data URIs
MIME_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
}


def _allowed_image(filename):
    """Check if file has an allowed image extension."""
    ext = os.path.splitext(filename)[1].lower()
    return ext in ALLOWED_IMAGE_EXTENSIONS


def _file_to_base64(file):
    """
    Convert an uploaded image file to a base64 data URI.
    Stored directly in the database — survives Railway redeploys.
    Returns data URI string or None on failure.
    """
    if not file or not file.filename:
        return None

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return None

    # Check file size
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_IMAGE_SIZE:
        return None

    mime = MIME_TYPES.get(ext, 'image/jpeg')
    data = base64.b64encode(file.read()).decode('utf-8')
    return f"data:{mime};base64,{data}"


# ============================================================================
# ROUTES
# ============================================================================

@profile_bp.route('/api/profile', methods=['GET'])
def get_profile():
    """Return the logged-in user's profile data."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    user = get_user_by_id(session['user_id'])
    if not user:
        return jsonify({'success': False, 'message': 'User not found'}), 404

    return jsonify({
        'success': True,
        'profile': {
            'username': user['username'],
            'email': user['email'],
            'profile_picture': user['profile_picture'] if user['profile_picture'] else None,
            'banner': user['banner'] if user['banner'] else None,
            'created_at': user['created_at'],
        }
    })


@profile_bp.route('/api/profile/picture', methods=['POST'])
def upload_picture():
    """Upload a new profile picture — stored as base64 in the database."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file provided'}), 400

    file = request.files['file']
    if not _allowed_image(file.filename):
        return jsonify({'success': False, 'message': 'Only JPG, PNG, and WebP images are allowed'}), 400

    user_id = session['user_id']

    data_uri = _file_to_base64(file)
    if not data_uri:
        return jsonify({'success': False, 'message': 'Failed to process image. Max size is 5MB.'}), 400

    update_user_profile_picture(user_id, data_uri)

    return jsonify({
        'success': True,
        'profile_picture': data_uri,
        'message': 'Profile picture updated',
    })


@profile_bp.route('/api/profile/banner', methods=['POST'])
def upload_banner():
    """Upload a new banner image — stored as base64 in the database."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file provided'}), 400

    file = request.files['file']
    if not _allowed_image(file.filename):
        return jsonify({'success': False, 'message': 'Only JPG, PNG, and WebP images are allowed'}), 400

    user_id = session['user_id']

    data_uri = _file_to_base64(file)
    if not data_uri:
        return jsonify({'success': False, 'message': 'Failed to process image. Max size is 5MB.'}), 400

    update_user_banner(user_id, data_uri)

    return jsonify({
        'success': True,
        'banner': data_uri,
        'message': 'Banner updated',
    })


@profile_bp.route('/api/profile/username', methods=['PUT'])
def change_username():
    """Change the logged-in user's username."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    data = request.get_json()
    if not data or 'username' not in data:
        return jsonify({'success': False, 'message': 'No username provided'}), 400

    new_username = data['username'].strip()

    # Validate format
    is_valid, error_msg = validate_username(new_username)
    if not is_valid:
        return jsonify({'success': False, 'message': error_msg}), 400

    # Check same as current
    if new_username == session.get('username'):
        return jsonify({'success': False, 'message': 'Username is the same as current'}), 400

    # Update in database (checks uniqueness)
    updated = update_username(session['user_id'], new_username)
    if not updated:
        return jsonify({'success': False, 'message': 'Username is already taken'}), 409

    # Update session
    session['username'] = new_username

    return jsonify({'success': True, 'message': 'Username updated', 'username': new_username})


@profile_bp.route('/api/profile/reset-password', methods=['POST'])
def reset_password():
    """Send a password reset email to the logged-in user."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    user = get_user_by_id(session['user_id'])
    if not user:
        return jsonify({'success': False, 'message': 'User not found'}), 404

    # Create reset token
    token = create_password_reset_token(
        user['id'],
        request_ip=request.remote_addr,
        request_user_agent=request.headers.get('User-Agent', '')
    )

    # Build reset link
    reset_link = f"{request.host_url}?reset_token={token}"

    # Send email
    try:
        success, msg = send_password_reset_email(
            to_email=user['email'],
            username=user['username'],
            reset_link=reset_link,
            request_ip=request.remote_addr,
            request_user_agent=request.headers.get('User-Agent', ''),
            request_time=datetime.now().isoformat(),
        )
        if not success:
            logger.error(f"Failed to send reset email: {msg}")
            return jsonify({'success': False, 'message': 'Failed to send reset email. Please try again.'}), 500
    except Exception as e:
        logger.error(f"Reset email error: {e}")
        return jsonify({'success': False, 'message': 'Failed to send reset email. Please try again.'}), 500

    return jsonify({'success': True, 'message': f'Reset link sent to {user["email"]}'})


@profile_bp.route('/api/profile/account', methods=['DELETE'])
def delete_account():
    """Delete the logged-in user's account. Requires password confirmation."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    data = request.get_json()
    if not data or 'password' not in data:
        return jsonify({'success': False, 'message': 'Password is required to delete your account'}), 400

    user = get_user_by_id(session['user_id'])
    if not user:
        return jsonify({'success': False, 'message': 'User not found'}), 404

    # Verify password
    if not check_password_hash(user['password'], data['password']):
        return jsonify({'success': False, 'message': 'Incorrect password'}), 403

    user_id = session['user_id']
    username = user['username']

    # Delete all user data
    delete_user_account(user_id)

    # Clear session
    session.clear()

    logger.info(f"Account deleted: {username} (ID {user_id})")

    return jsonify({'success': True, 'message': 'Account deleted successfully'})