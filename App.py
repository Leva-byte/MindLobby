import random
import string
import os
import uuid
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, jsonify, session, abort
from flask_socketio import SocketIO, join_room, leave_room, emit
from werkzeug.security import check_password_hash
import logging

# ============================================================================
# ORIGINAL IMPORTS (UNCHANGED)
# ============================================================================
from database import (
    init_db,
    create_user,
    get_user_by_email,
    get_user_by_username,
    get_user_by_id,
    update_last_login,
    create_otp,
    verify_otp,
    create_password_reset_token,
    verify_reset_token,
    mark_reset_token_used,
    update_user_password,
    get_documents_for_user,
    get_flashcards_for_document,
    get_all_documents_admin,
    admin_delete_document_by_id,
    create_document_report,
    get_reports_for_document,
    update_report_status,
    get_platform_analytics,
    get_user_settings,
    save_user_settings,
)
from validators import validate_password_strength, validate_email_format, validate_username
from email_service import send_otp_email, send_welcome_email, send_password_reset_email
from notes_routes import notes_bp
from flashcard_routes import flashcard_bp
from topics_routes import topics_bp
from chat_routes import chat_bp
from profile_routes import profile_bp
from quiz_routes import quiz_bp

# ============================================================================
# NEW: GATEKEEPER IMPORTS (ADMIN SECURITY)
# ============================================================================
try:
    from Gatekeeper import (
        init_security_tables,
        create_fingerprint,
        ban_entity,
        is_banned,
        log_admin_action,
        log_failed_login,
        get_recent_failed_attempts,
        is_valid_timezone,
        get_client_timezone,
        is_within_business_hours,
        admin_required,
        create_admin_session,
        destroy_admin_session,
        cleanup_expired_bans
    )
    GATEKEEPER_AVAILABLE = True
    print("✅ Gatekeeper security module loaded")
except ImportError as e:
    GATEKEEPER_AVAILABLE = False
    print(f"⚠️  Gatekeeper not available: {e}")
    print("   Admin features will be disabled")

app = Flask(__name__)

# Secret key - unique per app run so all sessions are invalidated on restart
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-here-change-in-production') + uuid.uuid4().hex

# SocketIO config - with Hostinger compatibility
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='threading',
    logger=True,
    engineio_logger=True,
    ping_timeout=60,
    ping_interval=25
)

