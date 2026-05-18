/* ── Auth page interactivity ────────────────────────────────── */

// ── Password visibility toggle ─────────────────────────────────
document.querySelectorAll('.pwd-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.previousElementSibling;
    if (!input || input.tagName !== 'INPUT') return;
    const isHidden = input.type === 'password';
    input.type     = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? 'Hide' : 'Show';
  });
});


// ── Password strength meter (signup only) ─────────────────────
const pwdInput    = document.getElementById('password');
const strengthFill  = document.getElementById('strengthFill');
const strengthLabel = document.getElementById('strengthLabel');

if (pwdInput && strengthFill) {
  pwdInput.addEventListener('input', () => {
    const val = pwdInput.value;
    let level = 0;
    if (val.length >= 6)  level++;
    if (val.length >= 10) level++;
    if (/[A-Z]/.test(val) && /[0-9]/.test(val)) level++;
    if (/[^A-Za-z0-9]/.test(val)) level++;

    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    strengthFill.setAttribute('data-level', level || '');
    strengthFill.style.width = level ? `${level * 25}%` : '0';
    if (strengthLabel) strengthLabel.textContent = labels[level] || 'Strength';

    const colors = ['', '#ff5252', '#ffd740', '#69f0ae', '#00e676'];
    strengthFill.style.background = colors[level] || '';
  });
}

// ── Confirm password match hint ────────────────────────────────
const confirmInput = document.getElementById('confirm');
const confirmHint  = document.getElementById('confirmHint');

if (confirmInput && confirmHint && pwdInput) {
  const checkMatch = () => {
    if (!confirmInput.value) { confirmHint.textContent = ''; confirmHint.className = 'field-hint'; return; }
    if (confirmInput.value === pwdInput.value) {
      confirmHint.textContent = 'Passwords match';
      confirmHint.className   = 'field-hint ok';
    } else {
      confirmHint.textContent = 'Passwords do not match';
      confirmHint.className   = 'field-hint err';
    }

  };
  confirmInput.addEventListener('input', checkMatch);
  pwdInput.addEventListener('input', checkMatch);
}

// ── Username hint ──────────────────────────────────────────────
const usernameInput = document.getElementById('username');
const usernameHint  = document.getElementById('usernameHint');
if (usernameInput && usernameHint) {
  usernameInput.addEventListener('input', () => {
    const len = usernameInput.value.trim().length;
    if (!len) { usernameHint.textContent = ''; usernameHint.className = 'field-hint'; return; }
    if (len < 3) {
      usernameHint.textContent = 'At least 3 characters required';
      usernameHint.className   = 'field-hint err';
    } else {
      usernameHint.textContent = 'Looks good';
      usernameHint.className   = 'field-hint ok';
    }

  });
}

// ── Loading spinner on submit ──────────────────────────────────
['loginForm', 'signupForm'].forEach(id => {
  const form = document.getElementById(id);
  if (!form) return;
  form.addEventListener('submit', () => {
    const btn     = form.querySelector('.auth-btn');
    const text    = btn && btn.querySelector('.btn-text');
    const spinner = btn && btn.querySelector('.btn-spinner');
    if (btn)     btn.disabled   = true;
    if (text)    text.textContent = 'Please wait…';
    if (spinner) spinner.hidden  = false;
  });
});

// ── Auto-dismiss error banner after 5 s ───────────────────────
const errBanner = document.getElementById('authError');
if (errBanner) {
  setTimeout(() => {
    errBanner.style.transition = 'opacity .5s ease';
    errBanner.style.opacity    = '0';
    setTimeout(() => errBanner.remove(), 500);
  }, 5000);
}
