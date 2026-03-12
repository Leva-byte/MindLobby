import os
import time
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, session
from werkzeug.security import check_password_hash
from werkzeug.utils import secure_filename
from database import (
    log_user_activity,
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

PROFILE_UPLOAD_FOLDER = os.path.join('static', 'uploads', 'profiles')
BANNER_UPLOAD_FOLDER = os.path.join('static', 'uploads', 'banners')
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB


def _allowed_image(filename):
    """Check if file has an allowed image extension."""
    ext = os.path.splitext(filename)[1].lower()
    return ext in ALLOWED_IMAGE_EXTENSIONS


def _save_image(file, folder, user_id):
    """Save an uploaded image file. Returns the relative path or None."""
    if not file or not file.filename:
        return None

    if not _allowed_image(file.filename):
        return None

    # Check file size
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_IMAGE_SIZE:
        return None

    ext = os.path.splitext(file.filename)[1].lower()
    safe_name = f"{user_id}_{int(time.time())}{ext}"
    os.makedirs(folder, exist_ok=True)
    file_path = os.path.join(folder, safe_name)
    file.save(file_path)
    return file_path


def _delete_old_image(path):
    """Delete an old image file if it exists."""
    if path and os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass


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
    """Upload a new profile picture."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file provided'}), 400

    file = request.files['file']
    if not _allowed_image(file.filename):
        return jsonify({'success': False, 'message': 'Only JPG, PNG, and WebP images are allowed'}), 400

    user_id = session['user_id']

    # Delete old picture
    user = get_user_by_id(user_id)
    if user and user['profile_picture']:
        _delete_old_image(user['profile_picture'])

    path = _save_image(file, PROFILE_UPLOAD_FOLDER, user_id)
    if not path:
        return jsonify({'success': False, 'message': 'Failed to save image. Max size is 5MB.'}), 400

    update_user_profile_picture(user_id, path)

    log_user_activity(user_id, session.get('username'), 'profile_picture_update',
                      detail='Updated profile picture',
                      ip_address=request.remote_addr)
    return jsonify({
        'success': True,
        'profile_picture': path,
        'message': 'Profile picture updated',
    })


@profile_bp.route('/api/profile/banner', methods=['POST'])
def upload_banner():
    """Upload a new banner image."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file provided'}), 400

    file = request.files['file']
    if not _allowed_image(file.filename):
        return jsonify({'success': False, 'message': 'Only JPG, PNG, and WebP images are allowed'}), 400

    user_id = session['user_id']

    # Delete old banner
    user = get_user_by_id(user_id)
    if user and user['banner']:
        _delete_old_image(user['banner'])

    path = _save_image(file, BANNER_UPLOAD_FOLDER, user_id)
    if not path:
        return jsonify({'success': False, 'message': 'Failed to save image. Max size is 5MB.'}), 400

    update_user_banner(user_id, path)

    log_user_activity(user_id, session.get('username'), 'banner_update',
                      detail='Updated banner image',
                      ip_address=request.remote_addr)
    return jsonify({
        'success': True,
        'banner': path,
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

    old_username = session.get('username')
    # Update session
    session['username'] = new_username

    log_user_activity(session['user_id'], new_username, 'username_change',
                      detail=f'Changed username: "{old_username}" → "{new_username}"',
                      ip_address=request.remote_addr)
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

    log_user_activity(session['user_id'], session.get('username'), 'password_reset_request',
                      detail=f'Reset email sent to {user["email"]}',
                      ip_address=request.remote_addr)
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

    # Delete all user data and get file paths to clean up
    file_paths = delete_user_account(user_id)

    # Delete physical files
    for path in file_paths:
        if path and os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass

    log_user_activity(user_id, username, 'account_delete',
                      detail=f'Account permanently deleted',
                      ip_address=request.remote_addr)

    # Clear session
    session.clear()

    logger.info(f"Account deleted: {username} (ID {user_id})")

    return jsonify({'success': True, 'message': 'Account deleted successfully'})
