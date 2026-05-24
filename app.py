# pyrefly: ignore [missing-import]
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session, send_file
# pyrefly: ignore [missing-import]
from flask_login import (
    LoginManager, UserMixin,
    login_user, logout_user, login_required, current_user
)
# pyrefly: ignore [missing-import]
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import json
from datetime import datetime, date, timedelta
import os
import secrets
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from flask_cors import CORS 
app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = os.path.join('static', 'uploads', 'avatars')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# ─── Secret key (stable across restarts) ──────────────────────────────────────
SECRET_KEY_FILE = os.path.join(os.path.dirname(__file__), '.secret_key')
if os.path.exists(SECRET_KEY_FILE):
    with open(SECRET_KEY_FILE, 'r') as f:
        app.secret_key = f.read().strip()
else:
    key = secrets.token_hex(32)
    with open(SECRET_KEY_FILE, 'w') as f:
        f.write(key)
    app.secret_key = key

# Permanent sessions – cookies live for 10 years ("forever")
app.config['REMEMBER_COOKIE_DURATION'] = timedelta(days=3650)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=3650)
app.config['REMEMBER_COOKIE_SECURE'] = False   # set True in production (HTTPS)
app.config['REMEMBER_COOKIE_HTTPONLY'] = True

@app.after_request
def add_header(r):
    """Prevent caching of static files in development."""
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    return r

DB_PATH = os.path.join(os.path.dirname(__file__), 'wellbeing.db')

# ─── Flask-Login setup ────────────────────────────────────────────────────────
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = ''          # suppress default flash

class User(UserMixin):
    def __init__(self, id_, username, email, phone=None, bio=None, avatar_url=None, gender=None, switch_token=None, sound_style='short', notifications_enabled='true'):
        self.id           = id_
        self.username     = username
        self.email        = email
        self.phone        = phone
        self.bio          = bio
        self.avatar_url   = avatar_url
        self.gender       = gender
        self.switch_token = switch_token
        self.sound_style  = sound_style
        self.notifications_enabled = notifications_enabled

@login_manager.user_loader
def load_user(user_id):
    conn = get_db()
    row  = conn.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
    conn.close()
    if row:
        u = dict(row)
        return User(
            u['id'], 
            u['username'], 
            u['email'], 
            u.get('phone'), 
            u.get('bio'), 
            u.get('avatar_url'), 
            u.get('gender'), 
            u.get('switch_token'),
            u.get('sound_style', 'short'),
            u.get('notifications_enabled', 'true')
        )
    return None

# ─── Database Initialization ───────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA journal_mode=WAL')
    c = conn.cursor()

    # Users table
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            username     TEXT    NOT NULL UNIQUE,
            email        TEXT    NOT NULL UNIQUE,
            password     TEXT    NOT NULL,
            phone        TEXT,
            bio          TEXT,
            avatar_url   TEXT,
            gender       TEXT,
            switch_token TEXT,
            sound_style  TEXT    DEFAULT 'short',
            created_at   TEXT    DEFAULT (datetime('now'))
        )
    ''')

    # Migration for existing users
    try:
        c.execute('ALTER TABLE users ADD COLUMN phone TEXT')
    except: pass
    try:
        c.execute('ALTER TABLE users ADD COLUMN bio TEXT')
    except: pass
    try:
        c.execute('ALTER TABLE users ADD COLUMN avatar_url TEXT')
    except: pass
    try:
        c.execute('ALTER TABLE users ADD COLUMN gender TEXT')
    except: pass
    try:
        c.execute('ALTER TABLE users ADD COLUMN switch_token TEXT')
    except: pass
    try:
        c.execute('ALTER TABLE users ADD COLUMN sound_style TEXT DEFAULT "short"')
    except: pass
    try:
        c.execute('ALTER TABLE users ADD COLUMN notifications_enabled TEXT DEFAULT "true"')
    except: pass

    # Sessions table (scoped per user)
    c.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL DEFAULT 1,
            date        TEXT    NOT NULL,
            category    TEXT    NOT NULL,
            app_name    TEXT    NOT NULL,
            minutes     REAL    NOT NULL,
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    ''')

    # Eye care log table
    c.execute('''
        CREATE TABLE IF NOT EXISTS eye_care_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL DEFAULT 1,
            logged_at   TEXT    DEFAULT (datetime('now'))
        )
    ''')

    # Time limits table
    c.execute('''
        CREATE TABLE IF NOT EXISTS time_limits (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id        INTEGER NOT NULL,
            app_name       TEXT    NOT NULL,
            limit_minutes  REAL    NOT NULL,
            UNIQUE(user_id, app_name)
        )
    ''')

    # ── Safe migration: add user_id to old DBs that don't have it ─────────────
    for table in ('sessions', 'eye_care_log'):
        try:
            c.execute(f'ALTER TABLE {table} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1')
        except sqlite3.OperationalError:
            pass   # column already exists — nothing to do

    # ── Safe migration: add is_auto to sessions table ────────────────────────
    try:
        c.execute('ALTER TABLE sessions ADD COLUMN is_auto INTEGER DEFAULT 0')
    except sqlite3.OperationalError:
        pass

    # ── Migration: Migrate all 'social' category sessions to 'entertainment' ──
    try:
        c.execute("UPDATE sessions SET category = 'entertainment' WHERE category = 'social'")
    except Exception as e:
        print(f"[-] Migration error: {e}")

    conn.commit()
    conn.close()