# Register blueprints
app.register_blueprint(notes_bp)
app.register_blueprint(flashcard_bp)
app.register_blueprint(topics_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(quiz_bp)

# ============================================================================
# DATABASE INITIALIZATION (ENHANCED)
# ============================================================================
try:
    init_db()
    
    # Initialize security tables if Gatekeeper is available
    if GATEKEEPER_AVAILABLE:
        init_security_tables()
        logger = logging.getLogger(__name__)
        logger.info("✅ Database and security tables initialized")
    else:
        logger = logging.getLogger(__name__)
        logger.info("✅ Database initialized (security features disabled)")
        
except Exception as e:
    logger = logging.getLogger(__name__)
    logger.error(f"❌ Database initialization failed: {e}")

# Data structures to store room information
room_users = {}
room_hosts = {}              # room_code -> host socket SID
room_host_user_ids = {}      # room_code -> host's user_id (for DB access)
room_creation_time = {}
room_games = {}              # room_code -> game state dict
room_settings = {}           # room_code -> {'public': True/False}

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# NEW: ADMIN CONFIGURATION
# ============================================================================
# Generate admin URL with: python -c "import secrets; print(secrets.token_urlsafe(16))"
ADMIN_URL_PATH = os.environ.get('ADMIN_URL_PATH', 'admin-secure-2025')
EMERGENCY_TOKEN = os.environ.get('EMERGENCY_TOKEN', 'CHANGE-THIS-EMERGENCY-TOKEN')

# ============================================================================
# DEVELOPMENT MODE (Set to False in production!)
# ============================================================================
DEVELOPMENT_MODE = True  # ⚠️ Disables timezone and time window checks

# ============================================================================
# NEW: BAN CHECK MIDDLEWARE (Only if Gatekeeper available)
# ============================================================================
if GATEKEEPER_AVAILABLE:
    @app.before_request
    def check_if_banned():
        """Check if request is from banned entity before processing"""
        # Skip check for static files and emergency routes
        if request.path.startswith('/static') or 'emergency' in request.path:
            return
        
        ip_address = request.remote_addr
        fingerprint = create_fingerprint(request)
        
        if is_banned(ip_address, fingerprint):
            logger.warning(f"🚫 Banned entity blocked: IP={ip_address}")
            # Return 404 to make site appear broken (stealth)
            abort(404)

# ============================================================================
# UTILITY FUNCTIONS (UNCHANGED)
# ============================================================================
def generate_room_code(length=5):
    """Generate a random 5-character room code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

def cleanup_empty_rooms():
    """Remove empty rooms from memory"""
    empty_rooms = [room for room, users in room_users.items() if not users]
    for room in empty_rooms:
        for d in [room_users, room_hosts, room_host_user_ids, room_creation_time, room_games, room_settings]:
            d.pop(room, None)
        logger.info(f"Cleaned up empty room: {room}")

# ============================================================================
# AUTHENTICATION ROUTES (UNCHANGED - Your existing routes)
# ============================================================================
@app.route('/api/signup', methods=['POST'])
def signup():
    """Handle user registration"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        # Validation
        if not email or not username or not password:
            return jsonify({'success': False, 'message': 'All fields are required'}), 400
        
        if len(password) < 6:
            return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400
        
        # Check if user exists
        if get_user_by_email(email):
            return jsonify({'success': False, 'message': 'Email already registered'}), 400
        
        if get_user_by_username(username):
            return jsonify({'success': False, 'message': 'Username already taken'}), 400
        
        # Create user in database (email_verified defaults to 0)
        user_id = create_user(email, username, password)

        if user_id:
            # Generate and send OTP
            import random as _r
            otp_code = ''.join([str(_r.randint(0, 9)) for _ in range(6)])
            create_otp(user_id, otp_code)

            try:
                send_otp_email(email, username, otp_code)
            except Exception as e:
                logger.error(f"Failed to send OTP email: {e}")

            # Store pending user info in session for verification step
            session['pending_user_id'] = user_id
            session['pending_email'] = email
            session['pending_username'] = username

            logger.info(f"New user registered (pending OTP): {username}")
            return jsonify({
                'success': True,
                'message': 'Verification code sent to your email',
                'requires_verification': True,
            })
        else:
            return jsonify({'success': False, 'message': 'Registration failed'}), 500
        
    except Exception as e:
        logger.error(f"Signup error: {str(e)}")
        return jsonify({'success': False, 'message': 'An error occurred'}), 500

@app.route('/api/login', methods=['POST'])
def login():
    """Handle user login"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        
        # Validation
        if not email or not password:
            return jsonify({'success': False, 'message': 'Email and password required'}), 400
        
        # Get user from database
        user = get_user_by_email(email)
        if not user:
            return jsonify({'success': False, 'message': 'Invalid email or password'}), 401
        
        # Verify password
        if not check_password_hash(user['password'], password):
            return jsonify({'success': False, 'message': 'Invalid email or password'}), 401
        
        # Check if this account is banned
        if GATEKEEPER_AVAILABLE:
            if is_banned(request.remote_addr, f"user:{user['id']}"):
                logger.warning(f"Banned account login attempt: {user['username']}")
                return jsonify({'success': False, 'message': 'This account has been suspended. Please contact support.'}), 403
        
        # Update last login
        update_last_login(email)
        
        # Create session
        session['user_id'] = user['id']
        session['user_email'] = user['email']
        session['username'] = user['username']
        session['role'] = user['role']
        session['show_welcome'] = True

        logger.info(f"User logged in: {user['username']}")
        return jsonify({'success': True, 'message': 'Login successful', 'username': user['username']})
        
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return jsonify({'success': False, 'message': 'An error occurred'}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    """Handle user logout"""
    username = session.get('username', 'Unknown')
    session.clear()
    logger.info(f"User logged out: {username}")
    return jsonify({'success': True, 'message': 'Logged out successfully'})

@app.route('/check-auth', methods=['GET'])
def check_auth():
    """Check if user is authenticated"""
    if 'user_email' in session:
        show_welcome = session.pop('show_welcome', False)
        settings = get_user_settings(session['user_id'])
        return jsonify({
            'authenticated': True,
            'username': session.get('username'),
            'email': session.get('user_email'),
            'role': session.get('role', 'user'),
            'show_welcome': show_welcome,
            'settings': settings
        })
    return jsonify({'authenticated': False})

# ============================================================================
# USER SETTINGS ROUTES
# ============================================================================

@app.route('/api/settings', methods=['GET'])
def api_get_settings():
    """Return the authenticated user's settings."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    settings = get_user_settings(session['user_id'])
    return jsonify({'success': True, 'settings': settings})

@app.route('/api/settings', methods=['PUT'])
def api_save_settings():
    """Save the authenticated user's settings."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    data = request.get_json()
    if not data or 'settings' not in data:
        return jsonify({'success': False, 'message': 'Missing settings'}), 400
    save_user_settings(session['user_id'], data['settings'])
    return jsonify({'success': True})

# ============================================================================
# OTP VERIFICATION ROUTES
# ============================================================================
@app.route('/api/verify-otp', methods=['POST'])
def api_verify_otp():
    """Verify OTP code and activate user account."""
    pending_id = session.get('pending_user_id')
    if not pending_id:
        return jsonify({'success': False, 'message': 'No pending verification'}), 400

    data = request.get_json()
    otp_code = data.get('otp_code', '').strip()
    if not otp_code:
        return jsonify({'success': False, 'message': 'OTP code is required'}), 400

    if verify_otp(pending_id, otp_code):
        # OTP verified — create full session
        user = get_user_by_id(pending_id)
        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404

        session.pop('pending_user_id', None)
        session.pop('pending_email', None)
        session.pop('pending_username', None)

        session['user_id'] = user['id']
        session['user_email'] = user['email']
        session['username'] = user['username']
        session['role'] = user['role']
        session['show_welcome'] = True

        # Send welcome email (non-blocking)
        try:
            send_welcome_email(user['email'], user['username'])
        except Exception:
            pass

        logger.info(f"User verified: {user['username']}")
        return jsonify({'success': True, 'message': 'Email verified! Welcome to MindLobby!'})
    else:
        return jsonify({'success': False, 'message': 'Invalid or expired code. Please try again.'}), 400


@app.route('/api/resend-otp', methods=['POST'])
def api_resend_otp():
    """Resend OTP code to pending user."""
    pending_id = session.get('pending_user_id')
    pending_email = session.get('pending_email')
    pending_username = session.get('pending_username')

    if not pending_id or not pending_email:
        return jsonify({'success': False, 'message': 'No pending verification'}), 400

    import random as _r
    otp_code = ''.join([str(_r.randint(0, 9)) for _ in range(6)])
    create_otp(pending_id, otp_code)

    try:
        send_otp_email(pending_email, pending_username or 'User', otp_code)
    except Exception as e:
        logger.error(f"Failed to resend OTP: {e}")
        return jsonify({'success': False, 'message': 'Failed to send email. Please try again.'}), 500

    return jsonify({'success': True, 'message': 'New verification code sent!'})


# ============================================================================
# PASSWORD RESET ROUTES (LANDING PAGE FLOW)
# ============================================================================
@app.route('/api/forgot-password', methods=['POST'])
def api_forgot_password():
    """Send a password reset email."""
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    if not email:
        return jsonify({'success': False, 'message': 'Email is required'}), 400

    user = get_user_by_email(email)
    if not user:
        # Don't reveal whether the email exists
        return jsonify({'success': True, 'message': 'If that email is registered, a reset link has been sent.'})

    token = create_password_reset_token(
        user['id'],
        request_ip=request.remote_addr,
        request_user_agent=request.headers.get('User-Agent', ''),
    )

    reset_link = f"{request.host_url}?reset_token={token}"

    try:
        success, msg = send_password_reset_email(
            to_email=user['email'],
            username=user['username'],
            reset_link=reset_link,
            request_ip=request.remote_addr,
            request_user_agent=request.headers.get('User-Agent', ''),
        )
        if not success:
            logger.error(f"Reset email failed: {msg}")
    except Exception as e:
        logger.error(f"Reset email error: {e}")

    return jsonify({'success': True, 'message': 'If that email is registered, a reset link has been sent.'})


@app.route('/api/reset-password', methods=['POST'])
def api_reset_password():
    """Reset password using a valid token."""
    data = request.get_json()
    token = data.get('token', '').strip()
    new_password = data.get('new_password', '')

    if not token or not new_password:
        return jsonify({'success': False, 'message': 'Token and new password are required'}), 400

    # Validate password strength
    is_valid, error_msg = validate_password_strength(new_password)
    if not is_valid:
        return jsonify({'success': False, 'message': error_msg}), 400

    user_id = verify_reset_token(token)
    if not user_id:
        return jsonify({'success': False, 'message': 'Invalid or expired reset link. Please request a new one.'}), 400

    update_user_password(user_id, new_password)
    mark_reset_token_used(token)

    logger.info(f"Password reset completed for user ID {user_id}")
    return jsonify({'success': True, 'message': 'Password has been reset! You can now log in.'})


@app.route('/dashboard')
def dashboard():
    """User dashboard - requires authentication"""
    if 'user_email' not in session:
        return redirect('/')
    
    return render_template('Dashboard.html', 
                          username=session.get('username'),
                          role=session.get('role', 'user'))

# ============================================================================
# PAGE ROUTES (UNCHANGED - Your existing routes)
# ============================================================================
@app.route('/')
def index():
    """Render the main platform landing page (redirects to studio if logged in)"""
    # If there's a reset_token, always show Home.html so the JS can open the reset modal
    if request.args.get('reset_token'):
        session.clear()  # Log out so the reset flow works cleanly
        return render_template('Home.html')
    if 'user_email' in session:
        return redirect('/studio')
    return render_template('Home.html')

@app.route('/quickplay')
def quickplay():
    """Render the quick play page"""
    return render_template('Index.html')

@app.route('/home')
def home():
    """Render the main platform landing page (redirects to studio if logged in)"""
    if request.args.get('reset_token'):
        session.clear()
        return render_template('Home.html')
    if 'user_email' in session:
        return redirect('/studio')
    return render_template('Home.html')

@app.route('/about')
def about():
    """Render the about page"""
    return render_template('About.html')

@app.route('/features')
def features():
    """Render the features page"""
    return render_template('Features.html') 

@app.route('/privacy')
def privacy():
    """Render the privacy page"""
    return render_template('Privacy.html')

@app.route('/terms')
def terms():
    """Render the terms and agreement page"""
    return render_template('Terms.html') 

@app.route('/contact')
def contact():
    """Render the contact page"""
    return render_template('Contacts.html')

@app.route('/api/contact', methods=['POST'])
def contact_submit():
    """Handle contact form submission"""
    from email_service import send_contact_email

    data = request.get_json()
    first_name  = (data.get('first_name') or '').strip()
    last_name   = (data.get('last_name') or '').strip()
    email       = (data.get('email') or '').strip()
    subject     = (data.get('subject') or '').strip()
    message     = (data.get('message') or '').strip()

    if not all([first_name, last_name, email, subject, message]):
        return jsonify({'success': False, 'message': 'All fields are required.'}), 400

    success, msg = send_contact_email(first_name, last_name, email, subject, message)
    if success:
        return jsonify({'success': True, 'message': 'Message sent successfully.'})
    else:
        return jsonify({'success': False, 'message': 'Failed to send message. Please try again.'}), 500

@app.route('/studio')
def studio():
    """Render the studio page - requires authentication"""
    if 'user_email' not in session:
        return redirect('/')
    
    return render_template('Studio.html',
                          username=session.get('username'),
                          role=session.get('role', 'user'))

# ============================================================================
# ROOM ROUTES (UNCHANGED - Your existing routes)
# ============================================================================
@app.route('/create_room')
def create_room():
    """Create a new room and redirect to it (requires sign-in)"""
    if 'user_id' not in session:
        return redirect('/quickplay?error=login_required')

    room_code = generate_room_code()
    while room_code in room_users:
        room_code = generate_room_code()

    username = session.get('username', '').strip()
    if not username:
        username = f"Guest{random.randint(1000, 9999)}"

    is_public = request.args.get('public', 'true').lower() == 'true'

    # Initialize room
    room_users[room_code] = []
    room_creation_time[room_code] = datetime.now()
    room_host_user_ids[room_code] = session['user_id']
    room_settings[room_code] = {'public': is_public}

    logger.info(f"Created new room: {room_code} by user: {username} (public={is_public})")
    return redirect(url_for('room', room_code=room_code, username=username))

@app.route('/join', methods=['POST'])
def join_room_route():
    """Handle joining a room via POST request"""
    room_code = request.form.get('room_code', '').strip().upper()
    username = request.form.get('username', '').strip()
    
    if not room_code:
        return redirect(url_for('index'))
    
    if not username:
        username = f"Guest{random.randint(1000, 9999)}"
    
    return redirect(url_for('room', room_code=room_code, username=username))

@app.route('/room/<room_code>')
def room(room_code):
    """Render the room page"""
    room_code = room_code.upper()
    username = request.args.get('username', '').strip()
    
    if not username:
        username = f"Guest{random.randint(1000, 9999)}"
    
    logger.info(f"User {username} accessing room {room_code}")
    return render_template('Room.html', room_code=room_code, username=username)

@app.route('/api/room/<room_code>/status')
def room_status(room_code):
    """API endpoint to get room status"""
    room_code = room_code.upper()
    
    if room_code not in room_users:
        return jsonify({'exists': False}), 404
    
    return jsonify({
        'exists': True,
        'player_count': len(room_users[room_code]),
        'players': [user['username'] for user in room_users[room_code]],
        'created': room_creation_time.get(room_code, datetime.now()).isoformat()
    })

@app.route('/api/host-documents')
def get_host_documents():
    """Return documents for the logged-in user that have 4+ flashcards."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not logged in'}), 401

    docs = get_documents_for_user(session['user_id'])
    eligible = [d for d in docs if d.get('flashcard_count', 0) >= 4]
    return jsonify({'success': True, 'documents': eligible})

# ============================================================================
# NEW: ADMIN ROUTES (Only if Gatekeeper available)
# ============================================================================
if GATEKEEPER_AVAILABLE:
    
    @app.route(f'/{ADMIN_URL_PATH}', methods=['GET', 'POST'])
    def admin_login_page():
        """Admin login page at secret URL"""
        # If already logged in as admin, redirect to dashboard
        if session.get('role') == 'admin':
            return redirect(f'/{ADMIN_URL_PATH}/dashboard')
        
        # GET: Show login form
        if request.method == 'GET':
            return render_template('admin/Login.html', admin_path=ADMIN_URL_PATH)
        
        # POST: Handle login
        try:
            data = request.form if request.form else request.get_json()
            username = data.get('username', '').strip()
            password = data.get('password', '')
            
            ip_address = request.remote_addr
            fingerprint = create_fingerprint(request)
            
            # Rate limit check
            recent_attempts = get_recent_failed_attempts(fingerprint, hours=1)
            if recent_attempts >= 5:
                ban_entity(
                    ip_address=ip_address,
                    fingerprint=fingerprint,
                    reason="Too many admin login attempts",
                    duration_hours=24
                )
                return jsonify({'success': False, 'message': 'Too many attempts'}), 429
            
            # Timezone check (skip in development mode)
            if not DEVELOPMENT_MODE:
                client_timezone = get_client_timezone(request)
                if not is_valid_timezone(client_timezone):
                    log_failed_login(ip_address, fingerprint, f"Invalid timezone: {client_timezone}")
                    return jsonify({'success': False, 'message': 'Access denied'}), 403
            
            # Time window check (skip in development mode)
            if not DEVELOPMENT_MODE:
                if not is_within_business_hours():
                    log_failed_login(ip_address, fingerprint, "Outside business hours")
                    return jsonify({'success': False, 'message': 'Access denied'}), 403
            
            # Get user
            import time
            time.sleep(0.5)  # Constant-time check
            
            user = get_user_by_username(username)
            
            if not user or user['role'] != 'admin':
                log_failed_login(ip_address, fingerprint, f"Invalid admin user: {username}")
                return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
            
            # Verify password
            if not check_password_hash(user['password'], password):
                log_failed_login(ip_address, fingerprint, f"Wrong password: {username}")
                return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
            
            # SUCCESS
            create_admin_session(user['id'], request)
            session['role'] = 'admin'
            session['username'] = username
            
            log_admin_action(user['id'], 'admin_login', f"Login from IP: {ip_address}", request)
            
            logger.info(f"✅ Admin logged in: {username}")
            
            return jsonify({'success': True, 'redirect': f'/{ADMIN_URL_PATH}/dashboard'})
            
        except Exception as e:
            logger.error(f"❌ Admin login error: {e}")
            return jsonify({'success': False, 'message': 'An error occurred'}), 500

    @app.route(f'/{ADMIN_URL_PATH}/dashboard')
    @admin_required
    def admin_dashboard():
        """Admin dashboard"""
        return render_template('admin/Dashboard.html', 
                             username=session.get('username'),
                             admin_path=ADMIN_URL_PATH)

    @app.route(f'/{ADMIN_URL_PATH}/logout', methods=['POST'])
    @admin_required
    def admin_logout():
        """Admin logout"""
        admin_id = session.get('admin_user_id')
        log_admin_action(admin_id, 'admin_logout', None, request)
        destroy_admin_session()
        
        return jsonify({'success': True, 'redirect': '/'})

    @app.route(f'/{ADMIN_URL_PATH}/api/users', methods=['GET'])
    @admin_required
    def admin_get_users():
        """Get all users (admin only)"""
        try:
            from database import get_db_connection
            
            conn = get_db_connection()
            users = conn.execute('''
                SELECT id, username, email, role, email_verified, created_at, last_login 
                FROM users
            ''').fetchall()
            conn.close()
            
            users_list = [dict(user) for user in users]
            
            if not request.args.get('silent'):
                log_admin_action(session.get('admin_user_id'), 'view_users', None, request)
            
            return jsonify({'success': True, 'users': users_list})
        
        except Exception as e:
            logger.error(f"❌ Admin get users error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route(f'/{ADMIN_URL_PATH}/api/security-stats', methods=['GET'])
    @admin_required
    def admin_security_stats():
        """Get security statistics (admin only)"""
        try:
            from database import get_db_connection
            
            conn = get_db_connection()
            
            # Count active bans
            active_bans = conn.execute('''
                SELECT COUNT(*) as count FROM banned_entities 
                WHERE expires_at > datetime('now')
            ''').fetchone()
            
            # Count failed attempts
            failed_attempts = conn.execute('''
                SELECT COUNT(*) as count FROM failed_login_attempts
            ''').fetchone()
            
            # Count audit logs
            audit_logs = conn.execute('''
                SELECT COUNT(*) as count FROM admin_audit_log
            ''').fetchone()
            
            conn.close()
            
            stats = {
                'active_bans': active_bans['count'] if active_bans else 0,
                'failed_attempts': failed_attempts['count'] if failed_attempts else 0,
                'total_audit_logs': audit_logs['count'] if audit_logs else 0
            }
            
            # Only log if not a silent background fetch
            if not request.args.get('silent'):
                log_admin_action(session.get('admin_user_id'), 'view_security_stats', None, request)
            
            return jsonify({'success': True, 'stats': stats})
        
        except Exception as e:
            logger.error(f"❌ Security stats error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route(f'/{ADMIN_URL_PATH}/api/banned-users', methods=['GET'])
    @admin_required
    def admin_get_banned_users():
        """Return all currently banned users with ban details."""
        try:
            from database import get_db_connection
            conn = get_db_connection()
            rows = conn.execute('''
                SELECT b.id, b.fingerprint, b.reason, b.banned_at, b.expires_at,
                       b.permanent, b.ban_count,
                       u.id AS user_id, u.username, u.email
                FROM banned_entities b
                JOIN users u ON b.fingerprint = 'user:' || u.id
                WHERE b.permanent = 1 OR datetime(b.expires_at) > datetime('now')
                ORDER BY b.banned_at DESC
            ''').fetchall()
            conn.close()
            return jsonify({'success': True, 'banned_users': [dict(r) for r in rows]})
        except Exception as e:
            logger.error(f"Banned users list error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    # ── Password Reset Token Management ──────────────────────────────────
    @app.route(f'/{ADMIN_URL_PATH}/api/users/<int:user_id>/reset-tokens', methods=['GET'])
    @admin_required
    def admin_get_reset_tokens(user_id):
        """Return active (unused, unexpired) password reset tokens for a user."""
        try:
            from database import get_db_connection
            conn = get_db_connection()
            tokens = conn.execute('''
                SELECT id, created_at, expires_at, used, request_ip, request_user_agent
                FROM password_reset_tokens
                WHERE user_id = ? AND used = 0 AND datetime(expires_at) > datetime('now')
                ORDER BY created_at DESC
            ''', (user_id,)).fetchall()
            conn.close()
            return jsonify({'success': True, 'tokens': [dict(t) for t in tokens]})
        except Exception as e:
            logger.error(f"Admin get reset tokens error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route(f'/{ADMIN_URL_PATH}/api/reset-tokens/<int:token_id>/revoke', methods=['POST'])
    @admin_required
    def admin_revoke_reset_token(token_id):
        """Revoke (mark as used) a password reset token."""
        try:
            from database import get_db_connection
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                'UPDATE password_reset_tokens SET used = 1 WHERE id = ? AND used = 0',
                (token_id,)
            )
            updated = cursor.rowcount > 0
            conn.commit()
            conn.close()

            if not updated:
                return jsonify({'success': False, 'message': 'Token not found or already used'}), 404

            log_admin_action(
                session.get('admin_user_id'),
                'revoke_reset_token',
                f'Revoked password reset token #{token_id}',
                request
            )
            return jsonify({'success': True, 'message': 'Token revoked'})
        except Exception as e:
            logger.error(f"Admin revoke token error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    # ── User Management ────────────────────────────────────────────────────

    @app.route(f'/{ADMIN_URL_PATH}/api/users/<int:user_id>/ban', methods=['POST'])
    @admin_required
    def admin_ban_user(user_id):
        """Ban a user by ID"""
        try:
            from database import get_db_connection
            data = request.get_json() or {}
            reason = data.get('reason', 'Banned by admin').strip() or 'Banned by admin'
            duration_hours = int(data.get('duration_hours', 168))

            conn = get_db_connection()
            user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
            conn.close()

            if not user:
                return jsonify({'success': False, 'message': 'User not found'}), 404
            if user['role'] == 'admin':
                return jsonify({'success': False, 'message': 'Cannot ban an admin account'}), 403

            ban_entity(ip_address=None, fingerprint=f"user:{user_id}",
                       reason=f"[Admin ban] {reason}", duration_hours=duration_hours)

            log_admin_action(session.get('admin_user_id'), 'ban_user',
                             f"Banned user #{user_id} ({user['username']}) — {reason}", request)

            logger.info(f"🚫 Admin banned user: {user['username']} (ID {user_id})")
            return jsonify({'success': True, 'message': f"User {user['username']} banned for {duration_hours}h"})

        except Exception as e:
            logger.error(f"❌ Ban user error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route(f'/{ADMIN_URL_PATH}/api/users/<int:user_id>/unban', methods=['POST'])
    @admin_required
    def admin_unban_user(user_id):
        """Unban a user by ID"""
        try:
            from database import get_db_connection
            from Gatekeeper import unban_entity

            conn = get_db_connection()
            user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
            conn.close()

            if not user:
                return jsonify({'success': False, 'message': 'User not found'}), 404

            deleted = unban_entity(fingerprint=f"user:{user_id}")
            log_admin_action(session.get('admin_user_id'), 'unban_user',
                             f"Unbanned user #{user_id} ({user['username']})", request)

            logger.info(f"✅ Admin unbanned: {user['username']} (ID {user_id})")
            return jsonify({'success': True,
                            'message': f"User {user['username']} unbanned",
                            'records_removed': deleted})

        except Exception as e:
            logger.error(f"❌ Unban error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route(f'/{ADMIN_URL_PATH}/api/users/<int:user_id>/role', methods=['POST'])
    @admin_required
    def admin_change_role(user_id):
        """Promote or demote a user"""
        try:
            from database import get_db_connection
            data = request.get_json() or {}
            new_role = data.get('role', '').strip().lower()

            if new_role not in ('user', 'admin'):
                return jsonify({'success': False, 'message': 'Role must be "user" or "admin"'}), 400
            if user_id == session.get('admin_user_id') and new_role != 'admin':
                return jsonify({'success': False, 'message': 'Cannot demote your own account'}), 403

            conn = get_db_connection()
            user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
            if not user:
                conn.close()
                return jsonify({'success': False, 'message': 'User not found'}), 404

            conn.execute('UPDATE users SET role = ? WHERE id = ?', (new_role, user_id))
            conn.commit()
            conn.close()

            log_admin_action(session.get('admin_user_id'), 'change_role',
                             f"Changed {user['username']}: {user['role']} → {new_role}", request)

            return jsonify({'success': True, 'message': f"{user['username']} is now {new_role}"})

        except Exception as e:
            logger.error(f"❌ Change role error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route(f'/{ADMIN_URL_PATH}/api/users/<int:user_id>', methods=['DELETE'])
    @admin_required
    def admin_delete_user(user_id):
        """Permanently delete a user account"""
        try:
            from database import get_db_connection

            if user_id == session.get('admin_user_id'):
                return jsonify({'success': False, 'message': 'Cannot delete your own account'}), 403

            conn = get_db_connection()
            user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
            if not user:
                conn.close()
                return jsonify({'success': False, 'message': 'User not found'}), 404

            username_snap = user['username']
            conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
            conn.commit()
            conn.close()

            log_admin_action(session.get('admin_user_id'), 'delete_user',
                             f"Deleted user #{user_id} ({username_snap})", request)

            logger.warning(f"🗑️ Admin deleted user: {username_snap} (ID {user_id})")
            return jsonify({'success': True, 'message': f"User {username_snap} permanently deleted"})

        except Exception as e:
            logger.error(f"❌ Delete user error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    # ── Audit Log ──────────────────────────────────────────────────────────

    @app.route(f'/{ADMIN_URL_PATH}/api/audit-log', methods=['GET'])
    @admin_required
    def admin_audit_log():
        """Fetch audit log entries with pagination. Pass ?silent=1 to skip logging."""
        try:
            from database import get_db_connection

            limit  = min(int(request.args.get('limit',  30)), 200)
            offset = int(request.args.get('offset', 0))
            silent = request.args.get('silent')

            conn = get_db_connection()

            entries = conn.execute('''
                SELECT a.id, a.action, a.details, a.ip_address, a.timestamp,
                       u.username AS admin_username
                FROM admin_audit_log a
                LEFT JOIN users u ON a.admin_user_id = u.id
                ORDER BY a.timestamp DESC
                LIMIT ? OFFSET ?
            ''', (limit, offset)).fetchall()

            total = conn.execute(
                'SELECT COUNT(*) as count FROM admin_audit_log'
            ).fetchone()['count']

            conn.close()

            # Only write an audit entry when not silenced (avoids log bloat on auto-refresh)
            if not silent:
                log_admin_action(session.get('admin_user_id'), 'view_audit_log', None, request)

            return jsonify({'success': True,
                            'entries': [dict(e) for e in entries],
                            'total': total, 'limit': limit, 'offset': offset})

        except Exception as e:
            logger.error(f"❌ Audit log error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    # ── Failed Login Attempts ──────────────────────────────────────────────

    @app.route(f'/{ADMIN_URL_PATH}/api/failed-logins', methods=['GET'])
    @admin_required
    def admin_failed_logins():
        """Fetch recent failed login attempts"""
        try:
            from database import get_db_connection
            limit = min(int(request.args.get('limit', 50)), 200)

            conn = get_db_connection()
            entries = conn.execute('''
                SELECT id, ip_address, reason, attempted_at
                FROM failed_login_attempts
                ORDER BY attempted_at DESC
                LIMIT ?
            ''', (limit,)).fetchall()
            conn.close()

            return jsonify({'success': True, 'entries': [dict(e) for e in entries]})

        except Exception as e:
            logger.error(f"❌ Failed logins error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    # ── Analytics API ─────────────────────────────────────────────────────────
    @app.route(f'/{ADMIN_URL_PATH}/api/analytics', methods=['GET'])
    @admin_required
    def admin_analytics():
        """Return platform-wide aggregate statistics."""
        try:
            stats = get_platform_analytics()
            return jsonify({'success': True, 'stats': stats})
        except Exception as e:
            logger.error(f"Admin analytics error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    # ── Lobby Monitoring API ───────────────────────────────────────────────────
    @app.route(f'/{ADMIN_URL_PATH}/api/lobbies', methods=['GET'])
    @admin_required
    def admin_get_lobbies():
        """Return all active in-memory rooms."""
        try:
            from database import get_db_connection
            lobbies = []
            for room_code, users in room_users.items():
                host_user_id = room_host_user_ids.get(room_code)
                created_at = room_creation_time.get(room_code)
                settings = room_settings.get(room_code, {'public': True})
                game = room_games.get(room_code, {})

                host_username = None
                if host_user_id:
                    conn = get_db_connection()
                    u = conn.execute(
                        'SELECT username FROM users WHERE id = ?', (host_user_id,)
                    ).fetchone()
                    conn.close()
                    host_username = u['username'] if u else f'user#{host_user_id}'

                lobbies.append({
                    'room_code': room_code,
                    'host_username': host_username,
                    'player_count': len(users),
                    'players': [u['username'] for u in users],
                    'public': settings.get('public', True),
                    'created_at': created_at.isoformat() if created_at else None,
                    'game_phase': game.get('phase', 'lobby'),
                })

            return jsonify({'success': True, 'lobbies': lobbies, 'total': len(lobbies)})
        except Exception as e:
            logger.error(f"Admin lobbies error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route(f'/{ADMIN_URL_PATH}/api/lobbies/<room_code>/close', methods=['POST'])
    @admin_required
    def admin_close_lobby(room_code):
        """Force-close an active room, disconnect all players."""
        try:
            room_code = room_code.upper()
            if room_code not in room_users:
                return jsonify({'success': False, 'message': 'Room not found'}), 404

            socketio.emit('room_closed', {'reason': 'Closed by administrator'}, to=room_code)

            for d in [room_users, room_hosts, room_host_user_ids,
                      room_creation_time, room_games, room_settings]:
                d.pop(room_code, None)

            log_admin_action(
                session.get('admin_user_id'),
                'close_lobby',
                f"Force-closed room {room_code}",
                request
            )
            logger.warning(f"Admin force-closed room: {room_code}")
            return jsonify({'success': True, 'message': f'Room {room_code} closed'})

        except Exception as e:
            logger.error(f"Admin close lobby error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    # ── Content Moderation API ─────────────────────────────────────────────────
    @app.route(f'/{ADMIN_URL_PATH}/api/content', methods=['GET'])
    @admin_required
    def admin_get_content():
        """Return all documents across all users for moderation review."""
        try:
            search = request.args.get('search', '').strip() or None
            docs = get_all_documents_admin(search=search)
            return jsonify({'success': True, 'documents': docs, 'total': len(docs)})
        except Exception as e:
            logger.error(f"Admin content error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route(f'/{ADMIN_URL_PATH}/api/content/<int:document_id>', methods=['DELETE'])
    @admin_required
    def admin_delete_document(document_id):
        """Admin deletes any document regardless of owner."""
        try:
            from database import get_db_connection
            conn = get_db_connection()
            doc = conn.execute(
                'SELECT d.original_filename, u.username FROM documents d JOIN users u ON u.id = d.user_id WHERE d.id = ?',
                (document_id,)
            ).fetchone()
            conn.close()

            if not doc:
                return jsonify({'success': False, 'message': 'Document not found'}), 404

            file_path = admin_delete_document_by_id(document_id)

            if file_path and os.path.exists(file_path):
                os.remove(file_path)

            log_admin_action(
                session.get('admin_user_id'),
                'delete_document',
                f'Deleted document #{document_id} "{doc["original_filename"]}" (owner: {doc["username"]})',
                request
            )
            return jsonify({'success': True, 'message': f'Document "{doc["original_filename"]}" deleted'})

        except Exception as e:
            logger.error(f"Admin delete document error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route(f'/{ADMIN_URL_PATH}/api/content/<int:document_id>/flag', methods=['POST'])
    @admin_required
    def admin_flag_document(document_id):
        """Admin flags a document for review."""
        try:
            data = request.get_json() or {}
            reason = data.get('reason', '').strip()
            if not reason:
                return jsonify({'success': False, 'message': 'Reason is required'}), 400

            ok, result = create_document_report(document_id, session.get('admin_user_id'), reason)
            if not ok:
                return jsonify({'success': False, 'message': result}), 400

            log_admin_action(
                session.get('admin_user_id'),
                'flag_document',
                f'Flagged document #{document_id}: {reason}',
                request
            )
            return jsonify({'success': True, 'message': 'Document flagged'})

        except Exception as e:
            logger.error(f"Admin flag document error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route(f'/{ADMIN_URL_PATH}/api/content/<int:document_id>/reports', methods=['GET'])
    @admin_required
    def admin_get_document_reports(document_id):
        """Return all reports for a specific document."""
        try:
            reports = get_reports_for_document(document_id)
            return jsonify({'success': True, 'reports': reports})
        except Exception as e:
            logger.error(f"Admin get reports error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route(f'/{ADMIN_URL_PATH}/api/reports/<int:report_id>/review', methods=['POST'])
    @admin_required
    def admin_review_report(report_id):
        """Mark a report as reviewed or dismissed."""
        try:
            data = request.get_json() or {}
            status = data.get('status', '').strip().lower()

            if status not in ('reviewed', 'dismissed'):
                return jsonify({'success': False, 'message': 'Status must be reviewed or dismissed'}), 400

            updated = update_report_status(report_id, status, session.get('admin_user_id'))
            if not updated:
                return jsonify({'success': False, 'message': 'Report not found'}), 404

            log_admin_action(
                session.get('admin_user_id'),
                'review_report',
                f'Marked report #{report_id} as {status}',
                request
            )
            return jsonify({'success': True, 'message': f'Report marked as {status}'})

        except Exception as e:
            logger.error(f"Admin review report error: {e}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route('/emergency-access/<secret_token>', methods=['GET'])
    def emergency_unban(secret_token):
        """Emergency unban route"""
        if secret_token != EMERGENCY_TOKEN:
            abort(404)
        
        from Gatekeeper import unban_entity
        
        ip_address = request.remote_addr
        deleted = unban_entity(ip_address=ip_address)
        
        logger.critical(f"🚨 EMERGENCY UNBAN used from IP: {ip_address}")
        
        return f"""
        <h1>Emergency Unban Executed</h1>
        <p>IP: {ip_address}</p>
        <p>Records deleted: {deleted}</p>
        <a href="/{ADMIN_URL_PATH}">Go to Admin Login</a>
        """

# ============================================================================
# SOCKETIO EVENTS (UNCHANGED - Your existing code)
# ============================================================================
@socketio.on('connect')
def handle_connect():
    """Handle new socket connection"""
    logger.info(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    """Handle socket disconnection"""
    sid = request.sid
    logger.info(f"Client disconnected: {sid}")
    
    # Find and remove user from all rooms
    for room_code, users in list(room_users.items()):
        user_to_remove = None
        for user in users:
            if user['sid'] == sid:
                user_to_remove = user
                break
        
        if user_to_remove:
            users.remove(user_to_remove)
            logger.info(f"Removed user {user_to_remove['username']} from room {room_code}")
            
            # If host left, close the room
            if room_hosts.get(room_code) == sid:
                emit('room_closed', {'reason': 'host_left'}, to=room_code)
                logger.info(f"Room {room_code} closed - host left")
                
                # Clean up all room data
                for d in [room_users, room_hosts, room_host_user_ids, room_creation_time, room_games, room_settings]:
                    d.pop(room_code, None)
            else:
                # Update remaining players
                if users:
                    user_list = [u['username'] for u in users]
                    emit('update_player_list', user_list, to=room_code)
                else:
                    cleanup_empty_rooms()
            break

@socketio.on('join_room')
def handle_join_room(data):
    """Handle user joining a room"""
    try:
        username = data.get('username', '').strip()
        room_code = data.get('room', '').strip().upper()
        sid = request.sid

        if not username or not room_code:
            emit('error', {'message': 'Invalid username or room code'})
            return

        username = username[:20]

        # Reject if room does not exist (only /create_room route creates rooms)
        if room_code not in room_users:
            emit('error', {'message': 'Room not found. Check the code and try again.'})
            return

        # Private room check: require sign-in
        settings = room_settings.get(room_code, {'public': True})
        if not settings.get('public', True):
            if not session.get('user_id'):
                emit('error', {'message': 'This is a private lobby. Sign in to join.'})
                return

        join_room(room_code)

        if not room_users[room_code]:
            room_hosts[room_code] = sid
            logger.info(f"User {username} is now host of room {room_code}")
        
        existing_user = next((u for u in room_users[room_code] if u['sid'] == sid), None)
        if not existing_user:
            room_users[room_code].append({
                'sid': sid,
                'username': username,
                'joined_at': datetime.now().isoformat()
            })
            logger.info(f"User {username} joined room {room_code}")
        
        user_list = [u['username'] for u in room_users[room_code]]
        emit('update_player_list', user_list, to=room_code)
        
        emit('room_joined', {
            'room': room_code,
            'username': username,
            'is_host': room_hosts.get(room_code) == sid,
            'player_count': len(user_list)
        })
        
    except Exception as e:
        logger.error(f"Error in handle_join_room: {str(e)}")
        emit('error', {'message': 'Failed to join room'})

@socketio.on('leave_room')
def handle_leave_room(data):
    """Handle user leaving a room"""
    try:
        room_code = data.get('room', '').strip().upper()
        sid = request.sid
        
        if room_code in room_users:
            user_to_remove = next((u for u in room_users[room_code] if u['sid'] == sid), None)
            
            if user_to_remove:
                room_users[room_code].remove(user_to_remove)
                leave_room(room_code)
                
                logger.info(f"User {user_to_remove['username']} left room {room_code}")
                
                if room_hosts.get(room_code) == sid:
                    emit('room_closed', {'reason': 'host_left'}, to=room_code)
                    for d in [room_users, room_hosts, room_host_user_ids, room_creation_time, room_games, room_settings]:
                        d.pop(room_code, None)
                else:
                    if room_users[room_code]:
                        user_list = [u['username'] for u in room_users[room_code]]
                        emit('update_player_list', user_list, to=room_code)
                    else:
                        cleanup_empty_rooms()

        emit('left_room', {'room': room_code})

    except Exception as e:
        logger.error(f"Error in handle_leave_room: {str(e)}")
        emit('error', {'message': 'Failed to leave room'})

@socketio.on('kick_player')
def handle_kick_player(data):
    """Host kicks a player from the room."""
    try:
        room_code = data.get('room', '').strip().upper()
        target_username = data.get('username', '').strip()
        sid = request.sid

        if room_hosts.get(room_code) != sid:
            emit('error', {'message': 'Only the host can kick players'})
            return

        if room_code not in room_users:
            return

        target_user = next(
            (u for u in room_users[room_code] if u['username'] == target_username),
            None
        )
        if not target_user:
            emit('error', {'message': 'Player not found'})
            return

        if target_user['sid'] == sid:
            emit('error', {'message': 'Cannot kick yourself'})
            return

        room_users[room_code].remove(target_user)

        emit('player_kicked', {
            'username': target_username,
            'reason': 'Kicked by host'
        }, to=target_user['sid'])

        leave_room(room_code, sid=target_user['sid'])

        user_list = [u['username'] for u in room_users[room_code]]
        emit('update_player_list', user_list, to=room_code)
        logger.info(f"Host kicked {target_username} from room {room_code}")

    except Exception as e:
        logger.error(f"Error in handle_kick_player: {str(e)}")
        emit('error', {'message': 'Failed to kick player'})


@socketio.on('select_document')
def handle_select_document(data):
    """Host selects which document to use for the quiz."""
    try:
        room_code = data.get('room', '').strip().upper()
        document_id = data.get('document_id')
        sid = request.sid

        if room_hosts.get(room_code) != sid:
            emit('error', {'message': 'Only the host can select a document'})
            return

        host_user_id = room_host_user_ids.get(room_code)
        if not host_user_id:
            emit('error', {'message': 'Host authentication error'})
            return

        doc, cards = get_flashcards_for_document(document_id, host_user_id)
        if doc is None:
            emit('error', {'message': 'Document not found'})
            return
        if len(cards) < 4:
            emit('error', {'message': 'Document needs at least 4 flashcards'})
            return

        if room_code not in room_games:
            room_games[room_code] = {}
        room_games[room_code]['document_id'] = document_id
        room_games[room_code]['phase'] = 'lobby'

        emit('document_selected', {
            'document_name': doc['original_filename'],
            'question_count': len(cards)
        }, to=room_code)

        logger.info(f"Document selected in room {room_code}: {doc['original_filename']}")

    except Exception as e:
        logger.error(f"Error in handle_select_document: {str(e)}")
        emit('error', {'message': 'Failed to select document'})


@socketio.on('start_game')
def handle_start_game(data):
    """Host starts the quiz game."""
    try:
        room_code = data.get('room', '').strip().upper()
        sid = request.sid

        if room_hosts.get(room_code) != sid:
            emit('error', {'message': 'Only the host can start the game'})
            return

        if len(room_users.get(room_code, [])) < 2:
            emit('error', {'message': 'Need at least 2 players to start'})
            return

        game = room_games.get(room_code, {})
        if 'document_id' not in game:
            emit('error', {'message': 'Select a document first'})
            return

        host_user_id = room_host_user_ids.get(room_code)
        doc, cards = get_flashcards_for_document(game['document_id'], host_user_id)

        if not doc or len(cards) < 4:
            emit('error', {'message': 'Not enough flashcards'})
            return

        # Generate MCQ (same logic as quiz_routes.py)
        all_answers = [c['answer'] for c in cards]
        questions = []
        for i, card in enumerate(cards):
            correct = card['answer']
            other_answers = [a for j, a in enumerate(all_answers) if j != i]
            distractors = random.sample(other_answers, min(3, len(other_answers)))
            options = [correct] + distractors
            random.shuffle(options)
            questions.append({
                'id': card['id'],
                'question': card['question'],
                'options': options,
                'correct_index': options.index(correct),
            })
        random.shuffle(questions)

        # Initialize game state
        player_scores = {}
        for u in room_users[room_code]:
            player_scores[u['username']] = {'total_score': 0, 'correct_count': 0}

        room_games[room_code] = {
            'document_id': game['document_id'],
            'questions': questions,
            'current_question_index': -1,
            'question_start_time': None,
            'player_scores': player_scores,
            'player_answers': {},
            'phase': 'playing',
        }

        logger.info(f"Game started in room {room_code} with {len(questions)} questions")
        emit('game_started', {
            'room': room_code,
            'total_questions': len(questions)
        }, to=room_code)

        socketio.start_background_task(_delayed_first_question, room_code)

    except Exception as e:
        logger.error(f"Error in handle_start_game: {str(e)}")
        emit('error', {'message': 'Failed to start game'})


def _delayed_first_question(room_code):
    """Wait 3 seconds then send the first question."""
    socketio.sleep(3)
    send_next_question(room_code)


def send_next_question(room_code):
    """Advance to next question and broadcast it."""
    game = room_games.get(room_code)
    if not game:
        return

    game['current_question_index'] += 1
    idx = game['current_question_index']

    if idx >= len(game['questions']):
        end_game(room_code)
        return

    q = game['questions'][idx]
    game['question_start_time'] = datetime.now()
    game['player_answers'][idx] = {}
    game['phase'] = 'question_active'

    # Send question WITHOUT correct_index (anti-cheat)
    socketio.emit('question_start', {
        'question_index': idx,
        'question_text': q['question'],
        'options': q['options'],
        'total': len(game['questions']),
        'time_limit': 15
    }, to=room_code, namespace='/')

    socketio.start_background_task(_question_timer, room_code, idx)


def _question_timer(room_code, question_index):
    """Background task that ends a question after 15 seconds."""
    socketio.sleep(15)
    game = room_games.get(room_code)
    if not game:
        return
    if game['current_question_index'] != question_index:
        return
    if game['phase'] != 'question_active':
        return
    end_question(room_code)


@socketio.on('submit_answer')
def handle_submit_answer(data):
    """Player submits their answer for the current question."""
    try:
        room_code = data.get('room', '').strip().upper()
        answer_index = data.get('answer_index')
        sid = request.sid

        game = room_games.get(room_code)
        if not game or game['phase'] != 'question_active':
            return

        user = next((u for u in room_users.get(room_code, []) if u['sid'] == sid), None)
        if not user:
            return

        idx = game['current_question_index']
        answers = game['player_answers'].get(idx, {})

        # Prevent duplicate answers
        if user['username'] in answers:
            return

        answers[user['username']] = {
            'answer_index': answer_index,
            'timestamp': datetime.now()
        }
        game['player_answers'][idx] = answers

        # If all players answered, end question early
        if len(answers) >= len(room_users.get(room_code, [])):
            end_question(room_code)

    except Exception as e:
        logger.error(f"Error in handle_submit_answer: {str(e)}")


def end_question(room_code):
    """Score the current question and broadcast results."""
    game = room_games.get(room_code)
    if not game or game['phase'] != 'question_active':
        return

    game['phase'] = 'question_reveal'
    idx = game['current_question_index']
    q = game['questions'][idx]
    correct_index = q['correct_index']
    start_time = game['question_start_time']
    answers = game['player_answers'].get(idx, {})

    player_results = []
    for u in room_users.get(room_code, []):
        uname = u['username']
        ans = answers.get(uname)
        if ans and ans['answer_index'] == correct_index:
            elapsed = (ans['timestamp'] - start_time).total_seconds()
            remaining = max(0, 15 - elapsed)
            score = round(500 * (remaining / 15))
            if uname in game['player_scores']:
                game['player_scores'][uname]['total_score'] += score
                game['player_scores'][uname]['correct_count'] += 1
            player_results.append({
                'username': uname,
                'correct': True,
                'score': score,
                'answer_index': ans['answer_index']
            })
        else:
            player_results.append({
                'username': uname,
                'correct': False,
                'score': 0,
                'answer_index': ans['answer_index'] if ans else -1
            })

    player_results.sort(key=lambda x: x['score'], reverse=True)

    leaderboard = sorted(
        [{'username': k, **v} for k, v in game['player_scores'].items()],
        key=lambda x: x['total_score'], reverse=True
    )

    socketio.emit('question_end', {
        'correct_index': correct_index,
        'player_results': player_results,
        'leaderboard': leaderboard
    }, to=room_code, namespace='/')

    socketio.start_background_task(_advance_after_reveal, room_code)


def _advance_after_reveal(room_code):
    """Wait during reveal phase, then advance to next question."""
    socketio.sleep(4)
    game = room_games.get(room_code)
    if not game or game['phase'] != 'question_reveal':
        return
    send_next_question(room_code)


def end_game(room_code):
    """Send final results."""
    game = room_games.get(room_code)
    if not game:
        return

    game['phase'] = 'results'

    leaderboard = sorted(
        [{'username': k, **v} for k, v in game['player_scores'].items()],
        key=lambda x: x['total_score'], reverse=True
    )

    socketio.emit('game_results', {
        'leaderboard': leaderboard,
        'total_questions': len(game['questions'])
    }, to=room_code, namespace='/')

    logger.info(f"Game ended in room {room_code}")


@socketio.on('reset_game')
def handle_reset_game(data):
    """Host resets game to lobby state for another round."""
    try:
        room_code = data.get('room', '').strip().upper()
        sid = request.sid

        if room_hosts.get(room_code) != sid:
            emit('error', {'message': 'Only the host can reset the game'})
            return

        if room_code in room_games:
            del room_games[room_code]

        emit('game_reset', {'room': room_code}, to=room_code)
        logger.info(f"Game reset in room {room_code}")

    except Exception as e:
        logger.error(f"Error in handle_reset_game: {str(e)}")
        emit('error', {'message': 'Failed to reset game'})


# ============================================================================
# RUN APPLICATION
# ============================================================================
if __name__ == '__main__':
    # For development
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
    
    # For production (Render/Railway), use:
    # socketio.run(app, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))