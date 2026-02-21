import sqlite3
from datetime import datetime
import sys

def view_database():
    """View all data in the MindLobby database"""
    
    try:
        from tabulate import tabulate
        
        # Connect to database
        conn = sqlite3.connect('mindlobby.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        print("\n" + "="*100)
        print("MINDLOBBY DATABASE VIEWER - ENHANCED SECURITY EDITION")
        print("="*100 + "\n")
        
        # View Users Table
        print("📊 USERS TABLE")
        print("-" * 100)
        cursor.execute('SELECT * FROM users')
        users = cursor.fetchall()
        
        if users:
            user_data = []
            for user in users:
                # Handle email_verified field - check if column exists
                try:
                    email_verified = user['email_verified']
                except (KeyError, IndexError):
                    email_verified = 0
                
                user_data.append([
                    user['id'],
                    user['username'],
                    user['email'],
                    user['role'],
                    '✅' if email_verified == 1 else '❌',
                    user['created_at'][:10] if user['created_at'] else 'N/A',
                    user['last_login'][:10] if user['last_login'] else 'Never'
                ])
            
            headers = ['ID', 'Username', 'Email', 'Role', 'Verified', 'Created', 'Last Login']
            print(tabulate(user_data, headers=headers, tablefmt='grid'))
            print(f"\nTotal Users: {len(users)}\n")
        else:
            print("No users found.\n")
        
        # View Password Reset Tokens (NEW)
        print("🔑 PASSWORD RESET TOKENS")
        print("-" * 100)
        cursor.execute('SELECT * FROM password_reset_tokens ORDER BY created_at DESC LIMIT 10')
        tokens = cursor.fetchall()
        
        if tokens:
            token_data = []
            for token in tokens:
                # Safe access to potentially missing columns
                try:
                    used = token['used']
                except (KeyError, IndexError):
                    used = 0
                
                try:
                    request_ip = token['request_ip']
                except (KeyError, IndexError):
                    request_ip = 'N/A'
                
                token_data.append([
                    token['id'],
                    token['user_id'],
                    token['token_hash'][:16] + '...',
                    '✅' if used == 1 else '⏳',
                    token['created_at'][:16] if token['created_at'] else 'N/A',
                    token['expires_at'][:16] if token['expires_at'] else 'N/A',
                    request_ip
                ])
            
            headers = ['ID', 'User', 'Token Hash', 'Used', 'Created', 'Expires', 'IP']
            print(tabulate(token_data, headers=headers, tablefmt='grid'))
            print(f"\nTotal Reset Tokens (last 10): {len(tokens)}\n")
        else:
            print("No password reset tokens found.\n")
        
        # View Banned Entities (NEW)
        print("🚫 BANNED ENTITIES (SECURITY)")
        print("-" * 100)
        cursor.execute('SELECT * FROM banned_entities ORDER BY banned_at DESC')
        bans = cursor.fetchall()
        
        if bans:
            ban_data = []
            for ban in bans:
                expires_dt = datetime.fromisoformat(ban['expires_at']) if ban['expires_at'] else None
                is_active = '🔴 ACTIVE' if (ban['permanent'] == 1 or (expires_dt and expires_dt > datetime.now())) else '🟢 EXPIRED'
                
                ban_data.append([
                    ban['id'],
                    ban['ip_address'] or 'N/A',
                    ban['fingerprint'][:16] + '...' if ban['fingerprint'] else 'N/A',
                    ban['reason'][:30] + '...' if len(ban['reason']) > 30 else ban['reason'],
                    ban['ban_count'],
                    is_active,
                    '♾️' if ban['permanent'] == 1 else ban['expires_at'][:16]
                ])
            
            headers = ['ID', 'IP Address', 'Fingerprint', 'Reason', 'Count', 'Status', 'Expires']
            print(tabulate(ban_data, headers=headers, tablefmt='grid'))
            print(f"\nTotal Bans: {len(bans)}\n")
        else:
            print("No banned entities found. ✅\n")
        
        # View Admin Audit Log (NEW)
        print("📝 ADMIN AUDIT LOG (Last 20 actions)")
        print("-" * 100)
        cursor.execute('SELECT * FROM admin_audit_log ORDER BY timestamp DESC LIMIT 20')
        logs = cursor.fetchall()
        
        if logs:
            log_data = []
            for log in logs:
                log_data.append([
                    log['id'],
                    log['admin_user_id'] or 'N/A',
                    log['action'][:30] + '...' if len(log['action']) > 30 else log['action'],
                    log['ip_address'] or 'N/A',
                    log['timestamp'][:16] if log['timestamp'] else 'N/A'
                ])
            
            headers = ['ID', 'Admin', 'Action', 'IP', 'Timestamp']
            print(tabulate(log_data, headers=headers, tablefmt='grid'))
            print(f"\nTotal Audit Logs (showing last 20): {len(logs)}\n")
        else:
            print("No admin audit logs found.\n")
        
        # View Failed Login Attempts (NEW)
        print("❌ FAILED LOGIN ATTEMPTS (Last 20)")
        print("-" * 100)
        cursor.execute('SELECT * FROM failed_login_attempts ORDER BY attempted_at DESC LIMIT 20')
        attempts = cursor.fetchall()
        
        if attempts:
            attempt_data = []
            for attempt in attempts:
                attempt_data.append([
                    attempt['id'],
                    attempt['ip_address'] or 'N/A',
                    attempt['fingerprint'][:16] + '...' if attempt['fingerprint'] else 'N/A',
                    attempt['reason'][:40] if attempt['reason'] else 'N/A',
                    attempt['attempted_at'][:16] if attempt['attempted_at'] else 'N/A'
                ])
            
            headers = ['ID', 'IP', 'Fingerprint', 'Reason', 'Timestamp']
            print(tabulate(attempt_data, headers=headers, tablefmt='grid'))
            print(f"\nTotal Failed Attempts (showing last 20): {len(attempts)}\n")
        else:
            print("No failed login attempts found. ✅\n")
        
        # View Documents Table
        print("📄 DOCUMENTS TABLE")
        print("-" * 100)
        cursor.execute('SELECT * FROM documents')
        documents = cursor.fetchall()
        
        if documents:
            doc_data = []
            for doc in documents:
                doc_data.append([
                    doc['id'],
                    doc['user_id'],
                    doc['filename'][:30] + '...' if len(doc['filename']) > 30 else doc['filename'],
                    doc['file_type'],
                    doc['upload_date'][:10] if doc['upload_date'] else 'N/A'
                ])
            
            headers = ['ID', 'User ID', 'Filename', 'Type', 'Uploaded']
            print(tabulate(doc_data, headers=headers, tablefmt='grid'))
            print(f"\nTotal Documents: {len(documents)}\n")
        else:
            print("No documents found.\n")
        
        # View Room History Table
        print("🏠 ROOM HISTORY TABLE")
        print("-" * 100)
        cursor.execute('SELECT * FROM room_history')
        rooms = cursor.fetchall()
        
        if rooms:
            room_data = []
            for room in rooms:
                room_data.append([
                    room['id'],
                    room['room_code'],
                    room['host_id'] if room['host_id'] else 'N/A',
                    room['created_at'][:16] if room['created_at'] else 'N/A',
                    room['ended_at'][:16] if room['ended_at'] else 'Active'
                ])
            
            headers = ['ID', 'Room Code', 'Host ID', 'Created', 'Ended']
            print(tabulate(room_data, headers=headers, tablefmt='grid'))
            print(f"\nTotal Room Records: {len(rooms)}\n")
        else:
            print("No room history found.\n")
        
        # Enhanced Database Statistics
        print("📈 DATABASE STATISTICS")
        print("-" * 100)
        
        cursor.execute('SELECT COUNT(*) as count FROM users')
        user_count = cursor.fetchone()['count']
        
        cursor.execute('SELECT COUNT(*) as count FROM users WHERE email_verified = 1')
        verified_count = cursor.fetchone()['count']
        
        cursor.execute('SELECT COUNT(*) as count FROM documents')
        doc_count = cursor.fetchone()['count']
        
        cursor.execute('SELECT COUNT(*) as count FROM room_history')
        room_count = cursor.fetchone()['count']
        
        cursor.execute('SELECT COUNT(*) as count FROM password_reset_tokens WHERE used = 0')
        active_tokens = cursor.fetchone()['count']
        
        cursor.execute('''
            SELECT COUNT(*) as count FROM banned_entities 
            WHERE permanent = 1 OR datetime(expires_at) > datetime('now')
        ''')
        active_bans = cursor.fetchone()['count']
        
        cursor.execute('SELECT COUNT(*) as count FROM failed_login_attempts')
        failed_attempts = cursor.fetchone()['count']
        
        stats = [
            ['Total Users', user_count],
            ['Verified Users', verified_count],
            ['Unverified Users', user_count - verified_count],
            ['Total Documents', doc_count],
            ['Total Room Sessions', room_count],
            ['Active Reset Tokens', active_tokens],
            ['Active Bans', active_bans],
            ['Total Failed Login Attempts', failed_attempts]
        ]
        
        print(tabulate(stats, headers=['Metric', 'Count'], tablefmt='grid'))
        print("\n" + "="*100 + "\n")
        
        conn.close()
        
    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
    except Exception as e:
        print(f"❌ Error: {e}")

def emergency_unban_ip():
    """EMERGENCY: Unban a specific IP address"""
    print("\n🚨 EMERGENCY UNBAN UTILITY")
    print("="*80)
    print("This will immediately unban an IP address from the security blacklist.")
    print("")
    
    ip_address = input("Enter IP address to unban (or 'YOUR_IP' for auto-detect): ").strip()
    
    if ip_address.upper() == 'YOUR_IP':
        # Try to detect current IP from common sources
        try:
            import socket
            hostname = socket.gethostname()
            ip_address = socket.gethostbyname(hostname)
            print(f"Auto-detected IP: {ip_address}")
        except:
            ip_address = "127.0.0.1"
            print(f"Could not auto-detect. Using localhost: {ip_address}")
    
    confirm = input(f"\n⚠️  Unban IP '{ip_address}'? Type 'UNBAN' to confirm: ").strip()
    
    if confirm == 'UNBAN':
        try:
            conn = sqlite3.connect('mindlobby.db')
            cursor = conn.cursor()
            
            cursor.execute('DELETE FROM banned_entities WHERE ip_address = ?', (ip_address,))
            deleted = cursor.rowcount
            
            conn.commit()
            conn.close()
            
            if deleted > 0:
                print(f"\n✅ Successfully unbanned IP: {ip_address} ({deleted} record(s) removed)")
            else:
                print(f"\n⚠️  No ban records found for IP: {ip_address}")
        
        except Exception as e:
            print(f"\n❌ Error unbanning IP: {e}")
    else:
        print("\n❌ Unban cancelled.")

def emergency_unban_all():
    """EMERGENCY: Clear all bans (nuclear option)"""
    print("\n🚨🚨🚨 NUCLEAR OPTION: CLEAR ALL BANS 🚨🚨🚨")
    print("="*80)
    print("⚠️  WARNING: This will remove ALL security bans from the database!")
    print("⚠️  Only use this if you are completely locked out!")
    print("")
    
    confirm1 = input("Type 'I UNDERSTAND THE RISKS' to proceed: ").strip()
    
    if confirm1 == 'I UNDERSTAND THE RISKS':
        confirm2 = input("Type 'CLEAR ALL BANS' to confirm: ").strip()
        
        if confirm2 == 'CLEAR ALL BANS':
            try:
                conn = sqlite3.connect('mindlobby.db')
                cursor = conn.cursor()
                
                cursor.execute('SELECT COUNT(*) FROM banned_entities')
                count_before = cursor.fetchone()[0]
                
                cursor.execute('DELETE FROM banned_entities')
                cursor.execute('DELETE FROM failed_login_attempts')
                
                conn.commit()
                conn.close()
                
                print(f"\n✅ ALL BANS CLEARED!")
                print(f"   - {count_before} ban record(s) removed")
                print(f"   - All failed login attempts cleared")
                print(f"\n⚠️  Security logs have been reset. Monitor for suspicious activity.")
            
            except Exception as e:
                print(f"\n❌ Error clearing bans: {e}")
        else:
            print("\n❌ Operation cancelled.")
    else:
        print("\n❌ Operation cancelled.")

def view_security_details():
    """View detailed security information"""
    try:
        from tabulate import tabulate
        
        conn = sqlite3.connect('mindlobby.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        print("\n" + "="*100)
        print("SECURITY DETAILS - BANNED ENTITIES")
        print("="*100 + "\n")
        
        cursor.execute('SELECT * FROM banned_entities ORDER BY banned_at DESC')
        bans = cursor.fetchall()
        
        if bans:
            for ban in bans:
                print(f"Ban ID: {ban['id']}")
                print(f"  IP Address: {ban['ip_address'] or 'N/A'}")
                print(f"  Fingerprint: {ban['fingerprint'] or 'N/A'}")
                print(f"  Reason: {ban['reason']}")
                print(f"  Ban Count: {ban['ban_count']}")
                print(f"  Banned At: {ban['banned_at']}")
                print(f"  Expires At: {'PERMANENT' if ban['permanent'] == 1 else ban['expires_at']}")
                
                # Check if active
                if ban['permanent'] == 1:
                    print(f"  Status: 🔴 PERMANENT BAN")
                else:
                    expires_dt = datetime.fromisoformat(ban['expires_at'])
                    if expires_dt > datetime.now():
                        remaining = expires_dt - datetime.now()
                        print(f"  Status: 🔴 ACTIVE (expires in {remaining})")
                    else:
                        print(f"  Status: 🟢 EXPIRED")
                
                print("-" * 100)
        else:
            print("No bans found. ✅\n")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")

def cleanup_expired_data():
    """Clean up expired tokens and bans"""
    print("\n🧹 CLEANUP UTILITY")
    print("="*80)
    
    try:
        conn = sqlite3.connect('mindlobby.db')
        cursor = conn.cursor()
        
        # Cleanup expired OTP codes
        cursor.execute('DELETE FROM otp_codes WHERE datetime(expires_at) < datetime("now")')
        deleted_otps = cursor.rowcount
        
        # Cleanup expired password reset tokens
        cursor.execute('DELETE FROM password_reset_tokens WHERE datetime(expires_at) < datetime("now")')
        deleted_tokens = cursor.rowcount
        
        # Cleanup expired bans
        cursor.execute('''
            DELETE FROM banned_entities 
            WHERE permanent = 0 AND datetime(expires_at) < datetime("now")
        ''')
        deleted_bans = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        print(f"\n✅ Cleanup complete:")
        print(f"   - {deleted_otps} expired OTP codes removed")
        print(f"   - {deleted_tokens} expired reset tokens removed")
        print(f"   - {deleted_bans} expired bans removed\n")
        
    except Exception as e:
        print(f"❌ Error during cleanup: {e}")

def search_user(search_term):
    """Search for a specific user by username or email"""
    try:
        conn = sqlite3.connect('mindlobby.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM users 
            WHERE username LIKE ? OR email LIKE ?
        ''', (f'%{search_term}%', f'%{search_term}%'))
        
        users = cursor.fetchall()
        
        if users:
            print("\n🔍 SEARCH RESULTS")
            print("-" * 80)
            for user in users:
                # Safe access to email_verified
                try:
                    email_verified = user['email_verified']
                except (KeyError, IndexError):
                    email_verified = 0
                
                print(f"ID: {user['id']}")
                print(f"Username: {user['username']}")
                print(f"Email: {user['email']}")
                print(f"Role: {user['role']}")
                print(f"Email Verified: {'✅ Yes' if email_verified == 1 else '❌ No'}")
                print(f"Created: {user['created_at']}")
                print(f"Last Login: {user['last_login'] if user['last_login'] else 'Never'}")
                print("-" * 80)
        else:
            print("\n❌ No users found matching your search.\n")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")

def delete_user(user_id):
    """Delete a user by ID"""
    try:
        conn = sqlite3.connect('mindlobby.db')
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()
        
        if not user:
            print(f"\n❌ User with ID {user_id} not found.\n")
            conn.close()
            return
        
        # Confirm deletion
        print(f"\n⚠️  You are about to delete:")
        print(f"   ID: {user[0]}")
        print(f"   Username: {user[2]}")
        print(f"   Email: {user[1]}")
        
        confirm = input("\nType 'DELETE' to confirm: ").strip()
        
        if confirm == 'DELETE':
            cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
            conn.commit()
            print(f"\n✅ User {user[2]} deleted successfully.\n")
        else:
            print("\n❌ Deletion cancelled.\n")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == '__main__':
    # Check if tabulate is installed
    try:
        from tabulate import tabulate
    except ImportError:
        print("\n⚠️  Installing required package 'tabulate'...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "tabulate"])
    
    while True:
        print("\n🧠 MindLobby Database Viewer - SECURITY EDITION")
        print("Choose an option:")
        print("1. View all data (including security tables)")
        print("2. Search for a user")
        print("3. Delete a user")
        print("4. View security details (bans, attempts)")
        print("5. 🚨 EMERGENCY: Unban specific IP")
        print("6. 🚨🚨 NUCLEAR: Clear ALL bans")
        print("7. 🧹 Cleanup expired data")
        print("8. Exit")
        
        choice = input("\nEnter choice (1-8): ").strip()
        
        if choice == '1':
            view_database()
        elif choice == '2':
            search_term = input("Enter username or email to search: ").strip()
            if search_term:
                search_user(search_term)
            else:
                print("❌ Invalid search term.")
        elif choice == '3':
            try:
                user_id = int(input("Enter user ID to delete: ").strip())
                delete_user(user_id)
            except ValueError:
                print("❌ Invalid user ID. Please enter a number.")
        elif choice == '4':
            view_security_details()
        elif choice == '5':
            emergency_unban_ip()
        elif choice == '6':
            emergency_unban_all()
        elif choice == '7':
            cleanup_expired_data()
        elif choice == '8':
            print("👋 Goodbye!")
            break
        else:
            print("❌ Invalid choice.")