import sqlite3
import os

print("🔍 Current working directory:", os.getcwd())
print("📂 Files in current directory:")
for file in os.listdir('.'):
    print(f"  - {file}")

print("\n🔨 Creating database...")

# Create database
conn = sqlite3.connect('mindlobby.db')
cursor = conn.cursor()

# Create users table with email_verified
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

# Create OTP table
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

# Create password reset table
cursor.execute('''
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
''')

# Create documents table
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

# Create room history table
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

print("✅ Database created successfully!")

# Verify the file exists
if os.path.exists('mindlobby.db'):
    print("✅ mindlobby.db file exists!")
    print(f"📍 Full path: {os.path.abspath('mindlobby.db')}")
    print(f"📏 File size: {os.path.getsize('mindlobby.db')} bytes")
else:
    print("❌ ERROR: mindlobby.db was NOT created!")

print("\n📂 Files in current directory after creation:")
for file in os.listdir('.'):
    print(f"  - {file}")