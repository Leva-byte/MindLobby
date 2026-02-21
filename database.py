import sqlite3
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash
import secrets
import hashlib

def get_db_connection():
    """Get database connection"""
    conn = sqlite3.connect('mindlobby.db')
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database with all tables"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Users table (WITH email_verified field)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            email_verified INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            last_login TEXT
        )
    ''')
    
    # OTP codes table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS otp_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            otp_code TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Password reset tokens table - STORES HASHED TOKENS
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            request_ip TEXT,
            request_user_agent TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Documents table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            file_type TEXT NOT NULL,
            upload_date TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Room history table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS room_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code TEXT NOT NULL,
            host_id INTEGER,
            created_at TEXT NOT NULL,
            ended_at TEXT,
            FOREIGN KEY (host_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ Database initialized successfully!")

# ============================================================================
# SECURITY HELPER FUNCTIONS
# ============================================================================

def hash_token(token):
    """Hash a token using SHA-256 - NEVER store plain tokens in DB"""
    return hashlib.sha256(token.encode()).hexdigest()

# ============================================================================
# USER FUNCTIONS
# ============================================================================

def create_user(email, username, password, role='user'):
    """Create a new user (email_verified defaults to 0)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            INSERT INTO users (email, username, password, role, email_verified, created_at)
            VALUES (?, ?, ?, ?, 0, ?)
        ''', (email, username, generate_password_hash(password), role, datetime.now().isoformat()))
        
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        return user_id
    except sqlite3.IntegrityError:
        conn.close()
        return None

def get_user_by_email(email):
    """Get user by email"""
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    conn.close()
    return user

def get_user_by_username(username):
    """Get user by username"""
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    conn.close()
    return user

def get_user_by_id(user_id):
    """Get user by ID"""
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    conn.close()
    return user

def update_last_login(email):
    """Update user's last login time"""
    conn = get_db_connection()
    conn.execute('UPDATE users SET last_login = ? WHERE email = ?', 
                 (datetime.now().isoformat(), email))
    conn.commit()
    conn.close()

def update_user_password(user_id, new_password):
    """Update user's password (used for password reset)"""
    conn = get_db_connection()
    hashed_password = generate_password_hash(new_password)
    conn.execute('UPDATE users SET password = ? WHERE id = ?', (hashed_password, user_id))
    conn.commit()
    conn.close()

# ============================================================================
# OTP FUNCTIONS
# ============================================================================

def create_otp(user_id, otp_code):
    """Store OTP code (expires in 10 minutes)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    created_at = datetime.now()
    expires_at = created_at + timedelta(minutes=10)
    
    cursor.execute('''
        INSERT INTO otp_codes (user_id, otp_code, created_at, expires_at, used)
        VALUES (?, ?, ?, ?, 0)
    ''', (user_id, otp_code, created_at.isoformat(), expires_at.isoformat()))
    
    conn.commit()
    conn.close()

def verify_otp(user_id, otp_code):
    """Verify OTP and mark email as verified - Returns True/False only"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get most recent unused OTP
        cursor.execute('''
            SELECT * FROM otp_codes 
            WHERE user_id = ? AND otp_code = ? AND used = 0
            ORDER BY created_at DESC LIMIT 1
        ''', (user_id, otp_code))
        
        otp_record = cursor.fetchone()
        
        if not otp_record:
            conn.close()
            return False
        
        # Check if expired
        expires_at = datetime.fromisoformat(otp_record['expires_at'])
        if datetime.now() > expires_at:
            conn.close()
            return False
        
        # Mark OTP as used
        cursor.execute('UPDATE otp_codes SET used = 1 WHERE id = ?', (otp_record['id'],))
        
        # Mark email as verified
        cursor.execute('UPDATE users SET email_verified = 1 WHERE id = ?', (user_id,))
        
        conn.commit()
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Error in verify_otp: {e}")
        conn.close()
        return False

# ============================================================================
# PASSWORD RESET FUNCTIONS (SECURE VERSION WITH TOKEN HASHING)
# ============================================================================

