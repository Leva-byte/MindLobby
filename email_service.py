import resend
import random
import string
import os
from dotenv import load_dotenv
from datetime import datetime

# Load environment variables
load_dotenv()

# Email configuration
resend.api_key = os.getenv('RESEND_API_KEY')
SENDER_EMAIL = os.getenv('SENDER_EMAIL', 'onboarding@resend.dev')

def generate_otp(length=6):
    """Generate a random 6-digit OTP"""
    return ''.join(random.choices(string.digits, k=length))

def send_email(to_email, subject, html_content):
    """
    Send an email using Resend API (production/Railway) or
    Gmail SMTP as fallback (local debug mode).
    Returns (success, message)
    """
    # Use Resend if API key is present (Railway/production)
    if os.getenv('RESEND_API_KEY'):
        try:
            resend.Emails.send({
                "from": f"MindLobby <{SENDER_EMAIL}>",
                "to": [to_email],
                "subject": subject,
                "html": html_content,
            })
            return True, "Email sent successfully"
        except Exception as e:
            return False, f"Failed to send email: {str(e)}"

    # Fallback: Gmail SMTP for local debug mode
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    smtp_server = "smtp.gmail.com"
    smtp_port = 587
    sender_password = os.getenv('SENDER_APP_PASSWORD')

    try:
        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = f"MindLobby <{os.getenv('SENDER_EMAIL')}>"
        message['To'] = to_email
        message.attach(MIMEText(html_content, 'html'))

        try:
            with smtplib.SMTP_SSL(smtp_server, 465) as server:
                server.login(os.getenv('SENDER_EMAIL'), sender_password)
                server.send_message(message)
        except OSError:
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(os.getenv('SENDER_EMAIL'), sender_password)
                server.send_message(message)

        return True, "Email sent successfully"
    except Exception as e:
        return False, f"Failed to send email: {str(e)}"

