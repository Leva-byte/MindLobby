"""
Gatekeeper.py - MindLobby Security Module
Handles IP banning, fingerprinting, geofencing, and audit logging
"""

import hashlib
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, session, abort
import logging
from db_adapter import get_db_connection, is_postgres
from utils import get_real_ip

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# DATABASE INITIALIZATION
# ============================================================================

def init_security_tables():
    """Initialize security-related database tables"""
    conn = get_db_connection()
    cursor = conn.cursor()

    if is_postgres():
        PK = 'SERIAL PRIMARY KEY'
    else:
        PK = 'INTEGER PRIMARY KEY AUTOINCREMENT'

    # Banned IPs/Fingerprints table
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS banned_entities (
            id {PK},
            ip_address TEXT,
            fingerprint TEXT,
            reason TEXT,
            banned_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            permanent INTEGER DEFAULT 0,
            ban_count INTEGER DEFAULT 1
        )
    ''')

    # Admin audit log
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS admin_audit_log (
            id {PK},
            admin_user_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            fingerprint TEXT,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (admin_user_id) REFERENCES users (id)
        )
    ''')

    # Failed login attempts
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS failed_login_attempts (
            id {PK},
            ip_address TEXT,
            fingerprint TEXT,
            attempted_at TEXT NOT NULL,
            reason TEXT
        )
    ''')

    # Admin sessions (for session binding)
    cursor.execute(f'''
        CREATE TABLE IF NOT EXISTS admin_sessions (
            id {PK},
            user_id INTEGER NOT NULL,
            session_token TEXT NOT NULL,
            ip_address TEXT NOT NULL,
            user_agent TEXT,
            fingerprint TEXT,
            created_at TEXT NOT NULL,
            last_activity TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')

    conn.commit()
    conn.close()
    print("✅ Security tables initialized")

# ============================================================================
# FINGERPRINTING
# ============================================================================

def create_fingerprint(request):
    """
    Create unique browser fingerprint from multiple factors
    More reliable than IP alone (survives VPN changes)
    """
    components = [
        get_real_ip(request),
        request.headers.get('User-Agent', ''),
        request.headers.get('Accept-Language', ''),
        request.headers.get('Accept-Encoding', ''),
        request.headers.get('Accept', ''),
    ]
    
    fingerprint_string = '|'.join(components)
    fingerprint = hashlib.sha256(fingerprint_string.encode()).hexdigest()
    
    return fingerprint

# ============================================================================
# BAN MANAGEMENT
# ============================================================================

def ban_entity(ip_address=None, fingerprint=None, reason="Unauthorized access attempt", 
               duration_hours=24, permanent=False):
    """
    Ban an IP address and/or fingerprint
    
    Args:
        ip_address: IP to ban (optional)
        fingerprint: Fingerprint to ban (optional)
        reason: Reason for ban
        duration_hours: Ban duration (default 24 hours)
        permanent: If True, ban is permanent
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    banned_at = datetime.now()
    expires_at = banned_at + timedelta(hours=duration_hours) if not permanent else datetime.max
    
    # Check if already banned (increment counter)
    cursor.execute('''
        SELECT id, ban_count FROM banned_entities 
        WHERE ip_address = ? OR fingerprint = ?
    ''', (ip_address, fingerprint))
    
    existing = cursor.fetchone()
    
    if existing:
        # Increment ban count and extend duration
        new_ban_count = existing[1] + 1
        new_duration = duration_hours * (2 ** (new_ban_count - 1))  # Exponential backoff
        new_expires_at = banned_at + timedelta(hours=min(new_duration, 720))  # Max 30 days
        
        cursor.execute('''
            UPDATE banned_entities 
            SET ban_count = ?, banned_at = ?, expires_at = ?, reason = ?
            WHERE id = ?
        ''', (new_ban_count, banned_at.isoformat(), new_expires_at.isoformat(), reason, existing[0]))
        
        logger.warning(f"⚠️ Repeat offender banned: IP={ip_address}, Fingerprint={fingerprint[:16]}..., Count={new_ban_count}")
    else:
        # New ban
        cursor.execute('''
            INSERT INTO banned_entities 
            (ip_address, fingerprint, reason, banned_at, expires_at, permanent, ban_count)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        ''', (ip_address, fingerprint, reason, banned_at.isoformat(), 
              expires_at.isoformat(), 1 if permanent else 0))
        
        logger.warning(f"🚫 Entity banned: IP={ip_address}, Fingerprint={fingerprint[:16] if fingerprint else 'None'}...")
    
    conn.commit()
    conn.close()

def is_banned(ip_address, fingerprint):
    """Check if IP or fingerprint is banned"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT * FROM banned_entities
        WHERE (ip_address = ? OR fingerprint = ?)
        AND (permanent = 1 OR expires_at > ?)
    ''', (ip_address, fingerprint, datetime.now().isoformat()))
    
    result = cursor.fetchone()
    conn.close()
    
    return result is not None

def unban_entity(ip_address=None, fingerprint=None):
    """Unban an IP address or fingerprint (emergency use)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if ip_address:
        cursor.execute('DELETE FROM banned_entities WHERE ip_address = ?', (ip_address,))
    if fingerprint:
        cursor.execute('DELETE FROM banned_entities WHERE fingerprint = ?', (fingerprint,))
    
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    
    logger.info(f"✅ Unbanned: IP={ip_address}, Fingerprint={fingerprint}, Rows deleted={deleted}")
    return deleted

def cleanup_expired_bans():
    """Remove expired bans from database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        DELETE FROM banned_entities
        WHERE permanent = 0 AND expires_at < ?
    ''', (datetime.now().isoformat(),))
    
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    
    if deleted > 0:
        logger.info(f"🧹 Cleaned up {deleted} expired bans")
    
    return deleted