init_db()

# ─── Helpers ───────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.row_factory = sqlite3.Row
    return conn

def compute_balance_score(study_min, entertainment_min, social_min, work_min, other_min, total_min, eye_breaks=0):
    """
    Health-First Digital Balance Score (0–100):
    - Incentivizes lower screen times (the lower the screen time, the higher the score).
    - Substantially rewards frequent eye breaks (+8 points per break, up to +40).
    - Offsets slightly for productive time vs excessive leisure screen time.
    """
    if total_min == 0:
        return 100  # Perfect score for zero screen time

    # 1. Base Score
    base_score = 100

    # 2. Smooth Time Penalty (deducts more as total screen time grows)
    if total_min <= 60:
        time_penalty = (total_min / 60) * 8
    elif total_min <= 180:
        time_penalty = 8 + ((total_min - 60) / 120) * 22
    else:
        time_penalty = 30 + ((total_min - 180) / 300) * 50

    # 3. Category Adjustments (minor offsets for study/work vs social/entertainment)
    prod_offset = min(15, (study_min * 0.05) + (work_min * 0.03))
    leisure_offset = min(15, (social_min * 0.05) + (entertainment_min * 0.03))

    # 4. Eye Break Bonus
    break_bonus = min(40, eye_breaks * 8)

    # Calculate final score
    score = base_score - time_penalty + prod_offset - leisure_offset + break_bonus
    
    return int(round(max(0, min(100, score))))

# ─── Auth Routes ───────────────────────────────────────────────────────────────
@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for('index'))

    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email    = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm  = request.form.get('confirm', '')
        gender   = None

        if not username or not email or not password:
            error = 'All fields are required.'
        elif len(username) < 3:
            error = 'Username must be at least 3 characters.'
        elif len(password) < 6:
            error = 'Password must be at least 6 characters.'
        elif password != confirm:
            error = 'Passwords do not match.'
        else:
            conn = get_db()
            existing = conn.execute(
                'SELECT id FROM users WHERE username=? OR email=?', (username, email)
            ).fetchone()
            if existing:
                error = 'Username or email already registered.'
                conn.close()
            else:
                hashed = generate_password_hash(password)
                token = secrets.token_hex(16)
                conn.execute(
                    'INSERT INTO users (username, email, password, gender, switch_token) VALUES (?,?,?,?,?)',
                    (username, email, hashed, gender, token)
                )
                conn.commit()
                user_row = conn.execute(
                    'SELECT * FROM users WHERE username=?', (username,)
                ).fetchone()
                conn.close()
                user = User(user_row['id'], user_row['username'], user_row['email'], switch_token=token)
                login_user(user, remember=True)
                return redirect(url_for('index'))

    return render_template('auth.html', active_panel='signup', error=error)


@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))

    error = None
    if request.method == 'POST':
        identifier = request.form.get('identifier', '').strip()
        password   = request.form.get('password', '')

        conn     = get_db()
        user_row = conn.execute(
            'SELECT * FROM users WHERE username=? OR email=?',
            (identifier, identifier.lower())
        ).fetchone()
        conn.close()

        if not user_row or not check_password_hash(user_row['password'], password):
            error = 'Invalid username/email or password.'
        else:
            user = User(user_row['id'], user_row['username'], user_row['email'])
            login_user(user, remember=True)   # permanent cookie
            next_page = request.args.get('next')
            return redirect(next_page or url_for('index'))

    return render_template('auth.html', active_panel='login', error=error)


# ─── SMTP CONFIG & OTP SENDER ──────────────────────────────────────────────────
SMTP_SERVER = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
SMTP_EMAIL = 'i.aditya.biswas@gmail.com'
SMTP_PASSWORD = 'mhkaifdbnttuuixd'

