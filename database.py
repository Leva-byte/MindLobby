import os
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
    
    # Flashcards table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS flashcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents (id),
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

    # Topics table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#7c77c6',
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')

    # Document-Topic junction table (many-to-many)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS document_topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            topic_id INTEGER NOT NULL,
            UNIQUE(document_id, topic_id),
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
            FOREIGN KEY (topic_id) REFERENCES topics (id) ON DELETE CASCADE
        )
    ''')

    # Quiz results table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS quiz_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            score INTEGER NOT NULL,
            total INTEGER NOT NULL,
            completed_at TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')

    # Document reports table (admin-only flagging)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS document_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            admin_user_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            reviewed_by INTEGER,
            reviewed_at TEXT,
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
            FOREIGN KEY (admin_user_id) REFERENCES users (id)
        )
    ''')

    # --- Migrations: add profile columns if missing ---
    existing_cols = [row[1] for row in cursor.execute('PRAGMA table_info(users)').fetchall()]
    if 'profile_picture' not in existing_cols:
        cursor.execute('ALTER TABLE users ADD COLUMN profile_picture TEXT')
    if 'banner' not in existing_cols:
        cursor.execute('ALTER TABLE users ADD COLUMN banner TEXT')

    # --- Migration: create document_reports if missing ---
    existing_tables = [row[0] for row in cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()]
    if 'document_reports' not in existing_tables:
        cursor.execute('''
            CREATE TABLE document_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL,
                admin_user_id INTEGER NOT NULL,
                reason TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                reviewed_by INTEGER,
                reviewed_at TEXT,
                FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
                FOREIGN KEY (admin_user_id) REFERENCES users (id)
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

def update_user_profile_picture(user_id, path):
    """Update user's profile picture path."""
    conn = get_db_connection()
    conn.execute('UPDATE users SET profile_picture = ? WHERE id = ?', (path, user_id))
    conn.commit()
    conn.close()

def update_user_banner(user_id, path):
    """Update user's banner image path."""
    conn = get_db_connection()
    conn.execute('UPDATE users SET banner = ? WHERE id = ?', (path, user_id))
    conn.commit()
    conn.close()

def update_username(user_id, new_username):
    """Update username. Returns True if successful, False if taken."""
    conn = get_db_connection()
    existing = conn.execute(
        'SELECT id FROM users WHERE username = ? AND id != ?', (new_username, user_id)
    ).fetchone()
    if existing:
        conn.close()
        return False
    conn.execute('UPDATE users SET username = ? WHERE id = ?', (new_username, user_id))
    conn.commit()
    conn.close()
    return True

def delete_user_account(user_id):
    """Delete a user account and all associated data. Returns list of file paths to delete."""
    conn = get_db_connection()

    # Collect physical file paths for cleanup
    docs = conn.execute('SELECT filename FROM documents WHERE user_id = ?', (user_id,)).fetchall()
    file_paths = [os.path.join('uploads', row['filename']) for row in docs]

    # Also collect profile picture and banner paths
    user = conn.execute('SELECT profile_picture, banner FROM users WHERE id = ?', (user_id,)).fetchone()
    if user:
        for field in ('profile_picture', 'banner'):
            if user[field]:
                file_paths.append(user[field])

    # Cascade delete all user data
    conn.execute('DELETE FROM document_reports WHERE admin_user_id = ?', (user_id,))
    conn.execute('DELETE FROM quiz_results WHERE user_id = ?', (user_id,))
    conn.execute('DELETE FROM flashcards WHERE user_id = ?', (user_id,))
    conn.execute('DELETE FROM document_topics WHERE document_id IN (SELECT id FROM documents WHERE user_id = ?)', (user_id,))
    conn.execute('DELETE FROM documents WHERE user_id = ?', (user_id,))
    conn.execute('DELETE FROM topics WHERE user_id = ?', (user_id,))
    conn.execute('DELETE FROM otp_codes WHERE user_id = ?', (user_id,))
    conn.execute('DELETE FROM password_reset_tokens WHERE user_id = ?', (user_id,))
    try:
        conn.execute('DELETE FROM room_history WHERE host_id = ?', (user_id,))
    except Exception:
        pass
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))

    conn.commit()
    conn.close()
    return file_paths

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
# DOCUMENT & FLASHCARD FUNCTIONS
# ============================================================================

def save_document(user_id, filename, original_filename, file_type, file_path=None):
    """Save a document record and return its ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO documents (user_id, filename, original_filename, file_type, upload_date)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id, filename, original_filename, file_type, datetime.now().isoformat()))
    conn.commit()
    doc_id = cursor.lastrowid
    conn.close()
    return doc_id

def save_flashcards(document_id, user_id, flashcards):
    """Save a list of flashcard dicts [{"question": ..., "answer": ...}, ...]."""
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    for card in flashcards:
        cursor.execute('''
            INSERT INTO flashcards (document_id, user_id, question, answer, created_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (document_id, user_id, card['question'], card['answer'], now))
    conn.commit()
    conn.close()

def get_documents_for_user(user_id):
    """Return all documents for a user as a list of dicts (includes flashcard_count)."""
    conn = get_db_connection()
    rows = conn.execute('''
        SELECT d.*, COALESCE(fc.cnt, 0) AS flashcard_count
        FROM documents d
        LEFT JOIN (SELECT document_id, COUNT(*) AS cnt FROM flashcards GROUP BY document_id) fc
            ON fc.document_id = d.id
        WHERE d.user_id = ?
        ORDER BY d.upload_date DESC
    ''', (user_id,)).fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_flashcards_for_document(document_id, user_id):
    """Return (document_dict, flashcards_list) or (None, []) if not found."""
    conn = get_db_connection()
    doc = conn.execute(
        'SELECT * FROM documents WHERE id = ? AND user_id = ?', (document_id, user_id)
    ).fetchone()
    if doc is None:
        conn.close()
        return None, []
    cards = conn.execute(
        'SELECT * FROM flashcards WHERE document_id = ? ORDER BY id', (document_id,)
    ).fetchall()
    conn.close()
    return dict(doc), [dict(c) for c in cards]

def rename_document(document_id, user_id, new_name):
    """Rename a document's original_filename. Returns True if found and updated."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'UPDATE documents SET original_filename = ? WHERE id = ? AND user_id = ?',
        (new_name, document_id, user_id)
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated

def delete_document_and_flashcards(document_id, user_id):
    """Delete a document and its flashcards. Returns the file path (for physical deletion) or None."""
    conn = get_db_connection()
    doc = conn.execute(
        'SELECT * FROM documents WHERE id = ? AND user_id = ?', (document_id, user_id)
    ).fetchone()
    if doc is None:
        conn.close()
        return None
    file_path = os.path.join('uploads', doc['filename'])
    conn.execute('DELETE FROM document_reports WHERE document_id = ?', (document_id,))
    conn.execute('DELETE FROM quiz_results WHERE document_id = ?', (document_id,))
    conn.execute('DELETE FROM flashcards WHERE document_id = ?', (document_id,))
    conn.execute('DELETE FROM documents WHERE id = ?', (document_id,))
    conn.commit()
    conn.close()
    return file_path

# ============================================================================
# ADMIN CONTENT MODERATION FUNCTIONS
# ============================================================================

def get_all_documents_admin(search=None):
    """Return all documents across all users for admin content moderation.
    Joins with users for uploader name, counts flashcards and pending reports.
    Sorts flagged documents first, then by upload date."""
    conn = get_db_connection()
    query = '''
        SELECT
            d.id, d.original_filename, d.filename, d.file_type, d.upload_date,
            d.user_id,
            u.username AS uploader_username,
            COALESCE(fc.cnt, 0) AS flashcard_count,
            COALESCE(rp.report_count, 0) AS report_count
        FROM documents d
        JOIN users u ON u.id = d.user_id
        LEFT JOIN (
            SELECT document_id, COUNT(*) AS cnt FROM flashcards GROUP BY document_id
        ) fc ON fc.document_id = d.id
        LEFT JOIN (
            SELECT document_id, COUNT(*) AS report_count
            FROM document_reports WHERE status = 'pending'
            GROUP BY document_id
        ) rp ON rp.document_id = d.id
    '''
    params = []
    if search:
        query += " WHERE (u.username LIKE ? OR d.original_filename LIKE ?)"
        params = [f'%{search}%', f'%{search}%']
    query += ' ORDER BY rp.report_count DESC, d.upload_date DESC'
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(row) for row in rows]

def admin_delete_document_by_id(document_id):
    """Admin-only: delete any document regardless of owner.
    Returns the physical file path (for os.remove) or None if not found."""
    conn = get_db_connection()
    doc = conn.execute('SELECT * FROM documents WHERE id = ?', (document_id,)).fetchone()
    if not doc:
        conn.close()
        return None
    file_path = os.path.join('uploads', doc['filename'])
    conn.execute('DELETE FROM document_reports WHERE document_id = ?', (document_id,))
    conn.execute('DELETE FROM quiz_results WHERE document_id = ?', (document_id,))
    conn.execute('DELETE FROM flashcards WHERE document_id = ?', (document_id,))
    conn.execute('DELETE FROM document_topics WHERE document_id = ?', (document_id,))
    conn.execute('DELETE FROM documents WHERE id = ?', (document_id,))
    conn.commit()
    conn.close()
    return file_path

def create_document_report(document_id, admin_user_id, reason):
    """Admin flags a document. Returns (True, report_id) or (False, error_msg)."""
    conn = get_db_connection()
    doc = conn.execute('SELECT id FROM documents WHERE id = ?', (document_id,)).fetchone()
    if not doc:
        conn.close()
        return False, 'Document not found'
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO document_reports (document_id, admin_user_id, reason, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
    ''', (document_id, admin_user_id, reason.strip(), datetime.now().isoformat()))
    conn.commit()
    report_id = cursor.lastrowid
    conn.close()
    return True, report_id

def get_reports_for_document(document_id):
    """Return all reports for a specific document, newest first."""
    conn = get_db_connection()
    rows = conn.execute('''
        SELECT r.id, r.reason, r.status, r.created_at, r.reviewed_at,
               admin.username AS admin_username,
               reviewer.username AS reviewer_username
        FROM document_reports r
        JOIN users admin ON admin.id = r.admin_user_id
        LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
        WHERE r.document_id = ?
        ORDER BY r.created_at DESC
    ''', (document_id,)).fetchall()
    conn.close()
    return [dict(row) for row in rows]

def update_report_status(report_id, new_status, reviewed_by_admin_id):
    """Set report status to 'reviewed' or 'dismissed'. Returns True if updated."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE document_reports
        SET status = ?, reviewed_by = ?, reviewed_at = ?
        WHERE id = ?
    ''', (new_status, reviewed_by_admin_id, datetime.now().isoformat(), report_id))
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated

def get_platform_analytics():
    """Return platform-wide aggregate statistics for the admin Analytics tab."""
    conn = get_db_connection()
    now = datetime.now()
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()

    total_users = conn.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    total_docs = conn.execute('SELECT COUNT(*) FROM documents').fetchone()[0]
    total_flashcards = conn.execute('SELECT COUNT(*) FROM flashcards').fetchone()[0]
    total_quizzes = conn.execute('SELECT COUNT(*) FROM quiz_results').fetchone()[0]
    total_games = conn.execute('SELECT COUNT(*) FROM room_history').fetchone()[0]
    new_users_week = conn.execute(
        'SELECT COUNT(*) FROM users WHERE created_at >= ?', (week_ago,)
    ).fetchone()[0]
    new_users_month = conn.execute(
        'SELECT COUNT(*) FROM users WHERE created_at >= ?', (month_ago,)
    ).fetchone()[0]
    pending_reports = conn.execute(
        "SELECT COUNT(*) FROM document_reports WHERE status = 'pending'"
    ).fetchone()[0]

    conn.close()
    return {
        'total_users': total_users,
        'total_documents': total_docs,
        'total_flashcards': total_flashcards,
        'total_quizzes': total_quizzes,
        'total_games': total_games,
        'new_users_week': new_users_week,
        'new_users_month': new_users_month,
        'pending_reports': pending_reports,
    }

# ============================================================================
# QUIZ FUNCTIONS
# ============================================================================

def save_quiz_result(document_id, user_id, score, total):
    """Save a completed quiz result. Returns the new row id."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO quiz_results (document_id, user_id, score, total, completed_at)
        VALUES (?, ?, ?, ?, ?)
    ''', (document_id, user_id, score, total, datetime.now().isoformat()))
    conn.commit()
    result_id = cursor.lastrowid
    conn.close()
    return result_id