def send_otp_email(to_email, username, otp):
    """Send OTP verification email"""
    subject = "Verify Your MindLobby Account"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; background: #0f0f23; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #1a1a3e; border-radius: 20px; 
                         padding: 40px; border: 1px solid #7c77c6; }}
            h1 {{ color: #7c77c6; text-align: center; }}
            p {{ color: rgba(255, 255, 255, 0.8); text-align: center; line-height: 1.6; }}
            .otp-box {{ background: rgba(0, 0, 0, 0.3); border: 2px solid #7c77c6; border-radius: 12px; 
                       padding: 30px; text-align: center; margin: 30px 0; }}
            .otp-code {{ font-size: 48px; font-weight: 800; color: #7c77c6; letter-spacing: 10px; }}
            .footer {{ text-align: center; margin-top: 40px; color: rgba(255, 255, 255, 0.5); font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Welcome, {username}!</h1>
            <p>Thank you for signing up. Please verify your email address.</p>
            
            <div class="otp-box">
                <div class="otp-code">{otp}</div>
                <p style="color: rgba(255, 255, 255, 0.6); margin-top: 10px;">Your Verification Code</p>
            </div>
            
            <p>Enter this code to activate your account.</p>
            <p><strong>This code expires in 10 minutes.</strong></p>
            
            <div class="footer">
                <p>© 2025 MindLobby - Study Together, Think Smarter</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(to_email, subject, html_content)

def send_welcome_email(to_email, username):
    """Send welcome email after verification"""
    subject = "Welcome to MindLobby! 🎉"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; background: #0f0f23; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #1a1a3e; border-radius: 20px; 
                         padding: 40px; border: 1px solid #7c77c6; }}
            h1 {{ color: #7c77c6; text-align: center; }}
            p {{ color: rgba(255, 255, 255, 0.8); text-align: center; line-height: 1.6; }}
            .footer {{ text-align: center; margin-top: 40px; color: rgba(255, 255, 255, 0.5); font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Welcome to MindLobby!</h1>
            <p>Hi {username},</p>
            <p>Your account has been successfully verified! You're ready to start learning.</p>
            
            <div class="footer">
                <p>© 2025 MindLobby - Study Together, Think Smarter</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(to_email, subject, html_content)

def send_password_reset_email(to_email, username, reset_link, request_ip=None, request_user_agent=None, request_time=None):
    """
    Send password reset email with link
    ⭐ SECURITY: Includes request metadata (IP, browser, time) for transparency
    """
    subject = "Reset Your MindLobby Password"
    
    # Format request metadata for display
    metadata_section = ""
    if request_ip or request_user_agent or request_time:
        # Parse user agent for better display
        browser_info = "Unknown browser"
        if request_user_agent:
            user_agent = str(request_user_agent)
            if 'Chrome' in user_agent:
                browser_info = "Chrome"
            elif 'Firefox' in user_agent:
                browser_info = "Firefox"
            elif 'Safari' in user_agent and 'Chrome' not in user_agent:
                browser_info = "Safari"
            elif 'Edge' in user_agent:
                browser_info = "Edge"
        
        # Format timestamp
        time_str = "Unknown time"
        if request_time:
            try:
                dt = datetime.fromisoformat(request_time)
                time_str = dt.strftime("%B %d, %Y at %I:%M %p")
            except:
                time_str = str(request_time)
        
        metadata_section = f"""
        <div style="background: rgba(0, 0, 0, 0.2); border-left: 4px solid #7c77c6; padding: 15px; margin: 20px 0; border-radius: 8px;">
            <p style="margin: 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; text-align: left;">
                <strong>Request Details:</strong><br>
                📍 IP Address: {request_ip or 'Unknown'}<br>
                🌐 Browser: {browser_info}<br>
                🕐 Time: {time_str}
            </p>
        </div>
        <p style="color: rgba(255, 255, 255, 0.7); font-size: 13px;">
            If these details don't match your request, <strong>do not click the reset link</strong> and change your email password immediately.
        </p>
        """
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; background: #0f0f23; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #1a1a3e; border-radius: 20px; 
                         padding: 40px; border: 1px solid #7c77c6; }}
            h1 {{ color: #7c77c6; text-align: center; }}
            p {{ color: rgba(255, 255, 255, 0.8); line-height: 1.6; }}
            .reset-box {{ background: rgba(0, 0, 0, 0.3); border: 2px solid #7c77c6; border-radius: 12px; 
                         padding: 30px; text-align: center; margin: 30px 0; }}
            .reset-btn {{ display: inline-block; background: linear-gradient(135deg, #7c77c6 0%, #a8a4e3 100%); 
                         color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; 
                         font-weight: 700; margin: 20px 0; }}
            .warning {{ background: rgba(231, 76, 60, 0.1); border-left: 4px solid #e74c3c; 
                       padding: 15px; margin: 20px 0; border-radius: 8px; }}
            .footer {{ text-align: center; margin-top: 40px; color: rgba(255, 255, 255, 0.5); font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Password Reset Request</h1>
            <p>Hi {username},</p>
            <p>We received a request to reset your MindLobby password. Click the button below to create a new password:</p>
            
            <div class="reset-box">
                <a href="{reset_link}" class="reset-btn">Reset Password</a>
            </div>
            
            <p style="text-align: center; color: rgba(255, 255, 255, 0.6); font-size: 14px;">
                Or copy this link: <br>
                <span style="word-break: break-all;">{reset_link}</span>
            </p>
            
            {metadata_section}
            
            <div class="warning">
                <p style="margin: 0; color: #e74c3c;">
                    <strong>⚠️ Security Notice:</strong><br>
                    • This link expires in 1 hour<br>
                    • If you didn't request this reset, please ignore this email<br>
                    • Never share this link with anyone
                </p>
            </div>
            
            <div class="footer">
                <p>© 2025 MindLobby - Study Together, Think Smarter</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(to_email, subject, html_content)

def send_contact_email(first_name, last_name, email, subject_type, message):
    """Send contact form submission to support inbox"""
    subject_labels = {
        'general': 'General Inquiry',
        'bug': 'Bug Report',
        'feature': 'Feature Request',
        'account': 'Account Issue',
        'feedback': 'Feedback',
        'other': 'Other',
    }
    subject_label = subject_labels.get(subject_type, subject_type.title())
    subject = f"[MindLobby Contact] {subject_label} from {first_name} {last_name}"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; background: #0f0f23; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #1a1a3e; border-radius: 20px;
                         padding: 40px; border: 1px solid #7c77c6; }}
            h1 {{ color: #7c77c6; }}
            .meta {{ background: rgba(0,0,0,0.2); border-left: 4px solid #7c77c6;
                    padding: 15px; border-radius: 8px; margin: 20px 0; }}
            .meta p {{ color: rgba(255,255,255,0.85); font-size: 14px; margin: 4px 0; }}
            .message-box {{ background: rgba(0,0,0,0.3); border: 1px solid rgba(124,119,198,0.3);
                           border-radius: 12px; padding: 20px; margin-top: 20px; }}
            .message-box p {{ color: rgba(255,255,255,0.8); line-height: 1.7; white-space: pre-wrap; }}
            .footer {{ text-align: center; margin-top: 40px; color: rgba(255,255,255,0.5); font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>New Contact Form Submission</h1>
            <div class="meta">
                <p><strong>Name:</strong> {first_name} {last_name}</p>
                <p><strong>Email:</strong> {email}</p>
                <p><strong>Subject:</strong> {subject_label}</p>
                <p><strong>Time:</strong> {datetime.utcnow().strftime("%B %d, %Y at %I:%M %p UTC")}</p>
            </div>
            <div class="message-box">
                <p>{message}</p>
            </div>
            <div class="footer">
                <p>© 2025 MindLobby — Reply directly to this email to respond to the sender.</p>
            </div>
        </div>
    </body>
    </html>
    """

    # Send to your support inbox; Reply-To goes to the user
    # Use Resend if API key is present (Railway/production)
    if os.getenv('RESEND_API_KEY'):
        try:
            resend.Emails.send({
                "from": f"MindLobby Contact <{SENDER_EMAIL}>",
                "to": [SENDER_EMAIL],
                "reply_to": f"{first_name} {last_name} <{email}>",
                "subject": subject,
                "html": html_content,
            })
            return True, "Message sent successfully"
        except Exception as e:
            return False, f"Failed to send message: {str(e)}"

    # Fallback: Gmail SMTP for local debug mode
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"MindLobby Contact <{SENDER_EMAIL}>"
        msg['To'] = SENDER_EMAIL
        msg['Reply-To'] = f"{first_name} {last_name} <{email}>"
        msg.attach(MIMEText(html_content, 'html'))

        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(SENDER_EMAIL, os.getenv('SENDER_APP_PASSWORD'))
                server.send_message(msg)
        except OSError:
            with smtplib.SMTP("smtp.gmail.com", 587) as server:
                server.starttls()
                server.login(SENDER_EMAIL, os.getenv('SENDER_APP_PASSWORD'))
                server.send_message(msg)

        return True, "Message sent successfully"
    except Exception as e:
        return False, f"Failed to send message: {str(e)}"