def send_otp_email(receiver_email, otp):
    try:
        # Save to local workspace debug file for ease of local testing without SMTP
        with open("last_otp.txt", "w", encoding="utf-8") as f:
            f.write(otp)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] 🔑 GENERATED PASSWORD RESET OTP FOR {receiver_email}: {otp}")
    except Exception as e:
        print(f"Error writing OTP to debug file: {e}")

    if SMTP_EMAIL and SMTP_PASSWORD:
        try:
            msg = MIMEMultipart()
            msg['From'] = SMTP_EMAIL
            msg['To'] = receiver_email
            msg['Subject'] = "Your WellBeingTracker Verification OTP"
            
            body = f"""Hello,

You have requested a password reset for your WellBeingTracker account.
Your 6-digit verification code (OTP) is:

=========================
🔑   {otp}
=========================

This code is valid for 10 minutes. If you did not request this, you can safely ignore this email.

Warm regards,
The WellBeingTracker Team"""
            msg.attach(MIMEText(body, 'plain'))
            
            if SMTP_PORT == 465:
                server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT)
            else:
                server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
                server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.send_message(msg)
            server.quit()
            print(f"OTP successfully emailed to {receiver_email}")
            return True
        except Exception as e:
            print(f"SMTP error sending OTP to {receiver_email}: {e}")
            return False
    else:
        print("SMTP credentials are not configured. Running in local debug mode: OTP written to 'last_otp.txt'")
        return True

@app.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    message = None
    error = None
    if request.method == 'POST':
        email = request.form.get('email', '').strip()
        if not email:
            error = "Please enter your email address."
        else:
            conn = get_db()
            user_row = conn.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
            conn.close()
            
            if not user_row:
                error = "No account found with that email address."
            else:
                # Generate 6-digit random code
                otp = "".join([str(random.randint(0, 9)) for _ in range(6)])
                
                # Store in session
                session['reset_email'] = email
                session['reset_otp'] = otp
                session['reset_otp_expiry'] = (datetime.now() + timedelta(minutes=10)).isoformat()
                session['otp_verified'] = False
                
                # Send OTP (email or write locally)
                send_otp_email(email, otp)
                
                # Redirect to verification page
                return redirect(url_for('verify_otp'))
                
    return render_template('forgot_password.html', message=message, error=error)

@app.route('/verify-otp', methods=['GET', 'POST'])
def verify_otp():
    # Make sure they have a reset flow in progress
    email = session.get('reset_email')
    if not email:
        return redirect(url_for('forgot_password'))
        
    error = None
    debug_otp = None
    
    # Check if SMTP is NOT configured (running local prototyping) to ease testing
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        debug_otp = session.get('reset_otp')
        
    if request.method == 'POST':
        submitted_otp = request.form.get('otp', '').strip()
        
        # Check expiry
        expiry_str = session.get('reset_otp_expiry')
        if not expiry_str or datetime.now() > datetime.fromisoformat(expiry_str):
            error = "The verification code has expired. Please request a new one."
        elif not submitted_otp:
            error = "Please enter the verification code."
        elif submitted_otp != session.get('reset_otp'):
            error = "Invalid verification code. Please check and try again."
        else:
            session['otp_verified'] = True
            return redirect(url_for('reset_password'))
            
    return render_template('verify_otp.html', email=email, error=error, debug_otp=debug_otp)

@app.route('/reset-password', methods=['GET', 'POST'])
def reset_password():
    # Enforce reset authorization checks
    if not session.get('otp_verified') or not session.get('reset_email'):
        return redirect(url_for('forgot_password'))
        
    error = None
    email = session.get('reset_email')
    
    if request.method == 'POST':
        new_pwd = request.form.get('password', '')
        confirm_pwd = request.form.get('confirm', '')
        
        if not new_pwd:
            error = "Please enter a new password."
        elif len(new_pwd) < 6:
            error = "Password must be at least 6 characters long."
        elif new_pwd != confirm_pwd:
            error = "Passwords do not match. Please verify."
        else:
            hashed = generate_password_hash(new_pwd)
            
            conn = get_db()
            conn.execute('UPDATE users SET password=? WHERE email=?', (hashed, email))
            conn.commit()
            conn.close()
            
            # Clean up session reset variables
            session.pop('reset_email', None)
            session.pop('reset_otp', None)
            session.pop('reset_otp_expiry', None)
            session.pop('otp_verified', None)
            
            return render_template('login.html', error=None, success="Password reset successfully! You can now log in.")
            
    return render_template('reset_password.html', email=email, error=error)


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))


# ─── Main App Routes ───────────────────────────────────────────────────────────
@app.route('/')
def welcome():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template('welcome.html')


