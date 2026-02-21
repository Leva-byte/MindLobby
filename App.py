import random
import string
import os
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
    update_last_login
)
from validators import validate_password_strength, validate_email_format, validate_username

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

# Secret key - change this!
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-here-change-in-production')

# SocketIO config - with Hostinger compatibility
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    logger=True,
    engineio_logger=True,
    ping_timeout=60,
    ping_interval=25
)

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
room_hosts = {}
room_creation_time = {}

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
        if room in room_users:
            del room_users[room]
        if room in room_hosts:
            del room_hosts[room]
        if room in room_creation_time:
            del room_creation_time[room]
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
        
        # Create user in database
        user_id = create_user(email, username, password)
        
        if user_id:
            # Create session
            session['user_id'] = user_id
            session['user_email'] = email
            session['username'] = username
            
            logger.info(f"New user registered: {username}")
            return jsonify({'success': True, 'message': 'Account created successfully', 'username': username})
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
        return jsonify({
            'authenticated': True,
            'username': session.get('username'),
            'email': session.get('user_email'),
            'role': session.get('role', 'user')
        })
    return jsonify({'authenticated': False})

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
    """Render the main platform landing page"""
    return render_template('Home.html')

@app.route('/quickplay')
def quickplay():
    """Render the quick play page"""
    return render_template('Index.html')

@app.route('/home')
def home():
    """Render the main platform landing page (alias)"""
    return render_template('Home.html')

@app.route('/about')
def about():
    """Render the about page"""
    return render_template('About.html')

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
    """Create a new room and redirect to it"""
    room_code = generate_room_code()
    
    # Ensure room code is unique
    while room_code in room_users:
        room_code = generate_room_code()
    
    username = request.args.get('username', '').strip()
    if not username:
        username = f"Guest{random.randint(1000, 9999)}"
    
    # Initialize room
    room_users[room_code] = []
    room_creation_time[room_code] = datetime.now()
    
    logger.info(f"Created new room: {room_code} for user: {username}")
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
                
                # Clean up room data
                if room_code in room_users:
                    del room_users[room_code]
                if room_code in room_hosts:
                    del room_hosts[room_code]
                if room_code in room_creation_time:
                    del room_creation_time[room_code]
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
        
        if not username:
            username = f"Guest{random.randint(1000, 9999)}"
        
        username = username[:20]
        
        join_room(room_code)
        
        if room_code not in room_users:
            room_users[room_code] = []
            room_creation_time[room_code] = datetime.now()
        
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
                    if room_code in room_users:
                        del room_users[room_code]
                    if room_code in room_hosts:
                        del room_hosts[room_code]
                    if room_code in room_creation_time:
                        del room_creation_time[room_code]
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

@socketio.on('start_game')
def handle_start_game(data):
    """Handle game start"""
    try:
        room_code = data.get('room', '').strip().upper()
        sid = request.sid
        
        if room_hosts.get(room_code) != sid:
            emit('error', {'message': 'Only the host can start the game'})
            return
        
        if len(room_users.get(room_code, [])) < 1:
            emit('error', {'message': 'Need at least 2 players to start'})
            return
        
        logger.info(f"Game started in room {room_code}")
        emit('game_started', {'room': room_code}, to=room_code)
        
    except Exception as e:
        logger.error(f"Error in handle_start_game: {str(e)}")
        emit('error', {'message': 'Failed to start game'})

# ============================================================================
# RUN APPLICATION
# ============================================================================
if __name__ == '__main__':
    # For development
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
    
    # For production (Render/Railway), use:
    # socketio.run(app, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))