def get_quiz_results_for_user(user_id):
    """Return a dict mapping document_id -> {best_pct, attempts, last_completed_at}."""
    conn = get_db_connection()
    rows = conn.execute('''
        SELECT document_id,
               MAX(score * 100 / total) AS best_pct,
               COUNT(*) AS attempts,
               MAX(completed_at) AS last_completed_at
        FROM quiz_results
        WHERE user_id = ?
        GROUP BY document_id
    ''', (user_id,)).fetchall()
    conn.close()
    result = {}
    for row in rows:
        result[row['document_id']] = dict(row)
    return result

def get_quiz_history_for_document(document_id, user_id):
    """Return list of past quiz attempts for a specific document."""
    conn = get_db_connection()
    rows = conn.execute('''
        SELECT id, score, total, completed_at
        FROM quiz_results
        WHERE document_id = ? AND user_id = ?
        ORDER BY completed_at DESC
        LIMIT 10
    ''', (document_id, user_id)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ============================================================================
# TOPICS FUNCTIONS
# ============================================================================

def create_topic(user_id, name, color='#7c77c6'):
    """Create a new topic for a user. Returns the new topic's id."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO topics (user_id, name, color, created_at) VALUES (?, ?, ?, ?)',
        (user_id, name.strip(), color, datetime.now().isoformat())
    )
    conn.commit()
    topic_id = cursor.lastrowid
    conn.close()
    return topic_id

def get_topics_for_user(user_id):
    """Return all topics for a user, each with a doc_count."""
    conn = get_db_connection()
    rows = conn.execute('''
        SELECT t.id, t.name, t.color, t.created_at,
               COUNT(dt.document_id) AS doc_count
        FROM topics t
        LEFT JOIN document_topics dt ON dt.topic_id = t.id
        WHERE t.user_id = ?
        GROUP BY t.id
        ORDER BY t.created_at DESC
    ''', (user_id,)).fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_topic_by_id(topic_id, user_id):
    """Return a single topic dict (with doc_count), or None if not found/not owned."""
    conn = get_db_connection()
    row = conn.execute('''
        SELECT t.id, t.name, t.color, t.created_at,
               COUNT(dt.document_id) AS doc_count
        FROM topics t
        LEFT JOIN document_topics dt ON dt.topic_id = t.id
        WHERE t.id = ? AND t.user_id = ?
        GROUP BY t.id
    ''', (topic_id, user_id)).fetchone()
    conn.close()
    return dict(row) if row else None

def update_topic(topic_id, user_id, name=None, color=None):
    """Update name and/or color of a topic. Returns True if found and updated."""
    conn = get_db_connection()
    fields, values = [], []
    if name is not None:
        fields.append('name = ?')
        values.append(name.strip())
    if color is not None:
        fields.append('color = ?')
        values.append(color)
    if not fields:
        conn.close()
        return False
    values.extend([topic_id, user_id])
    cursor = conn.cursor()
    cursor.execute(
        f'UPDATE topics SET {", ".join(fields)} WHERE id = ? AND user_id = ?',
        values
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated

def delete_topic(topic_id, user_id):
    """Delete a topic (cascade removes document_topics rows). Returns True if found."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM topics WHERE id = ? AND user_id = ?', (topic_id, user_id))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def add_document_to_topic(document_id, topic_id, user_id):
    """Link a document to a topic. Verifies both belong to user_id."""
    conn = get_db_connection()
    doc = conn.execute(
        'SELECT id FROM documents WHERE id = ? AND user_id = ?', (document_id, user_id)
    ).fetchone()
    topic = conn.execute(
        'SELECT id FROM topics WHERE id = ? AND user_id = ?', (topic_id, user_id)
    ).fetchone()
    if not doc or not topic:
        conn.close()
        return False
    try:
        conn.execute(
            'INSERT INTO document_topics (document_id, topic_id) VALUES (?, ?)',
            (document_id, topic_id)
        )
        conn.commit()
        conn.close()
        return True
    except sqlite3.IntegrityError:
        conn.close()
        return False

def remove_document_from_topic(document_id, topic_id, user_id):
    """Unlink a document from a topic. Verifies ownership."""
    conn = get_db_connection()
    topic = conn.execute(
        'SELECT id FROM topics WHERE id = ? AND user_id = ?', (topic_id, user_id)
    ).fetchone()
    if not topic:
        conn.close()
        return False
    cursor = conn.cursor()
    cursor.execute(
        'DELETE FROM document_topics WHERE document_id = ? AND topic_id = ?',
        (document_id, topic_id)
    )
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def get_documents_for_topic(topic_id, user_id):
    """Return documents inside a topic as simplified list dicts."""
    conn = get_db_connection()
    rows = conn.execute('''
        SELECT d.id, d.original_filename, d.file_type, d.upload_date,
               COALESCE(fc.cnt, 0) AS flashcard_count
        FROM documents d
        JOIN document_topics dt ON dt.document_id = d.id
        LEFT JOIN (
            SELECT document_id, COUNT(*) AS cnt
            FROM flashcards GROUP BY document_id
        ) fc ON fc.document_id = d.id
        WHERE dt.topic_id = ? AND d.user_id = ?
        ORDER BY d.upload_date DESC
    ''', (topic_id, user_id)).fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_topics_for_document(document_id, user_id):
    """Return all topics a given document belongs to."""
    conn = get_db_connection()
    rows = conn.execute('''
        SELECT t.id, t.name, t.color
        FROM topics t
        JOIN document_topics dt ON dt.topic_id = t.id
        WHERE dt.document_id = ? AND t.user_id = ?
        ORDER BY t.name ASC
    ''', (document_id, user_id)).fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_topics_for_all_documents(user_id):
    """Return a dict mapping document_id -> list of {id, name, color} for all user docs."""
    conn = get_db_connection()
    rows = conn.execute('''
        SELECT dt.document_id, t.id, t.name, t.color
        FROM document_topics dt
        JOIN topics t ON t.id = dt.topic_id
        WHERE t.user_id = ?
        ORDER BY t.name ASC
    ''', (user_id,)).fetchall()
    conn.close()
    result = {}
    for row in rows:
        doc_id = row['document_id']
        if doc_id not in result:
            result[doc_id] = []
        result[doc_id].append({'id': row['id'], 'name': row['name'], 'color': row['color']})
    return result

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