@app.route('/dashboard')
@login_required
def index():
    token = current_user.switch_token
    if not token:
        token = secrets.token_hex(16)
        conn = get_db()
        conn.execute('UPDATE users SET switch_token=? WHERE id=?', (token, current_user.id))
        conn.commit()
        conn.close()
        current_user.switch_token = token

    # Write to local config for tracker.py
    config_path = os.path.join(os.path.dirname(__file__), '.tracker_config.json')
    try:
        with open(config_path, 'w') as f:
            json.dump({
                'server_url': 'http://127.0.0.1:5000',
                'switch_token': token,
                'username': current_user.username
            }, f)
    except Exception as e:
        print("Error writing tracker config:", e)

    # Auto-spawn tracker.py silently in the background if running locally and not active
    is_local = request.host.startswith('127.0.0.1') or request.host.startswith('localhost')
    if is_local:
        user_id = current_user.id
        state = active_trackers.get(user_id)
        is_running = False
        if state:
            time_diff = (datetime.now() - state['last_ping']).total_seconds()
            if time_diff <= 12:
                is_running = True
                
        if not is_running:
            try:
                import subprocess
                import sys
                tracker_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tracker.py')
                # Use pythonw.exe to run completely silently in the background
                pythonw_path = sys.executable.replace("python.exe", "pythonw.exe")
                if not os.path.exists(pythonw_path):
                    pythonw_path = sys.executable
                creationflags = 0x08000000 if sys.platform == "win32" else 0
                subprocess.Popen([pythonw_path, tracker_path], close_fds=True, creationflags=creationflags)
                print("[+] Auto-spawned tracker.py silently in the background!")
            except Exception as e:
                print("[-] Failed to auto-spawn tracker.py:", e)

    return render_template('index.html', 
                        username=current_user.username,
                        email=current_user.email,
                        phone=current_user.phone or '',
                        bio=current_user.bio or '',
                        avatar_url=current_user.avatar_url or '',
                        gender=current_user.gender or '',
                        switch_token=token,
                        sound_style=current_user.sound_style or 'short',
                        notifications_enabled=current_user.notifications_enabled or 'true')


@app.route('/api/tracker/authorize', methods=['POST'])
def tracker_authorize():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Missing username or password'}), 400
        
    conn = get_db()
    user_row = conn.execute(
        'SELECT * FROM users WHERE LOWER(username)=LOWER(?) OR LOWER(email)=LOWER(?)',
        (username, username)
    ).fetchone()
    
    if not user_row or not check_password_hash(user_row['password'], password):
        conn.close()
        return jsonify({'success': False, 'error': 'Invalid username/email or password'}), 401
        
    token = user_row['switch_token']
    if not token:
        token = secrets.token_hex(16)
        conn.execute('UPDATE users SET switch_token=? WHERE id=?', (token, user_row['id']))
        conn.commit()
        
    conn.close()
    
    return jsonify({
        'success': True,
        'switch_token': token,
        'username': user_row['username']
    })


@app.route('/api/local/sync', methods=['POST'])
def local_sync():
    data = request.get_json() or {}
    server_url = data.get('server_url', '').strip()
    switch_token = data.get('switch_token', '').strip()
    username = data.get('username', '').strip()
    
    if not server_url or not switch_token or not username:
        return jsonify({'success': False, 'error': 'Missing parameters'}), 400
        
    config_path = os.path.join(os.path.dirname(__file__), '.tracker_config.json')
    try:
        with open(config_path, 'w') as f:
            json.dump({
                'server_url': server_url,
                'switch_token': switch_token,
                'username': username
            }, f)
            
        # Spawn tracker.py to start tracking to the new address
        try:
            import subprocess
            import sys
            tracker_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tracker.py')
            pythonw_path = sys.executable.replace("python.exe", "pythonw.exe")
            if not os.path.exists(pythonw_path):
                pythonw_path = sys.executable
            creationflags = 0x08000000 if sys.platform == "win32" else 0
            subprocess.Popen([pythonw_path, tracker_path], close_fds=True, creationflags=creationflags)
            print(f"[+] Synced tracker config and spawned background agent pointing to: {server_url}")
        except Exception as e:
            print("[-] Error spawning tracker after sync:", e)
            
        return jsonify({'success': True, 'message': f'Synced successfully. Tracker is now streaming to {server_url}!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/download/tracker')
@login_required
def download_tracker():
    base_exe_path = os.path.join(app.root_path, 'static', 'downloads', 'tracker.exe')
    
    if not os.path.exists(base_exe_path):
        # Create directory if missing
        os.makedirs(os.path.dirname(base_exe_path), exist_ok=True)
        return jsonify({
            'error': 'tracker.exe is currently compiling on the server. Please download again in a few seconds!'
        }), 404
        
    conn = get_db()
    user_row = conn.execute('SELECT switch_token FROM users WHERE id=?', (current_user.id,)).fetchone()
    conn.close()
    
    token = user_row['switch_token'] if user_row else None
    if not token:
        return 'Unauthorized', 401
        
    server_url = request.url_root.strip('/')
    hex_url = server_url.encode('utf-8').hex()
    
    download_name = f"WellBeingTracker_setup_{token}_{hex_url}.exe"
    
    return send_file(
        base_exe_path,
        as_attachment=True,
        download_name=download_name
    )


@app.route('/api/account/switch', methods=['POST'])
def switch_account():
    data = request.get_json()
    username = data.get('username', '').strip()
    switch_token = data.get('switch_token', '').strip()
    
    if not username or not switch_token:
        return jsonify({'error': 'Missing credentials'}), 400
        
    conn = get_db()
    user_row = conn.execute(
        'SELECT * FROM users WHERE LOWER(username)=LOWER(?) AND switch_token=?', 
        (username, switch_token)
    ).fetchone()
    conn.close()
    
    if not user_row:
        return jsonify({'error': 'Invalid switch token. Please login again.'}), 401
        
    user = User(user_row['id'], user_row['username'], user_row['email'])
    login_user(user, remember=True)
    
    # Write config after successful switch
    config_path = os.path.join(os.path.dirname(__file__), '.tracker_config.json')
    try:
        with open(config_path, 'w') as f:
            json.dump({
                'server_url': 'http://127.0.0.1:5000',
                'switch_token': switch_token,
                'username': user_row['username']
            }, f)
    except Exception as e:
        print("Error writing tracker config:", e)
    
    return jsonify({'success': True})


@app.route('/api/user/save_sound_style', methods=['POST'])
@login_required
def save_sound_style():
    data = request.get_json() or {}
    sound_style = data.get('sound_style', 'short').strip()
    
    conn = get_db()
    conn.execute('UPDATE users SET sound_style=? WHERE id=?', (sound_style, current_user.id))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})


