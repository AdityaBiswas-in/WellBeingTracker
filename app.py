# pyrefly: ignore [missing-import]
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
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

app = Flask(__name__)

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

DB_PATH = os.path.join(os.path.dirname(__file__), 'wellbeing.db')

# ─── Flask-Login setup ────────────────────────────────────────────────────────
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = ''          # suppress default flash

class User(UserMixin):
    def __init__(self, id_, username, email, phone=None, bio=None, avatar_url=None, gender=None):
        self.id         = id_
        self.username   = username
        self.email      = email
        self.phone      = phone
        self.bio        = bio
        self.avatar_url = avatar_url
        self.gender     = gender

@login_manager.user_loader
def load_user(user_id):
    conn = get_db()
    row  = conn.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
    conn.close()
    if row:
        u = dict(row)
        return User(u['id'], u['username'], u['email'], u.get('phone'), u.get('bio'), u.get('avatar_url'), u.get('gender'))
    return None

# ─── Database Initialization ───────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Users table
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT    NOT NULL UNIQUE,
            email       TEXT    NOT NULL UNIQUE,
            password    TEXT    NOT NULL,
            phone       TEXT,
            bio         TEXT,
            avatar_url  TEXT,
            created_at  TEXT    DEFAULT (datetime('now'))
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

    conn.commit()
    conn.close()

init_db()

# ─── Helpers ───────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def compute_balance_score(study_min, entertainment_min, social_min, work_min, other_min, total_min):
    """
    Digital Balance Score (0–100):
      - Ideal daily screen time: ≤ 360 min (6 h)
      - Ideal study ratio: 40–60%
    """
    if total_min == 0:
        return 0

    ideal_max  = 360
    time_score = max(0, 40 - max(0, total_min - ideal_max) / ideal_max * 40)

    study_ratio  = study_min / total_min
    study_score  = (30 if 0.4 <= study_ratio <= 0.6
                    else (study_ratio / 0.4 * 30 if study_ratio < 0.4
                          else max(0, 30 - (study_ratio - 0.6) / 0.4 * 15)))

    ent_ratio  = entertainment_min / total_min
    ent_score  = max(0, 20 - max(0, ent_ratio - 0.3) / 0.7 * 20)

    active_cats    = sum(1 for m in [study_min, entertainment_min, social_min, work_min, other_min] if m > 0)
    diversity_score = min(10, active_cats * 2)

    return round(min(100, time_score + study_score + ent_score + diversity_score))

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
        gender   = request.form.get('gender', '')

        if not username or not email or not password or not gender:
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
                conn.execute(
                    'INSERT INTO users (username, email, password, gender) VALUES (?,?,?,?)',
                    (username, email, hashed, gender)
                )
                conn.commit()
                user_row = conn.execute(
                    'SELECT * FROM users WHERE username=?', (username,)
                ).fetchone()
                conn.close()
                user = User(user_row['id'], user_row['username'], user_row['email'])
                login_user(user, remember=True)
                return redirect(url_for('index'))

    return render_template('signup.html', error=error)


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

    return render_template('login.html', error=error)


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))


# ─── Main App Routes ───────────────────────────────────────────────────────────
@app.route('/')
@login_required
def index():
    return render_template('index.html', 
                           username=current_user.username,
                           email=current_user.email,
                           phone=current_user.phone or '',
                           bio=current_user.bio or '',
                           avatar_url=current_user.avatar_url or '',
                           gender=current_user.gender or '')


@app.route('/api/user/update', methods=['POST'])
@login_required
def update_user():
    # Use form data instead of JSON to handle file uploads
    new_username = request.form.get('username', '').strip()
    new_email    = request.form.get('email', '').strip().lower()
    new_phone    = request.form.get('phone', '').strip()
    new_bio      = request.form.get('bio', '').strip()
    new_gender   = request.form.get('gender', '').strip()
    
    if not new_username or not new_email or not new_gender:
        return jsonify({'error': 'Username, email, and gender are required'}), 400
        
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


@app.route('/api/report', methods=['GET'])
@login_required
def daily_report():
    target_date = request.args.get('date', date.today().isoformat())
    conn  = get_db()
    rows  = conn.execute(
        'SELECT category, SUM(minutes) as total FROM sessions WHERE user_id=? AND date=? GROUP BY category',
        (current_user.id, target_date)
    ).fetchall()
    conn.close()

    cats         = {r['category']: r['total'] for r in rows}
    study        = cats.get('study', 0)
    entertainment= cats.get('entertainment', 0)
    social       = cats.get('social', 0)
    work         = cats.get('work', 0)
    other        = cats.get('other', 0)
    total        = study + entertainment + social + work + other
    score        = compute_balance_score(study, entertainment, social, work, other, total)

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
    days    = request.args.get('days', 7, type=int)
    today   = date.today()
    results = []
    conn    = get_db()
    
    # Limit maximum days to 365 for safety
    days = min(max(days, 1), 365)
    
    for i in range(days - 1, -1, -1):
        d    = (today - timedelta(days=i)).isoformat()
        rows = conn.execute(
            'SELECT category, SUM(minutes) as total FROM sessions WHERE user_id=? AND date=? GROUP BY category',
            (current_user.id, d)
        ).fetchall()
        cats         = {r['category']: r['total'] for r in rows}
        study        = cats.get('study', 0)
        entertainment= cats.get('entertainment', 0)
        social       = cats.get('social', 0)
        work         = cats.get('work', 0)
        other        = cats.get('other', 0)
        total        = study + entertainment + social + work + other
        
        # Format label based on range
        dt = datetime.strptime(d, '%Y-%m-%d')
        if days <= 7:
            label = dt.strftime('%a')
        elif days <= 90:
            label = dt.strftime('%b %d')
        else:
            label = dt.strftime('%b %y')
            
        results.append({
            'date': d,
            'label': label,
            'total': total, 'study': study,
            'entertainment': entertainment, 'social': social,
            'work': work, 'other': other,
            'balance_score': compute_balance_score(study, entertainment, social, work, other, total)
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
        "SELECT COUNT(*) as cnt FROM eye_care_log WHERE user_id=? AND date(logged_at)=?",
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


if __name__ == '__main__':
    app.run(debug=True, port=5000)