# ============================================================================
# GEOFENCING
# ============================================================================

def is_valid_timezone(timezone):
    """Check if timezone is in Philippines (Asia/Manila)"""
    valid_timezones = ['Asia/Manila', 'Asia/Singapore']  # SG shares timezone
    return timezone in valid_timezones

def get_client_timezone(request):
    """Extract client timezone from request headers"""
    # Timezone would come from client-side JS: Intl.DateTimeFormat().resolvedOptions().timeZone
    return request.headers.get('X-Client-Timezone', 'Unknown')

# ============================================================================
# TIME WINDOW CHECKS
# ============================================================================

def is_within_business_hours():
    """Check if current time is within allowed hours (8 AM - 10 PM Manila time)"""
    now = datetime.now()
    return 8 <= now.hour < 22  # 8 AM to 10 PM

# ============================================================================
# AUDIT LOGGING
# ============================================================================

def log_admin_action(admin_user_id, action, details=None, request_obj=None):
    """Log admin actions for security audit trail"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    ip_address = get_real_ip(request_obj) if request_obj else None
    fingerprint = create_fingerprint(request_obj) if request_obj else None
    
    cursor.execute('''
        INSERT INTO admin_audit_log 
        (admin_user_id, action, details, ip_address, fingerprint, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (admin_user_id, action, details, ip_address, fingerprint, datetime.now().isoformat()))
    
    conn.commit()
    conn.close()
    
    logger.info(f"📝 Admin action logged: User={admin_user_id}, Action={action}")

def log_failed_login(ip_address, fingerprint, reason):
    """Log failed login attempts"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO failed_login_attempts 
        (ip_address, fingerprint, attempted_at, reason)
        VALUES (?, ?, ?, ?)
    ''', (ip_address, fingerprint, datetime.now().isoformat(), reason))
    
    conn.commit()
    conn.close()
    
    logger.warning(f"❌ Failed login: IP={ip_address}, Reason={reason}")

# ============================================================================
# RATE LIMITING
# ============================================================================

def get_recent_failed_attempts(fingerprint, hours=1):
    """Get count of failed attempts in last N hours"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cutoff_time = (datetime.now() - timedelta(hours=hours)).isoformat()
    
    cursor.execute('''
        SELECT COUNT(*) FROM failed_login_attempts 
        WHERE fingerprint = ? AND attempted_at > ?
    ''', (fingerprint, cutoff_time))
    
    count = cursor.fetchone()[0]
    conn.close()
    
    return count

# ============================================================================
# MIDDLEWARE / DECORATORS
# ============================================================================

def security_check(f):
    """
    Middleware decorator to check if requester is banned
    Apply to ALL routes to protect entire application
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        ip_address = get_real_ip()
        fingerprint = create_fingerprint(request)

        # Check if banned
        if is_banned(ip_address, fingerprint):
            logger.warning(f"🚫 Banned entity attempted access: IP={ip_address}")
            # Return 404 to make site appear broken (stealth)
            abort(404)
        
        return f(*args, **kwargs)
    
    return decorated_function

def admin_required(f):
    """
    Decorator to require admin authentication
    Includes session binding and re-validation
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check if admin session exists
        if 'admin_user_id' not in session:
            return jsonify({'success': False, 'message': 'Unauthorized'}), 401
        
        # Session binding - verify IP and User-Agent haven't changed
        if session.get('admin_ip') != get_real_ip():
            logger.warning(f"⚠️ Session hijacking attempt detected: IP mismatch")
            session.clear()
            return jsonify({'success': False, 'message': 'Session expired'}), 401
        
        if session.get('admin_user_agent') != request.headers.get('User-Agent'):
            logger.warning(f"⚠️ Session hijacking attempt detected: User-Agent mismatch")
            session.clear()
            return jsonify({'success': False, 'message': 'Session expired'}), 401
        
        # Check session timeout (30 minutes inactivity)
        last_activity = session.get('admin_last_activity')
        if last_activity:
            last_activity_time = datetime.fromisoformat(last_activity)
            if datetime.now() - last_activity_time > timedelta(minutes=30):
                logger.info(f"⏰ Admin session expired due to inactivity")
                session.clear()
                return jsonify({'success': False, 'message': 'Session expired'}), 401
        
        # Update last activity
        session['admin_last_activity'] = datetime.now().isoformat()
        
        return f(*args, **kwargs)
    
    return decorated_function

def require_reauth(f):
    """
    Require re-authentication for sensitive operations
    User must enter password again
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check if recently authenticated (within last 5 minutes)
        last_reauth = session.get('admin_last_reauth')
        if not last_reauth or (datetime.now() - datetime.fromisoformat(last_reauth)) > timedelta(minutes=5):
            return jsonify({'success': False, 'message': 'Re-authentication required', 'reauth_needed': True}), 403
        
        return f(*args, **kwargs)
    
    return decorated_function

# ============================================================================
# SESSION MANAGEMENT
# ============================================================================

def create_admin_session(user_id, request_obj):
    """Create a new admin session with binding"""
    session['admin_user_id'] = user_id
    session['admin_ip'] = get_real_ip(request_obj)
    session['admin_user_agent'] = request_obj.headers.get('User-Agent')
    session['admin_fingerprint'] = create_fingerprint(request_obj)
    session['admin_last_activity'] = datetime.now().isoformat()
    session['admin_last_reauth'] = datetime.now().isoformat()
    
    logger.info(f"✅ Admin session created for user_id={user_id}")

def destroy_admin_session():
    """Destroy admin session"""
    admin_id = session.get('admin_user_id')
    session.clear()
    logger.info(f"🚪 Admin session destroyed for user_id={admin_id}")

# ============================================================================
# EMERGENCY FUNCTIONS
# ============================================================================

def emergency_unban_all():
    """EMERGENCY: Unban all entities (use with caution!)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM banned_entities')
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    
    logger.critical(f"🚨 EMERGENCY: All bans cleared ({deleted} entries)")
    return deleted

def get_ban_statistics():
    """Get statistics about current bans"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT
            COUNT(*) as total_bans,
            SUM(CASE WHEN permanent = 1 THEN 1 ELSE 0 END) as permanent_bans,
            SUM(CASE WHEN expires_at > ? THEN 1 ELSE 0 END) as active_bans
        FROM banned_entities
    ''', (datetime.now().isoformat(),))
    
    stats = cursor.fetchone()
    conn.close()
    
    return dict(stats) if stats else {}

# ============================================================================
# INITIALIZATION
# ============================================================================

if __name__ == '__main__':
    init_security_tables()
    print("✅ Gatekeeper security module initialized")