@app.route('/api/user/save_notifications_enabled', methods=['POST'])
@login_required
def save_notifications_enabled():
    data = request.get_json() or {}
    enabled = data.get('enabled', True)
    val = 'true' if enabled else 'false'
    
    conn = get_db()
    conn.execute('UPDATE users SET notifications_enabled=? WHERE id=?', (val, current_user.id))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})


@app.route('/api/user/update', methods=['POST'])
@login_required
def update_user():
    # Use form data instead of JSON to handle file uploads
    new_username = request.form.get('username', '').strip()
    new_email    = request.form.get('email', '').strip().lower()
    new_phone    = request.form.get('phone', '').strip()
    new_bio      = request.form.get('bio', '').strip()
    new_gender   = request.form.get('gender', '').strip() or current_user.gender
    
    if not new_username or not new_email:
        return jsonify({'error': 'Username and email are required'}), 400
        
    avatar_url = current_user.avatar_url
    
    if 'avatar' in request.files:
        file = request.files['avatar']
        if file and file.filename != '':
            ext = file.filename.rsplit('.', 1)[1].lower()
            if ext in ['jpg', 'jpeg', 'png', 'gif']:
                filename = f"avatar_{current_user.id}_{secrets.token_hex(4)}.{ext}"
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(filepath)
                avatar_url = f"/static/uploads/avatars/{filename}"
        
    conn = get_db()
    try:
        conn.execute(
            'UPDATE users SET username=?, email=?, phone=?, bio=?, avatar_url=?, gender=? WHERE id=?',
            (new_username, new_email, new_phone, new_bio, avatar_url, new_gender, current_user.id)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username or email already exists'}), 400
    finally:
        conn.close()
        
    # Update session
    current_user.username   = new_username
    current_user.email      = new_email
    current_user.phone      = new_phone
    current_user.bio        = new_bio
    current_user.avatar_url = avatar_url
    current_user.gender     = new_gender
    
    return jsonify({'success': True})


@app.route('/api/user/change-password', methods=['POST'])
@login_required
def change_password():
    data = request.get_json()
    current_pwd = data.get('current_password')
    new_pwd = data.get('new_password')
    confirm_pwd = data.get('confirm_password')

    if not current_pwd or not new_pwd or not confirm_pwd:
        return jsonify({'error': 'All password fields are required'}), 400

    if len(new_pwd) < 6:
        return jsonify({'error': 'New password must be at least 6 characters'}), 400

    if new_pwd != confirm_pwd:
        return jsonify({'error': 'New passwords do not match'}), 400

    conn = get_db()
    row = conn.execute('SELECT password FROM users WHERE id=?', (current_user.id,)).fetchone()
    if not row or not check_password_hash(row['password'], current_pwd):
        conn.close()
        return jsonify({'error': 'Incorrect current password'}), 400

    hashed = generate_password_hash(new_pwd)
    conn.execute('UPDATE users SET password=? WHERE id=?', (hashed, current_user.id))
    conn.commit()
    conn.close()

    return jsonify({'success': True})


@app.route('/api/sessions', methods=['POST'])
@login_required
def add_session():
    data = request.get_json()
    required = ['category', 'app_name', 'minutes']
    if not all(k in data for k in required):
        return jsonify({'error': 'Missing fields'}), 400
    if data['minutes'] <= 0:
        return jsonify({'error': 'Minutes must be positive'}), 400

    today = date.today().isoformat()
    conn  = get_db()
    conn.execute(
        'INSERT INTO sessions (user_id, date, category, app_name, minutes) VALUES (?,?,?,?,?)',
        (current_user.id, today, data['category'], data['app_name'], data['minutes'])
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/sessions', methods=['GET'])
@login_required
def get_sessions():
    target_date = request.args.get('date', date.today().isoformat())
    conn  = get_db()
    rows  = conn.execute(
        'SELECT * FROM sessions WHERE user_id=? AND date=? ORDER BY created_at DESC',
        (current_user.id, target_date)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/sessions/<int:session_id>', methods=['DELETE'])
@login_required
def delete_session(session_id):
    conn = get_db()
    conn.execute('DELETE FROM sessions WHERE id=? AND user_id=?', (session_id, current_user.id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# ══════════════════════════════════════════════════════════════
# BACKGROUND AUTO-TRACKER INTEGRATION
# ══════════════════════════════════════════════════════════════
active_trackers = {}

def get_app_category(app_name):
    app_lower = app_name.lower()
    if any(x in app_lower for x in ['vs code', 'visual studio', 'python', 'github', 'sublime', 'pycharm', 'intellij', 'terminal', 'cmd', 'powershell', 'stud', 'learn', 'course', 'coding', 'antigravity']):
        return 'study'
    elif any(x in app_lower for x in [
        'youtube', 'netflix', 'spotify', 'vlc', 'steam', 'game', 'play', 'prime video', 'hulu', 'twitch', 'music', 'gaming', 'microsoft store',
        'chrome', 'firefox', 'browser', 'safari', 'instagram', 'twitter', 'facebook', 'reddit', 'discord', 'whatsapp', 'social', 'chat', 'messenger'
    ]):
        return 'entertainment'
    elif any(x in app_lower for x in ['zoom', 'slack', 'teams', 'excel', 'word', 'outlook', 'powerpoint', 'meet', 'skype', 'trello', 'notion']):
        return 'work'
    return 'other'


@app.route('/api/tracker/ping', methods=['POST'])
def tracker_ping():
    data = request.get_json() or {}
    app_name = data.get('app_name', '').strip()
    window_title = data.get('window_title', '').strip()
    token = data.get('switch_token', '').strip()
    
    if not app_name or not token:
        return jsonify({'error': 'Missing fields'}), 400
        
    conn = get_db()
    user_row = conn.execute('SELECT id, sound_style, notifications_enabled FROM users WHERE switch_token=?', (token,)).fetchone()
    conn.close()
    
    if not user_row:
        return jsonify({'error': 'Invalid token'}), 401
        
    user_id = user_row['id']
    category = get_app_category(app_name)
    now = datetime.now()
    
    state = active_trackers.get(user_id)
    
    if state and state['app_name'] == app_name:
        elapsed_sec = (now - state['last_ping']).total_seconds()
        if elapsed_sec > 15:
            elapsed_sec = 3.0  # Safe fallback if tracking was paused/slept
            
        elapsed_min = elapsed_sec / 60.0
        today = date.today().isoformat()
        
        conn = get_db()
        existing = conn.execute(
            'SELECT id, minutes FROM sessions WHERE user_id=? AND date=? AND app_name=? AND category=? AND is_auto=1',
            (user_id, today, app_name, category)
        ).fetchone()
        
        if existing:
            new_minutes = existing['minutes'] + elapsed_min
            conn.execute(
                'UPDATE sessions SET minutes=? WHERE id=?',
                (new_minutes, existing['id'])
            )
        else:
            conn.execute(
                'INSERT INTO sessions (user_id, date, category, app_name, minutes, is_auto) VALUES (?,?,?,?,?,1)',
                (user_id, today, category, app_name, elapsed_min)
            )
        conn.commit()
        conn.close()
        
        state['last_ping'] = now
        state['session_duration'] += elapsed_sec
    else:
        active_trackers[user_id] = {
            'app_name': app_name,
            'window_title': window_title,
            'category': category,
            'start_time': now,
            'last_ping': now,
            'session_duration': 0.0
        }
        
    limit_info = None
    today = date.today().isoformat()
    
    conn = get_db()
    limit_row = conn.execute(
        'SELECT limit_minutes FROM time_limits WHERE user_id=? AND LOWER(app_name)=LOWER(?)',
        (user_id, app_name)
    ).fetchone()
    
    if limit_row:
        limit_min = limit_row['limit_minutes']
        used_row = conn.execute(
            'SELECT COALESCE(SUM(minutes), 0.0) as used FROM sessions '
            'WHERE user_id=? AND date=? AND LOWER(app_name)=LOWER(?)',
            (user_id, today, app_name)
        ).fetchone()
        used_min = used_row['used'] if used_row else 0.0
        
        limit_info = {
            'app_name': app_name,
            'limit_minutes': limit_min,
            'used_minutes': used_min,
            'exceeded': used_min >= limit_min
        }
        
    # Query all exceeded limits for the user today to notify via the background tracker
    limits = conn.execute(
        'SELECT app_name, limit_minutes FROM time_limits WHERE user_id=?',
        (user_id,)
    ).fetchall()
    
    exceeded_limits = []
    for lim in limits:
        row = conn.execute(
            'SELECT COALESCE(SUM(minutes), 0.0) as used FROM sessions '
            'WHERE user_id=? AND date=? AND LOWER(app_name)=LOWER(?)',
            (user_id, today, lim['app_name'])
        ).fetchone()
        used = row['used'] if row else 0.0
        if used >= lim['limit_minutes']:
            exceeded_limits.append({
                'app_name': lim['app_name'],
                'limit_minutes': lim['limit_minutes'],
                'used_minutes': used
            })
            
    conn.close()

    notif_enabled = user_row['notifications_enabled'] if (user_row and 'notifications_enabled' in user_row.keys()) else 'true'
    if notif_enabled == 'false':
        limit_info = None
        exceeded_limits = []

    return jsonify({
        'success': True,
        'limit_info': limit_info,
        'exceeded_limits': exceeded_limits,
        'sound_style': user_row['sound_style'] if (user_row and 'sound_style' in user_row.keys()) else 'short'
    })


@app.route('/api/tracker/status', methods=['GET'])
@login_required
def tracker_status():
    user_id = current_user.id
    state = active_trackers.get(user_id)
    now = datetime.now()
    
    tracker_running = False
    current_app = ""
    current_category = ""
    current_title = ""
    session_duration = 0
    
    if state:
        time_diff = (now - state['last_ping']).total_seconds()
        if time_diff <= 12:  # allow slight latency
            tracker_running = True
            current_app = state['app_name']
            current_category = state['category']
            current_title = state['window_title']
            session_duration = int(state['session_duration'])
            
    today = date.today().isoformat()
    conn = get_db()
    rows = conn.execute(
        'SELECT app_name, category, SUM(minutes) as total_min FROM sessions '
        'WHERE user_id=? AND date=? AND is_auto=1 '
        'GROUP BY app_name, category '
        'ORDER BY total_min DESC',
        (user_id, today)
    ).fetchall()
    
    total_row = conn.execute(
        'SELECT SUM(minutes) as grand_total FROM sessions WHERE user_id=? AND date=?',
        (user_id, today)
    ).fetchone()
    conn.close()
    
    grand_total = total_row['grand_total'] if total_row and total_row['grand_total'] else 0
    
    auto_detected = []
    for r in rows:
        pct = (r['total_min'] / grand_total * 100) if grand_total > 0 else 0
        auto_detected.append({
            'app_name': r['app_name'],
            'category': r['category'],
            'minutes': r['total_min'],
            'percentage': round(pct, 1)
        })
        
    return jsonify({
        'tracker_running': tracker_running,
        'current_app': current_app,
        'current_category': current_category,
        'current_title': current_title,
        'session_duration': session_duration,
        'auto_detected_apps': auto_detected
    })


@app.route('/api/report', methods=['GET'])
@login_required
def daily_report():
    target_date = request.args.get('date', date.today().isoformat())
    conn  = get_db()
    rows  = conn.execute(
        'SELECT category, SUM(minutes) as total FROM sessions WHERE user_id=? AND date=? GROUP BY category',
        (current_user.id, target_date)
    ).fetchall()
    
    break_row = conn.execute(
        "SELECT COUNT(*) as cnt FROM eye_care_log WHERE user_id=? AND date(logged_at, 'localtime')=?",
        (current_user.id, target_date)
    ).fetchone()
    eye_breaks = break_row['cnt'] if break_row else 0
    conn.close()

    cats         = {r['category']: r['total'] for r in rows}
    study        = cats.get('study', 0)
    entertainment= cats.get('entertainment', 0)
    social       = cats.get('social', 0)
    work         = cats.get('work', 0)
    other        = cats.get('other', 0)
    total        = study + entertainment + social + work + other
    score        = compute_balance_score(study, entertainment, social, work, other, total, eye_breaks)

    return jsonify({
        'date': target_date,
        'study': study, 'entertainment': entertainment,
        'social': social, 'work': work, 'other': other,
        'total': total, 'balance_score': score,
        'study_ratio':        round(study / total * 100, 1) if total else 0,
        'entertainment_ratio': round(entertainment / total * 100, 1) if total else 0,
    })


@app.route('/api/weekly', methods=['GET'])
@login_required
def weekly_report():
    week_offset = request.args.get('week_offset', 0, type=int)
    
    # Restrict offset between 0 and 12 weeks back (approx 3 months) for security
    week_offset = min(max(week_offset, 0), 12)
    
    # Subtracting offset * 7 days shifts the window back week-by-week
    # Note: we want the 7 days ending at: today - offset * 7
    today = date.today() - timedelta(days=week_offset * 7)
    results = []
    conn = get_db()
    
    for i in range(6, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        rows = conn.execute(
            'SELECT category, SUM(minutes) as total FROM sessions WHERE user_id=? AND date=? GROUP BY category',
            (current_user.id, d)
        ).fetchall()
        
        break_row = conn.execute(
            "SELECT COUNT(*) as cnt FROM eye_care_log WHERE user_id=? AND date(logged_at, 'localtime')=?",
            (current_user.id, d)
        ).fetchone()
        eye_breaks = break_row['cnt'] if break_row else 0

        cats         = {r['category']: r['total'] for r in rows}
        study        = cats.get('study', 0)
        entertainment= cats.get('entertainment', 0)
        social       = cats.get('social', 0)
        work         = cats.get('work', 0)
        other        = cats.get('other', 0)
        total        = study + entertainment + social + work + other
        
        dt = datetime.strptime(d, '%Y-%m-%d')
        label = dt.strftime('%a')
            
        results.append({
            'date': d,
            'label': label,
            'total': total, 'study': study,
            'entertainment': entertainment, 'social': social,
            'work': work, 'other': other,
            'balance_score': compute_balance_score(study, entertainment, social, work, other, total, eye_breaks)
        })
    conn.close()
    return jsonify(results)


@app.route('/api/eye_care', methods=['POST'])
@login_required
def log_eye_care():
    conn = get_db()
    conn.execute('INSERT INTO eye_care_log (user_id) VALUES (?)', (current_user.id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/eye_care/count', methods=['GET'])
@login_required
def eye_care_count():
    today = date.today().isoformat()
    conn  = get_db()
    row   = conn.execute(
        "SELECT COUNT(*) as cnt FROM eye_care_log WHERE user_id=? AND date(logged_at, 'localtime')=?",
        (current_user.id, today)
    ).fetchone()
    conn.close()
    return jsonify({'count': row['cnt']})


# ─── Time Limits Routes ────────────────────────────────────────────────────────
@app.route('/api/limits', methods=['GET'])
@login_required
def get_limits():
    """Return all time limits for the current user."""
    conn = get_db()
    rows = conn.execute(
        'SELECT app_name, limit_minutes FROM time_limits WHERE user_id=? ORDER BY app_name',
        (current_user.id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/limits', methods=['POST'])
@login_required
def set_limit():
    """Create or update a time limit for an app."""
    data = request.get_json()
    app_name      = (data.get('app_name') or '').strip()
    limit_minutes = data.get('limit_minutes', 0)
    if not app_name:
        return jsonify({'error': 'app_name required'}), 400
    if limit_minutes <= 0:
        return jsonify({'error': 'limit_minutes must be positive'}), 400

    conn = get_db()
    conn.execute(
        '''
        INSERT INTO time_limits (user_id, app_name, limit_minutes)
        VALUES (?,?,?)
        ON CONFLICT(user_id, app_name) DO UPDATE SET limit_minutes=excluded.limit_minutes
        ''',
        (current_user.id, app_name, limit_minutes)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/limits/<path:app_name>', methods=['DELETE'])
@login_required
def delete_limit(app_name):
    """Remove a time limit."""
    conn = get_db()
    conn.execute(
        'DELETE FROM time_limits WHERE user_id=? AND app_name=?',
        (current_user.id, app_name)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/limits/check', methods=['GET'])
@login_required
def check_limits():
    """
    Return today's usage for every app that has a limit set,
    including whether the limit has been exceeded.
    """
    today = request.args.get('date', date.today().isoformat())
    conn  = get_db()

    limits = conn.execute(
        'SELECT app_name, limit_minutes FROM time_limits WHERE user_id=?',
        (current_user.id,)
    ).fetchall()

    results = []
    for lim in limits:
        row = conn.execute(
            'SELECT COALESCE(SUM(minutes),0) as used FROM sessions '
            'WHERE user_id=? AND date=? AND LOWER(app_name)=LOWER(?)',
            (current_user.id, today, lim['app_name'])
        ).fetchone()
        used = row['used'] if row else 0
        results.append({
            'app_name':      lim['app_name'],
            'limit_minutes': lim['limit_minutes'],
            'used_minutes':  used,
            'exceeded':      used >= lim['limit_minutes'],
            'percent':       min(100, round(used / lim['limit_minutes'] * 100)) if lim['limit_minutes'] > 0 else 0,
        })

    conn.close()
    return jsonify(results)
@app.route('/api/account', methods=['DELETE'])
@login_required
def delete_account():
    """Permanently delete the current user's account and all associated data."""
    conn = get_db()
    conn.execute('DELETE FROM sessions WHERE user_id=?', (current_user.id,))
    conn.execute('DELETE FROM eye_care_log WHERE user_id=?', (current_user.id,))
    conn.execute('DELETE FROM time_limits WHERE user_id=?', (current_user.id,))
    conn.execute('DELETE FROM users WHERE id=?', (current_user.id,))
    conn.commit()
    conn.close()
    logout_user()
    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(debug=True, port=5000)