def create_password_reset_token(user_id, request_ip=None, request_user_agent=None):
    """
    Create a password reset token (expires in 1 hour)
    ⭐ SECURITY: Stores HASHED token in database, returns PLAIN token for email
    ⭐ BACKWARD COMPATIBLE: Works with old and new database schemas
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Generate secure random token (this goes in the email)
    plain_token = secrets.token_urlsafe(32)
    
    # Hash the token for database storage (CRITICAL SECURITY MEASURE)
    token_hash = hash_token(plain_token)
    
    created_at = datetime.now()
    expires_at = created_at + timedelta(hours=1)
    
    try:
        # Try new schema with metadata columns
        cursor.execute('''
            INSERT INTO password_reset_tokens 
            (user_id, token_hash, created_at, expires_at, used, request_ip, request_user_agent)
            VALUES (?, ?, ?, ?, 0, ?, ?)
        ''', (user_id, token_hash, created_at.isoformat(), expires_at.isoformat(), 
              request_ip, request_user_agent))
        print(f"✅ Token created with metadata (new schema)")
    except sqlite3.OperationalError as e:
        # Fallback to old schema without metadata columns
        print(f"⚠️ Old database schema detected, using basic insert: {e}")
        cursor.execute('''
            INSERT INTO password_reset_tokens 
            (user_id, token_hash, created_at, expires_at, used)
            VALUES (?, ?, ?, ?, 0)
        ''', (user_id, token_hash, created_at.isoformat(), expires_at.isoformat()))
        print(f"✅ Token created without metadata (old schema)")
    
    conn.commit()
    conn.close()
    
    # Return the PLAIN token (this goes in the email, NOT stored in DB)
    return plain_token

def verify_reset_token(plain_token):
    """
    Verify password reset token
    ⭐ SECURITY: Hashes the provided token and compares with DB hash
    Returns user_id if valid, None if invalid/expired
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Hash the provided token to compare with stored hash
        token_hash = hash_token(plain_token)
        
        cursor.execute('''
            SELECT * FROM password_reset_tokens 
            WHERE token_hash = ? AND used = 0
            ORDER BY created_at DESC LIMIT 1
        ''', (token_hash,))
        
        token_record = cursor.fetchone()
        
        if not token_record:
            conn.close()
            return None
        
        # Check if expired
        expires_at = datetime.fromisoformat(token_record['expires_at'])
        if datetime.now() > expires_at:
            conn.close()
            return None
        
        conn.close()
        return token_record['user_id']
        
    except Exception as e:
        print(f"❌ Error in verify_reset_token: {e}")
        conn.close()
        return None

def mark_reset_token_used(plain_token):
    """Mark a reset token as used (accepts plain token, hashes internally)"""
    conn = get_db_connection()
    token_hash = hash_token(plain_token)
    conn.execute('UPDATE password_reset_tokens SET used = 1 WHERE token_hash = ?', (token_hash,))
    conn.commit()
    conn.close()

def get_reset_token_metadata(plain_token):
    """Get metadata (IP, user agent) for a reset token"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    token_hash = hash_token(plain_token)
    
    cursor.execute('''
        SELECT request_ip, request_user_agent, created_at 
        FROM password_reset_tokens 
        WHERE token_hash = ? AND used = 0
        ORDER BY created_at DESC LIMIT 1
    ''', (token_hash,))
    
    result = cursor.fetchone()
    conn.close()
    
    if result:
        return {
            'ip': result['request_ip'],
            'user_agent': result['request_user_agent'],
            'created_at': result['created_at']
        }
    return None

# ============================================================================
# CLEANUP FUNCTIONS
# ============================================================================

def cleanup_expired_otps():
    """Delete expired OTP codes"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM otp_codes WHERE datetime(expires_at) < datetime("now")')
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted

def cleanup_expired_reset_tokens():
    """Delete expired password reset tokens"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM password_reset_tokens WHERE datetime(expires_at) < datetime("now")')
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted

if __name__ == '__main__':
    init_db()