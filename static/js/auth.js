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
const pwdInput = document.getElementById('signupPassword');

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
['loginForm', 'signupForm', 'forgotForm'].forEach(id => {
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

// ── Auto-dismiss error & success banners after 5 s ─────────────
['authError', 'authSuccess'].forEach(id => {
  const banner = document.getElementById(id);
  if (banner) {
    setTimeout(() => {
      banner.style.transition = 'opacity .5s ease';
      banner.style.opacity    = '0';
      setTimeout(() => banner.remove(), 500);
    }, 5000);
  }
});

// ── Theme Toggle & Init for Auth Pages ─────────────────────────
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = newTheme === 'light' ? '🌙' : '☀️';
}

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.textContent = savedTheme === 'light' ? '🌙' : '☀️';
  }

  // ── Sliding Panel Logic ────────────────────────────────────────
  const showSignupBtn = document.getElementById('showSignupBtn');
  const showLoginBtn  = document.getElementById('showLoginBtn');
  
  if (showSignupBtn) {
    showSignupBtn.addEventListener('click', () => {
      document.body.setAttribute('data-active-panel', 'signup');
      // Update URL without reloading
      window.history.pushState({}, '', '/signup');
    });
  }
  
  if (showLoginBtn) {
    showLoginBtn.addEventListener('click', () => {
      document.body.setAttribute('data-active-panel', 'login');
      // Update URL without reloading
      window.history.pushState({}, '', '/login');
    });
  }

  // ── Spotlight Hover Effect for Features ────────────────────────
  const features = document.querySelectorAll('.brand-features li');
  features.forEach(feature => {
    feature.addEventListener('mousemove', e => {
      const rect = feature.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      feature.style.setProperty('--mouse-x', `${x}px`);
      feature.style.setProperty('--mouse-y', `${y}px`);
    });
  });
});
