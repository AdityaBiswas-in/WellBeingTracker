/* ═══════════════════════════════════════════════════════════════
   Digital Well-Being Tracker  ·  app.js
   ═══════════════════════════════════════════════════════════════ */

// ── Namespaced localStorage for Multi-Account support ─────────
const userSpecificKeys = ['eyeTimerActive', 'eyeTimerEndTime', 'eyeTimerPaused', 'eyeTimerRemainingMs', 'habitChecks', 'app_notifications_enabled'];

function getNamespacedKey(key) {
  if (userSpecificKeys.includes(key)) {
    const user = window.CURRENT_USERNAME || 'default';
    return `${key}_${user}`;
  }
  return key;
}

const originalGetItem = localStorage.getItem;
const originalSetItem = localStorage.setItem;
const originalRemoveItem = localStorage.removeItem;

localStorage.getItem = function(key) {
  return originalGetItem.call(localStorage, getNamespacedKey(key));
};

localStorage.setItem = function(key, value) {
  originalSetItem.call(localStorage, getNamespacedKey(key), value);
};

localStorage.removeItem = function(key) {
  originalRemoveItem.call(localStorage, getNamespacedKey(key));
};

// ── Category colours (must match CSS tokens) ─────────────────
const CAT_COLORS = {
  get study() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return isLight ? '#2e7d32' : '#60a5fa'; // dark: soft blue
  },
  get entertainment() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return isLight ? '#d84315' : '#fb923c'; // dark: warm orange
  },
  get work() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return isLight ? '#f57f17' : '#fbbf24'; // dark: amber
  },
  get other() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return isLight ? '#651fff' : '#34d399'; // dark: emerald
  }
};

// ── Theme Toggle & Selection ───────────────────────────────────
function applyThemeSelection(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';

  // Sync the Edit Profile modal dropdown if it exists
  const themeSelect = document.getElementById('editTheme');
  if (themeSelect) {
    themeSelect.value = theme;
  }

  // Force a re-render of current charts and particles to grab new colors
  loadDashboard();
  loadWeekly(currentWeekOffset);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyThemeSelection(newTheme);
}

// Load saved theme immediately to prevent flashing
(function loadTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    window.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('themeToggleBtn');
      if (btn) btn.textContent = savedTheme === 'light' ? '🌙' : '☀️';
    });
  }
})();

// ── Chart instances ───────────────────────────────────────────
let doughnutChart = null;
let weeklyChart   = null;
let currentWeekOffset  = 0;
let currentWeeklyData  = null;
let weeklyChartStyle   = 'bar'; // 'area', 'bar'
let notificationSoundStyle = localStorage.getItem('sound_style') || 'long'; // 'short', 'long', 'alarm'

// ── Eye-care timer ────────────────────────────────────────────
let eyeInterval   = null;
let eyeSeconds    = 20 * 60;   // 20 minutes
let eyeActive     = false;
let eyePaused     = false;

// ══════════════════════════════════════════════════════════════
// PARTICLE BACKGROUND
// ══════════════════════════════════════════════════════════════
(function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const ctx    = canvas.getContext('2d');
  let W, H, particles;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function randomParticle() {
    return {
      x:   Math.random() * W,
      y:   Math.random() * H,
      r:   Math.random() * 1.5 + 0.4,
      vx:  (Math.random() - 0.5) * 0.3,
      vy:  (Math.random() - 0.5) * 0.3,
      a:   Math.random() * 0.5 + 0.15,
    };
  }

  function initParticleArray() {
    particles = Array.from({ length: 65 }, randomParticle);
  }

  function draw() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const rgb = isLight ? '0,122,255' : '167,139,250'; // dark: violet, light: original blue

    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb},${p.a})`;
      ctx.fill();

      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    });

    // Draw faint connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(${rgb},${0.06 * (1 - dist / 100)})`;
          ctx.lineWidth   = 0.6;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => { resize(); initParticleArray(); });
  resize(); initParticleArray(); draw();
})();

// ══════════════════════════════════════════════════════════════
// LIVE CLOCK
// ══════════════════════════════════════════════════════════════
function updateClock() {
  const el = document.getElementById('currentDateTime');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
updateClock();
setInterval(updateClock, 30000);

// ══════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ══════════════════════════════════════════════════════════════
// Keep track of visited tabs to show intro messages only the first time per session
const visitedTabs = new Set();

// Reset warning flag when leaving dashboard
let mostUsedAppWarned = false;

function switchTab(tab) {
  if (tab !== 'dashboard') {
    mostUsedAppWarned = false;
  }

  // Show instructor with page info only on the first visit in this session
  const pageMessages = {
    'dashboard': "Welcome to the Dashboard! 📊 Here you can see your daily balance score and quick stats. 📈✨",
    'weekly': "This is the Weekly Overview! 📅 Analyze your screen time trends over the last 7 days here. 🔍💚",
    'habits': "Welcome to Habits! ⚡ Track your screen time categories and follow daily wellness tips. 💡🌱",
    'limits': "Here are your App Limits! ⏱️ Set daily caps for apps and websites to maintain balance. 🛡️🛡️"
  };
  
  const message = pageMessages[tab];
  if (message && !visitedTabs.has(tab)) {
    showInstructor(message, 5000);
    visitedTabs.add(tab);
  }

  // Original tab switching logic
  document.querySelectorAll('.nav-tab').forEach(b => {
    b.classList.toggle('active', b.id === `tab-${tab}`);
    b.setAttribute('aria-selected', b.id === `tab-${tab}` ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-section').forEach(s => {
    s.classList.toggle('active', s.id === `section-${tab}`);
  });
  if (tab === 'weekly') loadWeekly();
  if (tab === 'habits') initHabits();
  if (tab === 'limits') {
    initLimits();
    
    // Scan limits immediately and give verbal report of exceeded apps
    fetch('/api/limits/check')
      .then(res => res.json())
      .then(limitsStatus => {
        const exceededApps = limitsStatus.filter(s => s.exceeded).map(s => s.app_name);
        if (exceededApps.length > 0) {
          const listStr = exceededApps.join(', ');
          const msg = `⚠️ Alert: You have exceeded your daily time limits for: ${listStr}. Please step away from your screen and take a refreshing break! 🧘‍♂️⏱️`;
          // Delay if welcoming them for the first time
          setTimeout(() => {
            showInstructor(msg, 7500);
            playNotificationSound();
          }, visitedTabs.has('limits') ? 0 : 4000);
        }
      })
      .catch(err => console.error("Error in tab-switch limits check:", err));
  }
}





// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function fmtMin(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function scoreColor(score) {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (score >= 80) return isLight ? '#0066cc' : '#34d399'; // dark: emerald
  if (score >= 60) return isLight ? '#0088ff' : '#60a5fa'; // dark: blue
  if (score >= 40) return '#fbbf24'; // amber
  return '#f87171'; // soft coral red
}




function scoreBadgeText(score) {
  if (score >= 80) return '🌟 Excellent';
  if (score >= 60) return '✅ Good';
  if (score >= 40) return '⚠️ Fair';
  return '🔴 Needs Work';
}

function scoreSubtitleText(score) {
  if (score >= 80) return 'Great balance! Keep it up.';
  if (score >= 60) return 'Doing well – small tweaks will help.';
  if (score >= 40) return 'Room for improvement. Less passive screen time.';
  return 'High screen time detected. Take a digital detox break!';
}

// Animate a number counter
function animateValue(el, start, end, duration = 900) {
  const startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (end - start) * ease);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Show toast notification
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
async function loadDashboard(dateStr, silent = false) {
  if (!dateStr) {
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    const localDate = new Date(today.getTime() - offset);
    dateStr = localDate.toISOString().split('T')[0];
  }
  const dashDateInput = document.getElementById('dashDate');
  if (dashDateInput) {
    dashDateInput.value = dateStr;
  }

  const [reportRes, sessionsRes, eyeRes] = await Promise.all([
    fetch(`/api/report?date=${dateStr}`),
    fetch(`/api/sessions?date=${dateStr}`),
    fetch('/api/eye_care/count'),
  ]);
  const report   = await reportRes.json();
  const sessions = await sessionsRes.json();
  const eye      = await eyeRes.json();

  updateScoreRing(report.balance_score, silent);
  updateStatCards(report, eye.count);
  updateDoughnutChart(report, silent);
  updateRatioBar(report);
  updateBalanceTip(report);
  renderSessions(sessions);
}

// ── Score Ring ───────────────────────────────────────────────
function updateScoreRing(score, silent = false) {
  const scoreNumEl  = document.getElementById('scoreNum');
  const fillEl      = document.getElementById('scoreRingFill');
  const subtitleEl  = document.getElementById('scoreSubtitle');
  const badgeEl     = document.getElementById('scoreBadge');

  const circumference = 2 * Math.PI * 50;   // r = 50
  const offset = circumference - (score / 100) * circumference;
  const color  = scoreColor(score);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  fillEl.style.strokeDashoffset = offset;
  fillEl.style.stroke           = color;
  fillEl.style.filter           = isLight ? `drop-shadow(0 2px 4px rgba(0, 122, 255, 0.3))` : `drop-shadow(0 0 8px ${color})`;

  if (silent) {
    scoreNumEl.textContent = score;
  } else {
    animateValue(scoreNumEl, parseInt(scoreNumEl.textContent) || 0, score);
  }
  
  subtitleEl.textContent = scoreSubtitleText(score);
  badgeEl.textContent    = scoreBadgeText(score);
  badgeEl.style.color    = color;
  badgeEl.style.borderColor = color;
  badgeEl.style.background  = `${color}1a`;
}

// ── Stat Cards ───────────────────────────────────────────────
function updateStatCards(report, eyeCount) {
  document.getElementById('statTotal').textContent = fmtMin(report.total);
  document.getElementById('statStudy').textContent = fmtMin(report.study);
  document.getElementById('statEntertainment').textContent = fmtMin(report.entertainment);
  document.getElementById('statEye').textContent   = eyeCount;
}

// ── Doughnut Chart ───────────────────────────────────────────
function updateDoughnutChart(report, silent = false) {
  const data = [report.study, report.entertainment, report.work, report.other];
  const labels = ['Study', 'Entertainment', 'Work', 'Other'];
  const colors = Object.values(CAT_COLORS);

  const ctx = document.getElementById('doughnutChart').getContext('2d');
  const total = report.total;

  // In-place update if chart already exists to prevent visual jumping
  if (doughnutChart && total > 0 && doughnutChart.data.datasets.length > 0 && doughnutChart.data.labels[0] !== 'No data yet') {
    doughnutChart.data.datasets[0].data = data;
    if (silent) {
      doughnutChart.update('none'); // Update without animation
    } else {
      doughnutChart.update();
    }
    
    // Custom legend
    const legend = document.getElementById('doughnutLegend');
    legend.innerHTML = labels.map((l, i) => data[i] > 0 ? `
      <div class="legend-chip">
        <span class="legend-dot" style="background:${colors[i]}"></span>
        <span>${l}: ${fmtMin(data[i])}</span>
      </div>` : '').join('');
    return;
  }

  if (doughnutChart) { doughnutChart.destroy(); }

  if (total === 0) {
    // Empty state placeholder
    doughnutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['No data yet'],
        datasets: [{ data: [1], backgroundColor: ['rgba(167,139,250,.08)'], borderColor: ['rgba(167,139,250,.18)'], borderWidth: 1 }],
      },
      options: { cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 800 } },
    });
    document.getElementById('doughnutLegend').innerHTML = '<span style="color:var(--text-muted);font-size:.82rem;">Log sessions to see breakdown</span>';
    return;
  }

  doughnutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => `${c}cc`),
        borderColor:     colors,
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${fmtMin(ctx.raw)} (${Math.round(ctx.raw / total * 100)}%)`,
          },
        },
      },
      animation: { duration: silent ? 0 : 900, easing: 'easeOutQuart' },
    },
  });

  // Custom legend
  const legend = document.getElementById('doughnutLegend');
  legend.innerHTML = labels.map((l, i) => data[i] > 0 ? `
    <div class="legend-chip">
      <span class="legend-dot" style="background:${colors[i]}"></span>
      <span>${l}: ${fmtMin(data[i])}</span>
    </div>` : '').join('');
}

// ── Ratio Bar ────────────────────────────────────────────────
function updateRatioBar(report) {
  const study = report.study;
  const ent = report.entertainment || 0;
  const sum = study + ent;

  
  let fillPct = 50;
  let studyDisplayPct = 0;
  let entDisplayPct = 0;
  
  if (sum > 0) {
    fillPct = (study / sum) * 100;
    // Calculate rounded percentages so they sum to exactly 100% (or roughly)
    studyDisplayPct = Math.round((study / sum) * 100);
    entDisplayPct = 100 - studyDisplayPct;
  } else if (report.total > 0) {
    fillPct = 0;
  }

  document.getElementById('ratioFill').style.width = `${fillPct}%`;
  document.getElementById('ratioStudyPct').textContent = `${studyDisplayPct}%`;
  document.getElementById('ratioEntPct').textContent   = `${entDisplayPct}%`;
}

// ── Balance Tip ──────────────────────────────────────────────
function updateBalanceTip(report) {
  const tipEl = document.getElementById('balanceTipText');
  const study  = report.study_ratio;
  const total  = report.total;

  let tip;
  if (total === 0) {
    tip = 'Start logging sessions to get personalised insights!';
  } else if (total > 480) {
    tip = '⚠️ You\'ve been on screen for 8+ hours today. Time for a long break!';
  } else if (study < 20 && total > 60) {
    tip = '📚 Study ratio is low. Try swapping one entertainment session for learning.';
  } else if (study > 80) {
    tip = '🎮 Great focus! Allow yourself some light entertainment to stay balanced.';
  } else if (report.entertainment_ratio > 50) {
    tip = '🎮 Entertainment is dominating your screen time. Set a 2-hour daily limit.';
  } else {
    tip = '✅ Balanced day so far! Maintain this ratio for a healthy digital life.';
  }
  tipEl.textContent = tip;
}

// ── Sessions List ────────────────────────────────────────────
function renderSessions(sessions) {
  const list = document.getElementById('sessionsList');
  if (!list) return;
  if (sessions.length === 0) {
    list.innerHTML = `<div class="empty-state"><span>🌱</span><p>No sessions logged yet. Start tracking!</p></div>`;
    return;
  }

  // Diffing comparison to prevent flickering
  const currentSessionIds = Array.from(list.querySelectorAll('.session-item')).map(el => el.id);
  const incomingSessionIds = sessions.map(s => `sess-${s.id}`);

  const setsEqual = currentSessionIds.length === incomingSessionIds.length && 
                    currentSessionIds.every((val, index) => val === incomingSessionIds[index]);

  if (!setsEqual) {
    // Rebuild DOM if sessions are added, removed, or switched
    list.innerHTML = sessions.map(s => `
      <div class="session-item" id="sess-${s.id}" data-minutes="${s.minutes}">
        <span class="session-cat-dot" style="background:${CAT_COLORS[s.category] || '#888'}"></span>
        <span class="session-app">
          ${escHtml(s.app_name)}
          ${s.is_auto ? '<span class="auto-badge" style="font-size: 0.68rem; color: var(--green-vivid); background: var(--green-glow-sm); border: 1px solid var(--green-glow); padding: 0.1rem 0.35rem; border-radius: 4px; margin-left: 0.4rem; font-weight: 600; display: inline-flex; align-items: center; gap: 2px;">🤖 Auto</span>' : ''}
        </span>
        <span class="session-cat">${s.category}</span>
        <span class="session-time">${fmtMin(s.minutes)}</span>
        <button class="session-del" onclick="deleteSession(${s.id})" aria-label="Delete ${escHtml(s.app_name)} session" title="Delete">✕</button>
      </div>`).join('');
  } else {
    // Smoothly update minutes of existing rows inline without flashing
    sessions.forEach(s => {
      const row = document.getElementById(`sess-${s.id}`);
      if (row) {
        const oldMins = parseFloat(row.getAttribute('data-minutes')) || 0;
        if (Math.abs(oldMins - s.minutes) > 0.01) {
          row.setAttribute('data-minutes', s.minutes);
          const timeEl = row.querySelector('.session-time');
          if (timeEl) timeEl.textContent = fmtMin(s.minutes);
        }
      }
    });
  }
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

async function deleteSession(id) {
  await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
  const item = document.getElementById(`sess-${id}`);
  if (item) { item.style.opacity = '0'; item.style.transform = 'translateX(20px)'; item.style.transition = 'all .3s ease'; setTimeout(() => loadDashboard(), 300); }
}

// ══════════════════════════════════════════════════════════════
// LOG TIME
// ══════════════════════════════════════════════════════════════
async function submitSession(e) {
  e.preventDefault();
  const errEl = document.getElementById('formError');
  errEl.textContent = '';

  const appName  = document.getElementById('appName').value.trim();
  const category = document.getElementById('category').value;
  const hours    = parseInt(document.getElementById('hours').value) || 0;
  const minutes  = parseInt(document.getElementById('minutes').value) || 0;
  const totalMin = hours * 60 + minutes;

  if (!appName)    { errEl.textContent = 'Please enter an app / activity name.'; return; }
  if (!category)   { errEl.textContent = 'Please select a category.'; return; }
  if (totalMin <= 0) { errEl.textContent = 'Please enter at least 1 minute.'; return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_name: appName, category, minutes: totalMin }),
  });

  btn.disabled = false;
  btn.innerHTML = '<span class="btn-icon">➕</span> Log Session';

  if (res.ok) {
    showToast(`✅ Logged ${fmtMin(totalMin)} of ${appName}`);
    document.getElementById('logForm').reset();
    loadDashboard(); // refresh dashboard
    checkAndNotify(); // check if any limit was hit
  } else {
    // Show specific error if the server provided one
    try {
      const errData = await res.json();
      errEl.textContent = errData.error || `Error ${res.status}. Please try again.`;
    } catch {
      if (res.status === 401) {
        errEl.textContent = 'Session expired. Please refresh the page and log in again.';
      } else {
        errEl.textContent = `Server error (${res.status}). Please refresh and try again.`;
      }
    }
  }
}

function preset(appName, category, minutes) {
  document.getElementById('appName').value    = appName;
  document.getElementById('category').value   = category;
  document.getElementById('hours').value      = Math.floor(minutes / 60);
  document.getElementById('minutes').value    = minutes % 60;
  switchTab('log');
}

// ══════════════════════════════════════════════════════════════
// EYE-CARE TIMER
// ══════════════════════════════════════════════════════════════
function startEyeTimer() {
  if (eyeActive) return;
  
  const btnStart = document.getElementById('btnEyeStart');
  if (!btnStart) return;

  eyeActive  = true;
  eyePaused  = false;
  
  const endTime = Date.now() + 20 * 60 * 1000;
  localStorage.setItem('eyeTimerActive', 'true');
  localStorage.setItem('eyeTimerEndTime', endTime.toString());
  localStorage.removeItem('eyeTimerPaused');
  localStorage.removeItem('eyeTimerRemainingMs');

  // Update UI button states
  btnStart.textContent = '⏳ Running…';
  btnStart.disabled    = true;
  
  const btnPause = document.getElementById('btnEyePause');
  if (btnPause) {
    btnPause.style.display = 'inline-flex';
    btnPause.textContent = 'Pause';
    btnPause.disabled    = false;
  }

  const btnStop = document.getElementById('btnEyeStop');
  if (btnStop) {
    btnStop.style.display = 'inline-flex';
    btnStop.disabled = false;
  }
  
  const btnDone = document.getElementById('btnEyeDone');
  if (btnDone) btnDone.disabled = true;

  runEyeTimer(endTime);
}

function runEyeTimer(endTime) {
  if (eyeInterval) clearInterval(eyeInterval);

  eyeInterval = setInterval(() => {
    const countdown = document.getElementById('eyeCountdown');
    if (!countdown) {
      clearInterval(eyeInterval);
      return;
    }

    if (eyePaused) return; // Keep countdown frozen if paused

    const remainingMs = endTime - Date.now();
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    eyeSeconds = remainingSec;

    const m = String(Math.floor(remainingSec / 60)).padStart(2, '0');
    const s = String(remainingSec % 60).padStart(2, '0');
    countdown.textContent = `${m}:${s}`;

    if (remainingSec <= 0) {
      clearInterval(eyeInterval);
      eyeActive = false;
      localStorage.removeItem('eyeTimerActive');
      localStorage.removeItem('eyeTimerEndTime');
      localStorage.removeItem('eyeTimerPaused');
      localStorage.removeItem('eyeTimerRemainingMs');
      
      const btnDone = document.getElementById('btnEyeDone');
      if (btnDone) btnDone.disabled = false;
      
      const btnPause = document.getElementById('btnEyePause');
      if (btnPause) {
        btnPause.style.display = 'none';
      }

      const btnStop = document.getElementById('btnEyeStop');
      if (btnStop) {
        btnStop.style.display = 'none';
      }

      openEyeModal();
    }
  }, 1000);
}

function togglePauseEyeTimer() {
  if (!eyeActive) return;

  const btnPause = document.getElementById('btnEyePause');
  if (!btnPause) return;

  if (!eyePaused) {
    // Pause it!
    eyePaused = true;
    
    // Clear ticking interval
    if (eyeInterval) clearInterval(eyeInterval);

    // Save exactly how much time is left
    const endTimeStr = localStorage.getItem('eyeTimerEndTime');
    let remainingMs = 20 * 60 * 1000;
    if (endTimeStr) {
      remainingMs = Math.max(0, parseInt(endTimeStr) - Date.now());
    }
    
    localStorage.setItem('eyeTimerPaused', 'true');
    localStorage.setItem('eyeTimerRemainingMs', remainingMs.toString());

    // Update UI
    btnPause.textContent = 'Resume';
    showToast('⏸️ Eye-care timer paused!');
  } else {
    // Resume it!
    eyePaused = false;

    // Retrieve remaining ms
    const remainingMsStr = localStorage.getItem('eyeTimerRemainingMs') || (20 * 60 * 1000).toString();
    const remainingMs = parseInt(remainingMsStr);
    
    const newEndTime = Date.now() + remainingMs;
    localStorage.setItem('eyeTimerEndTime', newEndTime.toString());
    localStorage.removeItem('eyeTimerPaused');
    localStorage.removeItem('eyeTimerRemainingMs');

    // Update UI
    btnPause.textContent = 'Pause';
    showToast('▶️ Eye-care timer resumed!');

    // Start ticking again
    runEyeTimer(newEndTime);
  }
}

function stopEyeTimer() {
  if (eyeInterval) clearInterval(eyeInterval);
  eyeActive  = false;
  eyePaused  = false;
  eyeSeconds = 20 * 60;
  
  localStorage.removeItem('eyeTimerActive');
  localStorage.removeItem('eyeTimerEndTime');
  localStorage.removeItem('eyeTimerPaused');
  localStorage.removeItem('eyeTimerRemainingMs');

  // Reset UI
  const countdown = document.getElementById('eyeCountdown');
  if (countdown) countdown.textContent = '20:00';
  
  const btnStart = document.getElementById('btnEyeStart');
  if (btnStart) {
    btnStart.textContent = 'Start Timer';
    btnStart.disabled    = false;
  }
  
  const btnPause = document.getElementById('btnEyePause');
  if (btnPause) {
    btnPause.style.display = 'none';
  }

  const btnStop = document.getElementById('btnEyeStop');
  if (btnStop) {
    btnStop.style.display = 'none';
  }
  
  const btnDone = document.getElementById('btnEyeDone');
  if (btnDone) btnDone.disabled = true;
}

function restoreEyeTimer() {
  const btnStart = document.getElementById('btnEyeStart');
  const countdown = document.getElementById('eyeCountdown');
  const btnPause = document.getElementById('btnEyePause');
  const btnStop = document.getElementById('btnEyeStop');
  const btnDone = document.getElementById('btnEyeDone');
  
  if (!btnStart || !countdown) return; // Guard: not on dashboard/timer page!

  const isActive = localStorage.getItem('eyeTimerActive') === 'true';
  if (!isActive) return;

  const isPaused = localStorage.getItem('eyeTimerPaused') === 'true';

  if (isPaused) {
    eyeActive = true;
    eyePaused = true;

    const remainingMsStr = localStorage.getItem('eyeTimerRemainingMs') || (20 * 60 * 1000).toString();
    const remainingMs = parseInt(remainingMsStr);
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    eyeSeconds = remainingSec;

    const m = String(Math.floor(remainingSec / 60)).padStart(2, '0');
    const s = String(remainingSec % 60).padStart(2, '0');
    countdown.textContent = `${m}:${s}`;

    // Set UI states
    btnStart.textContent = '⏳ Running…';
    btnStart.disabled    = true;
    
    if (btnPause) {
      btnPause.style.display = 'inline-flex';
      btnPause.textContent = 'Resume';
      btnPause.disabled    = false;
    }
    if (btnStop) {
      btnStop.style.display = 'inline-flex';
      btnStop.disabled = false;
    }
    if (btnDone) btnDone.disabled = true;

  } else {
    // Active and NOT paused
    const endTimeStr = localStorage.getItem('eyeTimerEndTime');
    if (!endTimeStr) return;

    const endTime = parseInt(endTimeStr);
    const remainingMs = endTime - Date.now();

    if (remainingMs > 0) {
      eyeActive = true;
      eyePaused = false;
      
      // Set UI states
      btnStart.textContent = '⏳ Running…';
      btnStart.disabled    = true;
      
      if (btnPause) {
        btnPause.style.display = 'inline-flex';
        btnPause.textContent = 'Pause';
        btnPause.disabled    = false;
      }
      if (btnStop) {
        btnStop.style.display = 'inline-flex';
        btnStop.disabled = false;
      }
      if (btnDone) btnDone.disabled = true;

      // Run active tick
      runEyeTimer(endTime);
    } else {
      // Elapsed while tab was closed/offline
      eyeActive = false;
      eyePaused = false;
      localStorage.removeItem('eyeTimerActive');
      localStorage.removeItem('eyeTimerEndTime');
      localStorage.removeItem('eyeTimerPaused');
      localStorage.removeItem('eyeTimerRemainingMs');
      
      countdown.textContent = '00:00';
      
      btnStart.textContent = 'Start Timer';
      btnStart.disabled    = false;
      
      if (btnPause) {
        btnPause.style.display = 'none';
      }
      if (btnStop) {
        btnStop.style.display = 'none';
      }
      if (btnDone) btnDone.disabled = false;
      
      // Alert the user that their eye break has completed
      openEyeModal();
    }
  }
}

function openEyeModal() {
  const modal = document.getElementById('eyeModal');
  if (modal) modal.classList.add('open');
  playNotificationSound();
}

function closeEyeModal() {
  const modal = document.getElementById('eyeModal');
  if (modal) modal.classList.remove('open');
  logEyeBreak();
}

function closeLimitModal() {
  const modal = document.getElementById('limitExceededModal');
  if (modal) modal.classList.remove('open');
}

async function logEyeBreak() {
  await fetch('/api/eye_care', { method: 'POST' });

  // Reset timer
  if (eyeInterval) clearInterval(eyeInterval);
  eyeActive  = false;
  eyePaused  = false;
  eyeSeconds = 20 * 60;
  
  localStorage.removeItem('eyeTimerActive');
  localStorage.removeItem('eyeTimerEndTime');
  localStorage.removeItem('eyeTimerPaused');
  localStorage.removeItem('eyeTimerRemainingMs');

  const countdown = document.getElementById('eyeCountdown');
  if (countdown) countdown.textContent = '20:00';

  const btnStart = document.getElementById('btnEyeStart');
  if (btnStart) {
    btnStart.textContent  = 'Start Timer';
    btnStart.disabled     = false;
  }

  const btnDone = document.getElementById('btnEyeDone');
  if (btnDone) btnDone.disabled = true;

  const btnPause = document.getElementById('btnEyePause');
  if (btnPause) {
    btnPause.style.display = 'none';
  }
  
  const btnStop = document.getElementById('btnEyeStop');
  if (btnStop) {
    btnStop.style.display = 'none';
  }

  // Update count
  const res = await fetch('/api/eye_care/count');
  const data = await res.json();
  const statEye = document.getElementById('statEye');
  if (statEye) statEye.textContent = data.count;

  showToast('👁️ Eye break logged! Great job caring for your eyes.');
}

// ══════════════════════════════════════════════════════════════
// WEEKLY
// ══════════════════════════════════════════════════════════════
async function loadWeekly(offset = currentWeekOffset) {
  currentWeekOffset = offset;
  
  // Set dropdown value to match offset
  const selectEl = document.getElementById('weeklyOffsetSelect');
  if (selectEl) {
    selectEl.value = offset;
  }
  
  // Disable next button if offset is 0 (can't go into the future!)
  const btnNext = document.getElementById('btnNextWeek');
  if (btnNext) {
    btnNext.disabled = (offset <= 0);
  }
  
  // Disable prev button if offset is 12 (our maximum history)
  const btnPrev = document.getElementById('btnPrevWeek');
  if (btnPrev) {
    btnPrev.disabled = (offset >= 12);
  }

  const res  = await fetch(`/api/weekly?week_offset=${offset}`);
  const data = await res.json();

  // Dynamically update the header title based on the returned week dates!
  if (data && data.length > 0) {
    const startDateStr = formatDateLabel(data[0].date);
    const endDateStr = formatDateLabel(data[data.length - 1].date);
    const title = document.getElementById('weeklyTitle');
    if (title) {
      if (offset === 0) {
        title.textContent = `This Week (${startDateStr} – ${endDateStr})`;
      } else if (offset === 1) {
        title.textContent = `Last Week (${startDateStr} – ${endDateStr})`;
      } else {
        title.textContent = `${offset} Weeks Ago (${startDateStr} – ${endDateStr})`;
      }
    }
  }

  renderWeeklyChart(data);
  renderWeeklyScores(data);
}

function changeWeekOffset(offset) {
  loadWeekly(offset);
}

function navigateWeek(dir) {
  const newOffset = currentWeekOffset + dir;
  if (newOffset >= 0 && newOffset <= 12) {
    loadWeekly(newOffset);
  }
}

function formatDateLabel(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderWeeklyChart(data) {
  const ctx = document.getElementById('weeklyChart').getContext('2d');
  if (weeklyChart) weeklyChart.destroy();

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const gridColor = isLight ? 'rgba(0,122,255,.08)' : 'rgba(0,230,118,.06)';
  const tickColor = isLight ? '#57799c' : '#4a7c59';
  const legendColor = isLight ? '#2b445e' : '#a5d6a7';
  
  // Custom point sizing depending on duration for premium responsiveness
  let pointRadius = 0;
  if (data.length <= 7) {
    pointRadius = 4; // nice, tactile, large points for 7 days
  } else if (data.length <= 30) {
    pointRadius = 2; // smaller points for 30 days
  } else {
    pointRadius = 0; // hide points for 90 days to prevent clutter
  }
  
  let datasets = [];
  let chartType = 'line';
  let scales = {};

  if (weeklyChartStyle === 'area') {
    chartType = 'line';
    datasets = [
      { label: 'Study',         key: 'study',         color: CAT_COLORS.study },
      { label: 'Entertainment', key: 'entertainment', color: CAT_COLORS.entertainment },
      { label: 'Work',          key: 'work',          color: CAT_COLORS.work },
      { label: 'Other',         key: 'other',         color: CAT_COLORS.other },
    ].map(cat => ({
      label: cat.label,
      data: data.map(d => d[cat.key]),
      backgroundColor: `${cat.color}25`, // semi-transparent area fill
      borderColor: cat.color,
      borderWidth: 2.5, // bold neon stroke look
      fill: true,
      tension: 0.4, // smooth curved line
      pointRadius: pointRadius,
      pointHoverRadius: pointRadius > 0 ? pointRadius + 3 : 5,
      pointBackgroundColor: cat.color,
      pointBorderColor: '#fff',
      pointBorderWidth: pointRadius > 0 ? 1.5 : 0,
    }));

    scales = {
      x: { 
        stacked: false, 
        grid: { color: gridColor }, 
        ticks: { 
          color: tickColor,
          maxTicksLimit: data.length > 30 ? 10 : (data.length > 7 ? 8 : undefined)
        } 
      },
      y: { 
        stacked: true, 
        grid: { color: gridColor }, 
        ticks: { color: tickColor, callback: v => fmtMin(v) },
        afterFit: (scale) => {
          scale.width = 55;
        }
      },
    };
  } else if (weeklyChartStyle === 'bar') {
    chartType = 'bar';
    datasets = [
      { label: 'Study',         key: 'study',         color: CAT_COLORS.study },
      { label: 'Entertainment', key: 'entertainment', color: CAT_COLORS.entertainment },
      { label: 'Work',          key: 'work',          color: CAT_COLORS.work },
      { label: 'Other',         key: 'other',         color: CAT_COLORS.other },
    ].map(cat => ({
      label: cat.label,
      data: data.map(d => d[cat.key]),
      backgroundColor: `${cat.color}99`,
      borderRadius: 4,
    }));

    scales = {
      x: { 
        stacked: true, 
        grid: { color: gridColor }, 
        ticks: { 
          color: tickColor,
          maxTicksLimit: data.length > 30 ? 10 : (data.length > 7 ? 8 : undefined)
        } 
      },
      y: { 
        stacked: true, 
        grid: { color: gridColor }, 
        ticks: { color: tickColor, callback: v => fmtMin(v) },
        afterFit: (scale) => {
          scale.width = 55;
        }
      },
    };
  }

  weeklyChart = new Chart(ctx, {
    type: chartType,
    data: {
      labels: data.map(d => d.label),
      datasets: datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          left: 0,
          right: 10,
          top: 0,
          bottom: 0
        }
      },
      onClick: (event, elements) => {
        if (elements && elements.length > 0) {
          const index = elements[0].index;
          selectDay(data, index);
        }
      },
      plugins: {
        legend: {
          labels: { color: legendColor, font: { size: 12 }, boxWidth: 14, boxHeight: 14 },
          position: 'bottom',
        },
        tooltip: { 
          callbacks: { 
            label: ctx => {
              if (ctx.dataset.yAxisID === 'yScore') {
                return ` ${ctx.dataset.label}: ${ctx.raw}`;
              }
              return ` ${ctx.dataset.label}: ${fmtMin(ctx.raw)}`;
            }
          } 
        },
      },
      scales: scales,
      animation: { duration: 900, easing: 'easeOutQuart' },
    },
  });
}

function renderWeeklyScores(data) {
  const container = document.getElementById('weeklyScores');
  currentWeeklyData = data; // Cache data
  
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="width: 100%; grid-column: 1 / -1; margin-top: 1rem;">
        <span>🌱</span>
        <p>No screen time sessions logged in this period.</p>
      </div>`;
    return;
  }

  // Map each day with its original index
  const cardsData = data.map((d, origIndex) => ({ ...d, origIndex }));

  // For longer ranges (30 or 90 days), filter out empty days to keep the dashboard pristine
  let displayedCards = cardsData;
  if (data.length > 7) {
    displayedCards = cardsData.filter(d => d.total > 0);
  }

  if (displayedCards.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="width: 100%; grid-column: 1 / -1; margin-top: 1rem;">
        <span>🌱</span>
        <p>No active screen time sessions logged in this period.</p>
      </div>`;
    return;
  }
  
  container.innerHTML = displayedCards.map((d) => {
    const hasData = d.total > 0;
    const scoreText = hasData ? d.balance_score : '–';
    const color = hasData ? scoreColor(d.balance_score) : 'var(--text-muted)';
    const cardOpacity = hasData ? '1' : '0.5';
    
    // Parse the numerical date day number (e.g. 17 from 2026-05-17)
    const dateParts = d.date ? d.date.split('-') : [];
    const dayNum = dateParts.length === 3 ? parseInt(dateParts[2]) : '';

    return `
      <div class="day-score-card" data-index="${d.origIndex}" style="opacity: ${cardOpacity};">
        <div class="day-label">${d.label}</div>
        <div class="day-date">${dayNum}</div>
        <div class="day-score" style="color: ${color}; font-weight: ${hasData ? '700' : '400'};">${scoreText}</div>
        <div class="day-total">${hasData ? fmtMin(d.total) : '–'}</div>
      </div>`;
  }).join('');

  // Add click listeners to cards
  container.querySelectorAll('.day-score-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.getAttribute('data-index'));
      selectDay(data, idx);
    });
  });

  // Default to selecting the most recent day that has data
  let defaultIdx = data.length - 1;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].total > 0) {
      defaultIdx = i;
      break;
    }
  }
  
  if (data.length > 0) {
    selectDay(data, defaultIdx);
  }
}

function selectDay(data, index) {
  const selected = data[index];
  if (!selected) return;

  // Update card highlights
  const cards = document.querySelectorAll('.day-score-card');
  cards.forEach((card) => {
    const origIdx = parseInt(card.getAttribute('data-index'));
    if (origIdx === index) {
      card.classList.add('active');
      card.style.opacity = '1'; // make active card fully bright
      // Smoothly scroll active card to the center of the timeline
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
      card.classList.remove('active');
      const dayData = data[origIdx];
      const hasData = dayData && dayData.total > 0;
      card.style.opacity = hasData ? '1' : '0.5'; // restore default opacity
    }
  });

  // Display detail panel
  const panel = document.getElementById('selectedDayContainer');
  if (panel) panel.style.display = 'block';

  // Update Title
  const title = document.getElementById('detailDayTitle');
  if (title) title.textContent = selected.label;

  // Update Score
  const scoreNum = document.getElementById('detailScoreNum');
  const scoreText = selected.total > 0 ? selected.balance_score : '–';
  if (scoreNum) {
    scoreNum.textContent = scoreText;
    scoreNum.style.color = selected.total > 0 ? scoreColor(selected.balance_score) : 'var(--text-muted)';
  }

  // Update Score Ring
  const ring = document.getElementById('detailScoreRing');
  if (ring) {
    const radius = 48;
    const circumference = 2 * Math.PI * radius; // 301.6
    if (selected.total > 0) {
      const offset = circumference - (selected.balance_score / 100) * circumference;
      ring.style.strokeDashoffset = offset;
      ring.style.stroke = scoreColor(selected.balance_score);
    } else {
      ring.style.strokeDashoffset = circumference; // empty
      ring.style.stroke = 'var(--green-glow)';
    }
  }

  // Update Score Badge
  const badge = document.getElementById('detailScoreBadge');
  if (badge) {
    if (selected.total > 0) {
      const score = selected.balance_score;
      let label = 'POOR';
      let bgColor = 'rgba(255, 110, 64, 0.12)';
      let borderColor = 'rgba(255, 110, 64, 0.25)';
      let color = '#ff6e40';
      if (score >= 80) {
        label = 'EXCELLENT';
        bgColor = 'var(--green-glow)';
        borderColor = 'var(--border-glass)';
        color = 'var(--green-vivid)';
      } else if (score >= 60) {
        label = 'GOOD';
        bgColor = 'var(--green-glow-sm)';
        borderColor = 'var(--border-glass)';
        color = 'var(--green-mid)';
      } else if (score >= 40) {
        label = 'FAIR';
        bgColor = 'rgba(255, 215, 64, 0.12)';
        borderColor = 'rgba(255, 215, 64, 0.25)';
        color = '#ffd740';
      }
      badge.textContent = label;
      badge.style.background = bgColor;
      badge.style.border = `1px solid ${borderColor}`;
      badge.style.color = color;
      badge.style.display = 'inline-block';
    } else {
      badge.textContent = 'NO DATA';
      badge.style.background = 'rgba(255, 255, 255, 0.05)';
      badge.style.border = '1px solid var(--border-glass)';
      badge.style.color = 'var(--text-muted)';
      badge.style.display = 'inline-block';
    }
  }

  // Update Total Time
  const totalTime = document.getElementById('detailTotalTime');
  if (totalTime) {
    totalTime.textContent = selected.total > 0 ? fmtMin(selected.total) : '0m';
  }

  // Update Category List Breakdown
  const catList = document.getElementById('detailCatsList');
  if (catList) {
    const cats = [
      { name: 'Study', key: 'study', emoji: '📖', color: 'var(--cat-study)' },
      { name: 'Entertainment', key: 'entertainment', emoji: '🍿', color: 'var(--cat-ent)' },
      { name: 'Work', key: 'work', emoji: '💼', color: 'var(--cat-work)' },
      { name: 'Other', key: 'other', emoji: '🧩', color: 'var(--cat-other)' },
    ];
    
    catList.innerHTML = cats.map(cat => {
      const val = selected[cat.key] || 0;
      const pct = selected.total > 0 ? (val / selected.total) * 100 : 0;
      return `
        <div class="detail-cat-row">
          <div class="detail-cat-info">
            <span style="color: ${cat.color}; font-weight: 500;">${cat.emoji} ${cat.name}</span>
            <span style="color: var(--text-primary); font-weight: 600;">${fmtMin(val)} (${Math.round(pct)}%)</span>
          </div>
          <div class="detail-cat-bar-track">
            <div class="detail-cat-bar-fill" style="width: ${pct}%; background: ${cat.color}; box-shadow: 0 0 6px ${cat.color}88;"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

function changeChartStyle(style) {
  weeklyChartStyle = style;
  
  // Update toggle button active states
  document.querySelectorAll('.style-btn').forEach(btn => {
    if (btn.getAttribute('data-style') === style) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Re-render chart if cache is present
  if (currentWeeklyData) {
    renderWeeklyChart(currentWeeklyData);
  }
}

// ══════════════════════════════════════════════════════════════
// HABITS PAGE
// ══════════════════════════════════════════════════════════════
const HABITS = [
  'No phones during meals',
  'Screen-free 30 min before bed',
  'Took all 3 eye-care breaks today',
  'Studied for at least 2 hours',
  'Kept entertainment under 2 hours',
  'Had at least 30 min of offline activity',
  'Charged phone outside the bedroom',
  'Reviewed my Balance Score',
];


const TIPS = [
  { title: '🌙 Night Mode', body: 'Enable blue-light filter after 8 PM to protect your sleep cycle.' },
  { title: '⏱️ App Limits', body: 'Use your phone\'s built-in screen time limits for social media apps.' },
  { title: '🧠 Mindful Scrolling', body: 'Before opening any app, ask: "What is my purpose right now?"' },
  { title: '📚 Read Offline', body: 'Replace 30 min of screen time daily with a physical book or journal.' },
  { title: '🚶 Move Hourly', body: 'Stand up and move for 5 minutes every hour to reset focus.' },
  { title: '🔕 Notification Detox', body: 'Turn off non-essential notifications. Check messages on your schedule.' },
  { title: '🎯 Intentional Use', body: 'Set a specific goal before opening YouTube or social media.' },
  { title: '📅 Time Blocking', body: 'Allocate fixed time slots for study and entertainment, then stick to them.' },
];



function initHabits() {
  // Checklist
  const stored = JSON.parse(localStorage.getItem('habitChecks') || '{}');
  const todayObj = new Date();
  const offset = todayObj.getTimezoneOffset() * 60000;
  const localDate = new Date(todayObj.getTime() - offset);
  const today = localDate.toISOString().split('T')[0];
  const checks = stored[today] || {};

  const list = document.getElementById('habitChecklist');
  list.innerHTML = HABITS.map((h, i) => {
    const checked = checks[i] ? 'checked' : '';
    return `
      <div class="check-item ${checked}" id="check-${i}" role="checkbox" aria-checked="${!!checks[i]}" tabindex="0" onclick="toggleHabit(${i})" onkeydown="if(event.key==='Enter'||event.key===' ')toggleHabit(${i})">
        <div class="check-box">${checks[i] ? '✓' : ''}</div>
        <span class="check-label">${h}</span>
      </div>`;
  }).join('');

  // Tips
  const tipsEl = document.getElementById('tipsGrid');
  if (!tipsEl.children.length) {
    tipsEl.innerHTML = TIPS.map(t => `
      <div class="tip-card">
        <div class="tip-title">${t.title}</div>
        <div class="tip-body">${t.body}</div>
      </div>`).join('');

  }
}

function toggleHabit(idx) {
  const todayObj = new Date();
  const offset = todayObj.getTimezoneOffset() * 60000;
  const localDate = new Date(todayObj.getTime() - offset);
  const today = localDate.toISOString().split('T')[0];
  const stored  = JSON.parse(localStorage.getItem('habitChecks') || '{}');
  if (!stored[today]) stored[today] = {};

  const current = !!stored[today][idx];
  stored[today][idx] = !current;
  localStorage.setItem('habitChecks', JSON.stringify(stored));

  const item = document.getElementById(`check-${idx}`);
  item.classList.toggle('checked', !current);
  item.setAttribute('aria-checked', String(!current));
  item.querySelector('.check-box').textContent = !current ? '✓' : '';
}

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.NOTIFICATIONS_ENABLED !== 'undefined') {
    localStorage.setItem('app_notifications_enabled', window.NOTIFICATIONS_ENABLED === 'false' ? 'false' : 'true');
  }

  loadDashboard();
  // Auto-refresh every 5 minutes
  setInterval(loadDashboard, 5 * 60 * 1000);

  // Auto-refresh limits and check notifications every 10 seconds
  setInterval(() => {
    loadAndRenderLimits();
    checkActiveLimits();
  }, 10000);


  // Request notification permission if not yet decided
  if ('Notification' in window && Notification.permission === 'default') {
    const banner = document.getElementById('notifBanner');
    if (banner) banner.style.display = 'flex';
  }
});


// ════════════════════════════════════════════════════════════
// TIME LIMITS
// ════════════════════════════════════════════════════════════

// Track which apps we've already notified today so we don't spam
function getNotifiedTodaySet() {
  const todayStr = new Date().toISOString().split('T')[0];
  const savedDate = localStorage.getItem('notified_apps_date');
  if (savedDate !== todayStr) {
    localStorage.setItem('notified_apps_date', todayStr);
    localStorage.setItem('notified_apps_today', '[]');
    return new Set();
  }
  return new Set(JSON.parse(localStorage.getItem('notified_apps_today') || '[]'));
}

const notifiedToday = getNotifiedTodaySet();

function markAppAsNotified(appName) {
  const todayStr = new Date().toISOString().split('T')[0];
  localStorage.setItem('notified_apps_date', todayStr);
  notifiedToday.add(appName.toLowerCase());
  localStorage.setItem('notified_apps_today', JSON.stringify(Array.from(notifiedToday)));
}

// ── Request notification permission ────────────────────────────
function requestNotifPermission() {
  if (!('Notification' in window)) {
    showToast('⚠️ Your browser does not support notifications.');
    return;
  }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      document.getElementById('notifBanner').style.display = 'none';
      showToast('🔔 Notifications enabled! You\'ll be alerted when limits are hit.');
      // Send a test notification
      new Notification('DigitalBalance ✅', {
        body: 'Notifications are now enabled for time limit alerts!',
        icon: '/static/icon.png',
      });
    } else {
      showToast('⚠️ Notifications blocked. You can enable them in browser settings.');
    }
  });
}

// ── Play notification sound ───────────────────────────────────────
function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;

    if (notificationSoundStyle === 'short') {
      // ⚡ Standard Chirp (Short, 0.5s)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.1); // C6
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (notificationSoundStyle === 'long') {
      // 🎵 Calming Zen Chimes (Long, ~2.5s)
      const notes = [329.63, 392.00, 493.88, 659.25, 987.77]; // E4, G4, B4, E5, B5 (Warm Em7 chord)
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'triangle'; // Warm, flute-like tone
        osc.frequency.setValueAtTime(freq, now + idx * 0.18); // Arpeggiated sequence
        osc.frequency.exponentialRampToValueAtTime(freq * 1.015, now + idx * 0.18 + 0.5); // Subtle vibration
        
        gain.gain.setValueAtTime(0, now + idx * 0.18);
        gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.18 + 0.05); // Soft attack
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 1.5); // Very long decay
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.18);
        osc.stop(now + idx * 0.18 + 1.6);
      });
    } else if (notificationSoundStyle === 'alarm') {
      // 🔔 Repeating Chime Alarm (Extra Long, ~3.0s)
      // Pulse 3 double-beeps spaced out
      const alarmBeeps = [0, 0.15, 0.8, 0.95, 1.6, 1.75]; // Timings for double beeps
      alarmBeeps.forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880.00, now + delay); // A5 note
        
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.25, now + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.25);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.3);
      });
    } else if (notificationSoundStyle === 'drip') {
      // 💧 Water Droplet (Short, 0.3s)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.2);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (notificationSoundStyle === 'ding') {
      // 🛎️ Classic Ding (Short, 0.8s)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2000, now);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (notificationSoundStyle === 'synth') {
      // 🎛️ Synth Echo (Medium, ~1.5s)
      const notes = [600, 500, 400, 300];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + idx * 0.2);
        
        gain.gain.setValueAtTime(0, now + idx * 0.2);
        gain.gain.linearRampToValueAtTime(0.15 / (idx + 1), now + idx * 0.2 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.2 + 0.3);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.2);
        osc.stop(now + idx * 0.2 + 0.3);
      });
    }
  } catch (e) {

    console.error("Audio playback failed", e);
  }
}

function changeSoundStyle(style) {
  notificationSoundStyle = style;
  localStorage.setItem('sound_style', style);
  
  // Sync selector in UI
  const s1 = document.getElementById('soundSelector');
  if (s1) s1.value = style;
  
  // Sync style with backend database
  fetch('/api/user/save_sound_style', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sound_style: style })
  }).catch(err => console.error("Failed to sync sound style with server:", err));
  
  playNotificationSound(); // instantly preview the newly selected sound!
}


// ── Send a push notification ────────────────────────────────────
function sendNotification(appName, usedMin, limitMin) {
  const appNotifEnabled = localStorage.getItem('app_notifications_enabled') !== 'false';
  if (!appNotifEnabled) return; // Mute completely if notifications are disabled/paused!

  if (notifiedToday.has(appName.toLowerCase())) return;  // already notified
  markAppAsNotified(appName);

  playNotificationSound();
  
  // Also show the pop-in instructor
  showInstructor(`You've reached your limit for ${appName}! Time to take a break. 🌿`, 8000);

  // Show the custom in-website modal popup
  const modal = document.getElementById('limitExceededModal');
  const msgEl = document.getElementById('limitExceededMessage');
  if (modal && msgEl) {
    msgEl.innerHTML = `You've reached your daily limit for <strong>${appName}</strong>!<br/>You’ve used <strong>${fmtMin(usedMin)}</strong> of your <strong>${fmtMin(limitMin)}</strong> limit today. It's time to step away, rest your eyes, and get some offline relaxation! 🧘‍♂️✨`;
    modal.classList.add('open');
  }

  // If push notifications are supported, enabled in settings, and granted, trigger native notification
  if (appNotifEnabled && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(`⏰ Time limit reached: ${appName}`, {
      body: `You’ve used ${fmtMin(usedMin)} of ${fmtMin(limitMin)} today. Take a break! 🌿`,
      icon: '/static/icon.png',
      badge: '/static/icon.png',
      tag:  `limit-${appName}`,
    });
  }
}

// ── Check active limits periodically ────────────────────────────
async function checkActiveLimits() {
  try {
    const res = await fetch('/api/limits/check');
    if (!res.ok) return;
    const limitsStatus = await res.json();
    limitsStatus.forEach(status => {
      if (status.exceeded) {
        sendNotification(status.app_name, status.used_minutes, status.limit_minutes);
      }
    });
  } catch (e) {
    console.error("Error checking active limits:", e);
  }
}

// ── Load & render limits tab ────────────────────────────────────
// ── Load & render limits tab ────────────────────────────────────
async function initLimits() {
  const statusText = document.getElementById('notifStatusText');
  const toggleInput = document.getElementById('appNotificationsToggle');
  const guideEl = document.getElementById('notifSetupGuide');
  
  const appNotifEnabled = localStorage.getItem('app_notifications_enabled') !== 'false';

  if (toggleInput) toggleInput.checked = appNotifEnabled;
  if (statusText) {
    if (appNotifEnabled) {
      statusText.textContent = '✓ Website Alerts & Sound enabled';
      statusText.style.color = 'var(--green-vivid)';
    } else {
      statusText.textContent = '🔕 Website Alerts & Sound paused';
      statusText.style.color = 'var(--text-muted)';
    }
  }
  if (guideEl) guideEl.style.display = 'none';

  await loadAndRenderLimits();
}

// ── Toggle Notifications Option ──────────────────────────────────
function toggleNotifications(enabled) {
  const toggleInput = document.getElementById('appNotificationsToggle');
  const statusText = document.getElementById('notifStatusText');
  const guideEl = document.getElementById('notifSetupGuide');

  if (enabled) {
    localStorage.setItem('app_notifications_enabled', 'true');
    // Clear notified list so that they immediately get alerted for any currently exceeded limits!
    localStorage.setItem('notified_apps_today', '[]');
    if (typeof notifiedToday !== 'undefined' && notifiedToday.clear) {
      notifiedToday.clear();
    }
    fetch('/api/user/save_notifications_enabled', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ enabled: true })
    });
    if (statusText) {
      statusText.textContent = '✓ Website Alerts & Sound enabled';
      statusText.style.color = 'var(--green-vivid)';
    }
    if (guideEl) guideEl.style.display = 'none';
    showToast('🔔 Website alerts and sound enabled! (No laptop notifications)');
    // Instantly check and trigger the custom in-website modal notification
    checkActiveLimits();
  } else {
    localStorage.setItem('app_notifications_enabled', 'false');
    fetch('/api/user/save_notifications_enabled', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ enabled: false })
    });
    if (statusText) {
      statusText.textContent = '🔕 Website Alerts & Sound paused';
      statusText.style.color = 'var(--text-muted)';
    }
    if (guideEl) guideEl.style.display = 'none';
    showToast('🔕 Website alerts and sound are now paused.');
  }
}

function selectPopularApp(appName, hours, mins) {
  document.getElementById('limitApp').value = appName;
  document.getElementById('limitHours').value = hours;
  document.getElementById('limitMins').value = mins;
  const summaryText = document.getElementById('limitSummaryText');
  if (summaryText) {
    summaryText.textContent = `Limit: ${hours}h ${mins}m per day`;
  }
}

// Global track for active inline limit editing
let editingAppName = null;

async function loadAndRenderLimits() {
  const [limitsRes, checkRes] = await Promise.all([
    fetch('/api/limits'),
    fetch('/api/limits/check'),
  ]);
  const limits = await limitsRes.json();
  const status = await checkRes.json();

  const statusMap = {};
  status.forEach(s => { statusMap[s.app_name.toLowerCase()] = s; });

  renderLimits(limits, statusMap);
}

function renderLimits(limits, statusMap) {
  if (editingAppName !== null) {
    // Skip re-rendering the limits list DOM while editing to prevent input disruption/refreshing
    return;
  }
  const list = document.getElementById('limitsList');
  
  // Update summary cards
  const activeLimitsEl = document.getElementById('activeLimitsCount');
  const overLimitEl = document.getElementById('overLimitCount');
  const onTrackEl = document.getElementById('onTrackCount');
  
  if (activeLimitsEl) activeLimitsEl.textContent = limits.length;
  
  let over = 0;
  let onTrack = 0;
  limits.forEach(lim => {
    const key = lim.app_name.toLowerCase();
    const s = statusMap[key] || { exceeded: false };
    if (s.exceeded) over++;
    else onTrack++;
  });
  
  if (overLimitEl) overLimitEl.textContent = over;
  if (onTrackEl) onTrackEl.textContent = onTrack;

  if (!limits.length) {
    list.innerHTML = `
          <div class="empty-state-new" style="text-align: center; padding: 3rem 1rem; border: 1px dashed rgba(255,255,255,0.1); border-radius: 8px;">
            <div class="empty-icon" style="color: var(--text-muted); margin-bottom: 1rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">No limits yet. Create one to stay mindful of your daily app time.</p>
            <button class="btn-green" onclick="document.getElementById('limitsForm').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => document.getElementById('limitApp').focus(), 500);" style="padding: 0.5rem 1rem; font-size: 0.85rem; font-weight: 600;">Add your first limit</button>
          </div>
    `;
    return;
  }

  // Check if we can do a smooth inline update to prevent flickering/blinking
  const currentItems = Array.from(list.querySelectorAll('.limit-item'));
  const currentAppNames = currentItems.map(el => el.id.replace('lim-', ''));
  const incomingAppNames = limits.map(lim => lim.app_name.replace(/[^a-zA-Z0-9]/g, '_'));
  
  const setsEqual = currentAppNames.length === incomingAppNames.length && 
                    currentAppNames.every((val, index) => val === incomingAppNames[index]);

  if (setsEqual) {
    limits.forEach(lim => {
      const key = lim.app_name.toLowerCase();
      const s = statusMap[key] || { used_minutes: 0, percent: 0, exceeded: false, category: 'entertainment' };
      const pct = s.percent;
      const safeId = lim.app_name.replace(/[^a-zA-Z0-9]/g, '_');
      const itemEl = document.getElementById(`lim-${safeId}`);
      if (itemEl) {
        // If the item was in editing mode (so its header is missing), restore the full inner HTML
        if (!itemEl.querySelector('.limit-item-header')) {
          const barCol = 'linear-gradient(to right, #00FF87, #ffd740, #ff5252)';
          const icon   = APP_ICONS[key] || `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
          const cat    = s.category || 'entertainment';

          itemEl.innerHTML = `
            <div class="limit-item-header">
              <div class="limit-item-left">
                <span class="limit-app-icon">${icon}</span>
                <div class="limit-app-details">
                  <span class="limit-app-name">${escHtml(lim.app_name)}</span>
                  <span class="tracker-cat-badge auto-cat-${cat}">${cat.toUpperCase()}</span>
                </div>
              </div>
              <div class="limit-item-right" id="lim-right-${safeId}">
                <span class="limit-time-info">${fmtMin(s.used_minutes)} / ${fmtMin(lim.limit_minutes)}</span>
                <button class="limit-edit-btn" onclick="startEditLimit(this.dataset.app, ${lim.limit_minutes})" data-app="${escHtml(lim.app_name)}" title="Edit limit" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.2rem 0.4rem; border-radius: 4px; transition: color 0.2s, background 0.2s; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; margin-right: 2px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="feather feather-edit-2" style="display: block;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                </button>
                <button class="limit-del-btn" onclick="deleteLimit(this.dataset.app)" data-app="${escHtml(lim.app_name)}" title="Remove limit">✕</button>
              </div>
            </div>
            <div class="limit-bar-row">
              <div class="limit-bar-track">
                <div class="limit-bar-fill" style="width:${Math.min(100, pct)}%; background:${barCol}"></div>
              </div>
              ${s.exceeded ? '<span class="limit-warning-icon">⚠️</span>' : ''}
            </div>
            <div class="limit-bar-labels">
              <span>${pct}% used</span>
              <span>${fmtMin(Math.max(0, lim.limit_minutes - s.used_minutes))} remaining</span>
            </div>
          `;
          itemEl.classList.remove('limit-item-editing');
        }

        // Exceeded class list update
        if (s.exceeded) {
          itemEl.classList.add('limit-exceeded');
        } else {
          itemEl.classList.remove('limit-exceeded');
        }
        
        // Category badge update
        const badgeEl = itemEl.querySelector('.tracker-cat-badge');
        if (badgeEl) {
          const cat = s.category || 'entertainment';
          badgeEl.textContent = cat.toUpperCase();
          badgeEl.className = `tracker-cat-badge auto-cat-${cat}`;
        }
        
        // Time info & edit controls update
        const rightWrap = itemEl.querySelector('.limit-item-right');
        if (rightWrap) {
          const timeInfoEl = rightWrap.querySelector('.limit-time-info');
          if (timeInfoEl) {
            timeInfoEl.textContent = `${fmtMin(s.used_minutes)} / ${fmtMin(lim.limit_minutes)}`;
          }
          const editBtn = rightWrap.querySelector('.limit-edit-btn');
          if (editBtn) {
            editBtn.setAttribute('onclick', `startEditLimit(this.dataset.app, ${lim.limit_minutes})`);
          }
        }
        
        // Progress bar width update
        const fillEl = itemEl.querySelector('.limit-bar-fill');
        if (fillEl) {
          fillEl.style.width = `${Math.min(100, pct)}%`;
        }
        
        // Warning icon update
        const barRow = itemEl.querySelector('.limit-bar-row');
        if (barRow) {
          const warningEl = barRow.querySelector('.limit-warning-icon');
          if (s.exceeded) {
            if (!warningEl) {
              const span = document.createElement('span');
              span.className = 'limit-warning-icon';
              span.textContent = '⚠️';
              barRow.appendChild(span);
            }
          } else {
            if (warningEl) {
              warningEl.remove();
            }
          }
        }
        
        // Label update
        const labelsEl = itemEl.querySelector('.limit-bar-labels');
        if (labelsEl) {
          labelsEl.innerHTML = `
            <span>${pct}% used</span>
            <span>${fmtMin(Math.max(0, lim.limit_minutes - s.used_minutes))} remaining</span>
          `;
        }
      }
    });
  } else {
    // Rebuild HTML from scratch
    list.innerHTML = limits.map(lim => {
      const key    = lim.app_name.toLowerCase();
      const s      = statusMap[key] || { used_minutes: 0, percent: 0, exceeded: false, category: 'entertainment' };
      const pct    = s.percent;
      const barCol = 'linear-gradient(to right, #00FF87, #ffd740, #ff5252)';
      const icon   = APP_ICONS[key] || `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
      const cat    = s.category || 'entertainment';
      const safeId = lim.app_name.replace(/[^a-zA-Z0-9]/g, '_');

      return `
        <div class="limit-item ${s.exceeded ? 'limit-exceeded' : ''}" id="lim-${safeId}" style="animation: fadeIn 0.3s ease-out;">
          <div class="limit-item-header">
            <div class="limit-item-left">
              <span class="limit-app-icon">${icon}</span>
              <div class="limit-app-details">
                <span class="limit-app-name">${escHtml(lim.app_name)}</span>
                <span class="tracker-cat-badge auto-cat-${cat}">${cat.toUpperCase()}</span>
              </div>
            </div>
            <div class="limit-item-right" id="lim-right-${safeId}">
              <span class="limit-time-info">${fmtMin(s.used_minutes)} / ${fmtMin(lim.limit_minutes)}</span>
              <button class="limit-edit-btn" onclick="startEditLimit(this.dataset.app, ${lim.limit_minutes})" data-app="${escHtml(lim.app_name)}" title="Edit limit" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.2rem 0.4rem; border-radius: 4px; transition: color 0.2s, background 0.2s; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; margin-right: 2px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="feather feather-edit-2" style="display: block;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
              </button>
              <button class="limit-del-btn" onclick="deleteLimit(this.dataset.app)" data-app="${escHtml(lim.app_name)}" title="Remove limit">✕</button>
            </div>
          </div>
          <div class="limit-bar-row">
            <div class="limit-bar-track">
              <div class="limit-bar-fill" style="width:${Math.min(100, pct)}%; background:${barCol}"></div>
            </div>
            ${s.exceeded ? '<span class="limit-warning-icon">⚠️</span>' : ''}
          </div>
          <div class="limit-bar-labels">
            <span>${pct}% used</span>
            <span>${fmtMin(Math.max(0, lim.limit_minutes - s.used_minutes))} remaining</span>
          </div>
        </div>`;
    }).join('');
  }
}

// ── App emoji icon map ─────────────────────────────────────────
const APP_ICONS = {
  youtube: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`,
  netflix: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`,
  twitter: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path></svg>`,
  tiktok: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
  gaming: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M6 12h4"></path><path d="M8 10v4"></path><line x1="15" y1="13" x2="15" y2="13"></line><line x1="18" y1="11" x2="18" y2="11"></line></svg>`,
  whatsapp: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.5A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`,
  reddit: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  facebook: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>`,
  discord: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.5A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`,
  spotify: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
  coding: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
  reading: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path></svg>`,
  work: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`,
  study: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path></svg>`,
};


// ── Set a new limit ─────────────────────────────────────────────
async function handleSetLimit(e) {
  e.preventDefault();
  const errEl = document.getElementById('limitsError');
  errEl.textContent = '';

  const appName = document.getElementById('limitApp').value.trim();
  const hours   = parseInt(document.getElementById('limitHours').value) || 0;
  const mins    = parseInt(document.getElementById('limitMins').value)  || 0;
  const total   = hours * 60 + mins;

  if (!appName) { errEl.textContent = 'Please enter an app name.'; return; }
  if (total <= 0) { errEl.textContent = 'Limit must be at least 1 minute.'; return; }

  const btn = document.getElementById('setLimitBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const res = await fetch('/api/limits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_name: appName, limit_minutes: total }),
  });

  btn.disabled = false;
  btn.textContent = 'Set Limit';

  if (res.ok) {
    showToast(`⏰ Limit set: ${appName} → ${fmtMin(total)}/day`);
    document.getElementById('limitsForm').reset();
    document.getElementById('limitHours').value = '1';
    document.getElementById('limitMins').value  = '0';
    // Reset notification state for this app to allow a new alert if the limit changed
    notifiedToday.delete(appName.toLowerCase());
    localStorage.setItem('notified_apps_today', JSON.stringify(Array.from(notifiedToday)));
    await loadAndRenderLimits();
    checkActiveLimits();
  } else {
    const d = await res.json();
    errEl.textContent = d.error || 'Failed to save. Try again.';
  }
}

// ── Delete a limit ──────────────────────────────────────────────
async function deleteLimit(appName) {
  await fetch(`/api/limits/${encodeURIComponent(appName)}`, { method: 'DELETE' });
  showToast(`✅ Limit removed for ${appName}`);
  notifiedToday.delete(appName.toLowerCase());
  localStorage.setItem('notified_apps_today', JSON.stringify(Array.from(notifiedToday)));
  await loadAndRenderLimits();
}

// ── Inline Edit Limits ──────────────────────────────────────────
function startEditLimit(appName, currentLimitMin) {
  editingAppName = appName;
  const safeId = appName.replace(/[^a-zA-Z0-9]/g, '_');
  const cardEl = document.getElementById(`lim-${safeId}`);
  if (!cardEl) return;

  const currentHrs = Math.floor(currentLimitMin / 60);
  const currentMins = Math.round(currentLimitMin % 60);
  
  const escapedAppName = appName.replace(/'/g, "\\'");

  cardEl.classList.add('limit-item-editing');

  cardEl.innerHTML = `
    <div class="limit-edit-panel limit-edit-inline">
      <div class="limit-edit-title-row">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 1.1rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));">⏰</span>
          <span class="limit-edit-title">
            Edit daily limit for <span class="limit-edit-app-name">${escHtml(appName)}</span>
          </span>
        </div>
        <span class="limit-edit-badge">Editor</span>
      </div>
      
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; flex-wrap: wrap;">
        <!-- Left: Time Picker -->
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <!-- Hours -->
          <div style="display: flex; flex-direction: column; align-items: center; gap: 0.25rem;">
            <div class="limit-edit-time-box">
              <input type="number" class="time-input hrs-input" value="${currentHrs}" min="0" max="23" placeholder="0">
              <div style="display: flex; flex-direction: column; gap: 2px; justify-content: center;">
                <button type="button" class="limit-edit-spin-btn" onclick="incrementSiblingInput(this, 23)">▲</button>
                <button type="button" class="limit-edit-spin-btn" onclick="decrementSiblingInput(this, 0)">▼</button>
              </div>
            </div>
            <span class="limit-edit-label">HOURS</span>
          </div>
          
          <span class="limit-edit-colon">:</span>
          
          <!-- Minutes -->
          <div style="display: flex; flex-direction: column; align-items: center; gap: 0.25rem;">
            <div class="limit-edit-time-box">
              <input type="number" class="time-input mins-input" value="${currentMins}" min="0" max="59" placeholder="0">
              <div style="display: flex; flex-direction: column; gap: 2px; justify-content: center;">
                <button type="button" class="limit-edit-spin-btn" onclick="incrementSiblingInput(this, 59)">▲</button>
                <button type="button" class="limit-edit-spin-btn" onclick="decrementSiblingInput(this, 0)">▼</button>
              </div>
            </div>
            <span class="limit-edit-label">MINUTES</span>
          </div>
        </div>
        
        <!-- Right: Actions -->
        <div style="display: flex; align-items: center; gap: 0.65rem;">
          <button type="button" class="limit-edit-cancel-btn" onclick="cancelEditLimit()" title="Cancel editing">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="feather feather-x" style="display: block;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            <span>Cancel</span>
          </button>
          
          <button type="button" class="limit-edit-save-btn" onclick="saveEditLimit('${escapedAppName}', this)" title="Save limit">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check" style="display: block;"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function cancelEditLimit() {
  editingAppName = null;
  loadAndRenderLimits();
}

async function saveEditLimit(appName, buttonEl) {
  const container = buttonEl ? buttonEl.closest('.limit-edit-inline') : null;
  let hrsEl, minsEl;
  
  if (container) {
    hrsEl = container.querySelector('.hrs-input');
    minsEl = container.querySelector('.mins-input');
  } else {
    // Fallback to ID-based lookup if invoked programmatically without a button trigger
    const safeId = appName.replace(/[^a-zA-Z0-9]/g, '_');
    hrsEl = document.getElementById(`edit-hrs-${safeId}`);
    minsEl = document.getElementById(`edit-mins-${safeId}`);
  }
  
  if (!hrsEl || !minsEl) return;

  const hrs = parseInt(hrsEl.value, 10) || 0;
  const mins = parseInt(minsEl.value, 10) || 0;
  const totalMin = (hrs * 60) + mins;

  if (totalMin <= 0) {
    showToast("⚠️ Limit must be at least 1 minute!");
    return;
  }

  try {
    const res = await fetch('/api/limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_name: appName,
        limit_minutes: totalMin
      })
    });

    if (res.ok) {
      showToast(`✏️ Updated limit for ${appName} to ${fmtMin(totalMin)}!`);
      // Reset notified cache for this app since the limit was updated
      notifiedToday.delete(appName.toLowerCase());
      localStorage.setItem('notified_apps_today', JSON.stringify(Array.from(notifiedToday)));
      cancelEditLimit();
      checkActiveLimits();
    } else {
      const d = await res.json();
      showToast(`⚠️ ${d.error || 'Failed to update'}`);
    }
  } catch (e) {
    console.error("Error updating limit:", e);
    showToast("⚠️ Connection error updating limit.");
  }
}

// ── Set limit for a specific app from tracker ───────────────────
function setLimitForApp(encodedAppName) {
  const appName = decodeURIComponent(encodedAppName);
  switchTab('limits');
  const appInput = document.getElementById('limitApp');
  if (appInput) {
    appInput.value = appName;
    // Scroll to form
    const form = document.getElementById('limitsForm');
    if (form) form.scrollIntoView({ behavior: 'smooth' });
    const hoursInput = document.getElementById('limitHours');
    if (hoursInput) hoursInput.focus();
  }
}


// ── Check limits and fire notifications ─────────────────────────
async function checkAndNotify() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const res    = await fetch('/api/limits/check');
    const status = await res.json();
    status.forEach(s => {
      if (s.exceeded) sendNotification(s.app_name, s.used_minutes, s.limit_minutes);
    });
  } catch { /* silently ignore network errors */ }
}

// ══════════════════════════════════════════════════════════════
// POP-IN INSTRUCTOR
// ══════════════════════════════════════════════════════════════
const INSTRUCTOR_MESSAGES = [
  "Welcome! 👋 I'm here to help you maintain your WellBeingTracker! ✨",
  "Use the Dashboard to see your WellBeing Score. Aim for 80 or higher! 🎯",
  "Don't forget to log your study and entertainment sessions. 📝",
  "The 20-20-20 rule is great for eye care. I'll remind you to take breaks! 👀",
  "You can set Time Limits for any app. I'll pop up if you go over! ⏱️",
  "Check out the Habits tab for some daily wellness tips! 💡",
  "Having a diverse set of activities boosts your WellBeing Score. Try something new! 🚀",
];


let messageIndex = 0;

let instructorTimeout = null;

// Text typewriter animation helper that handles emojis correctly
function animateTextMessage(element, text, speed = 40) {
  if (!element) return;
  if (element.typewriterInterval) clearInterval(element.typewriterInterval);
  
  const chars = Array.from(text);
  element.textContent = '';
  let i = 0;
  
  element.typewriterInterval = setInterval(() => {
    if (i < chars.length) {
      element.textContent = chars.slice(0, i + 1).join('');
      i++;
    } else {
      clearInterval(element.typewriterInterval);
    }
  }, speed);
}

function showInstructor(message, duration = 6000) {
  const container = document.getElementById('instructor-container');
  const msgEl = document.getElementById('instructor-message');
  const bubble = document.getElementById('instructor-bubble');
  
  if (!container || !msgEl || !bubble) return;
  
  let text = '';
  // If a specific message is provided, use it. Otherwise, cycle through the info messages.
  if (message) {
    text = message;
  } else {
    text = INSTRUCTOR_MESSAGES[messageIndex];
    messageIndex = (messageIndex + 1) % INSTRUCTOR_MESSAGES.length;
  }
  
  // Ensure the character stays visible
  container.classList.remove('instructor-hidden');
  container.classList.add('instructor-visible');
  
  // Only auto-add mobile-show if it's already active/toggled on by the user or if we are not on mobile
  const btn = document.getElementById('instructorToggleBtn');
  const isMobile = window.innerWidth <= 600;
  if (!isMobile || (btn && btn.classList.contains('active'))) {
    container.classList.add('mobile-show');
  }
  
  // Show the bubble
  bubble.classList.add('bubble-visible');
  
  // Typewriter animation
  animateTextMessage(msgEl, text, 40);
  
  // Reset the timeout so clicking it again keeps it open
  if (instructorTimeout) clearTimeout(instructorTimeout);
  
  instructorTimeout = setTimeout(() => {
    bubble.classList.remove('bubble-visible');
  }, duration);
}

// ══════════════════════════════════════════════════════════════
// USER DROPDOWN & ACCOUNT
// ══════════════════════════════════════════════════════════════
function toggleUserDropdown() {
  const menu = document.getElementById('userDropdownMenu');
  const btn  = document.getElementById('userDropdownTrigger');
  if (!menu || !btn) return;
  
  const isActive = menu.classList.toggle('active');
  btn.setAttribute('aria-expanded', isActive);
}

function openEditAccountModal() {
  document.getElementById('userDropdownMenu').classList.remove('active');
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const themeSelect = document.getElementById('editTheme');
  if (themeSelect) {
    themeSelect.value = currentTheme;
  }
  document.getElementById('editAccountModal').classList.add('active');
}

function closeEditAccountModal() {
  document.getElementById('editAccountModal').classList.remove('active');
}

async function updateAccount() {
  const username = document.getElementById('editUsername').value.trim();
  const email    = document.getElementById('editEmail').value.trim();
  const phone    = document.getElementById('editPhone').value.trim();
  const bio      = document.getElementById('editBio').value.trim();
  const avatar   = document.getElementById('editAvatar').files[0];
  
  if (!username || !email) {
    alert('Please fill in all mandatory fields.');
    return;
  }
  
  const formData = new FormData();
  formData.append('username', username);
  formData.append('email', email);
  formData.append('phone', phone);
  formData.append('bio', bio);
  if (avatar) {
    formData.append('avatar', avatar);
  }
  
  try {
    const res = await fetch('/api/user/update', {
      method: 'POST',
      body: formData
    });
    
    const data = await res.json();
    if (data.success) {
      window.location.reload();
    } else {
      alert(data.error || 'Update failed');
    }
  } catch (e) {
    alert('Network error. Please try again.');
  }
}

async function deleteAccount() {
  if (!confirm("Are you absolutely sure you want to permanently delete your account? This action cannot be undone and all data will be lost.")) {
    return;
  }
  
  try {
    const res = await fetch('/api/account', {
      method: 'DELETE'
    });
    
    const data = await res.json();
    if (data.success) {
      // Redirect to login page after deletion
      window.location.href = '/login';
    } else {
      alert(data.error || 'Failed to delete account.');
    }
  } catch (e) {
    alert('Network error. Please try again.');
  }
}

function togglePasswordSection() {
  const section = document.getElementById('passwordSection');
  const arrow = document.getElementById('pwdSecArrow');
  
  // Clear any existing banners
  const errBanner = document.getElementById('pwdErrorBanner');
  const succBanner = document.getElementById('pwdSuccessBanner');
  if (errBanner) errBanner.style.display = 'none';
  if (succBanner) succBanner.style.display = 'none';

  if (section.style.display === 'none' || section.style.display === '') {
    section.style.display = 'flex';
    arrow.textContent = '▲';
  } else {
    section.style.display = 'none';
    arrow.textContent = '▼';
  }
}

async function changePassword() {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmNewPassword = document.getElementById('confirmNewPassword').value;

  const errBanner = document.getElementById('pwdErrorBanner');
  const errText = document.getElementById('pwdErrorText');
  const succBanner = document.getElementById('pwdSuccessBanner');
  const succText = document.getElementById('pwdSuccessText');

  function showError(msg) {
    if (succBanner) succBanner.style.display = 'none';
    if (errText && errBanner) {
      errText.textContent = msg;
      errBanner.style.display = 'flex';
    }
  }

  function showSuccess(msg) {
    if (errBanner) errBanner.style.display = 'none';
    if (succText && succBanner) {
      succText.textContent = msg;
      succBanner.style.display = 'flex';
    }
  }

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    showError('Please fill in all password fields.');
    return;
  }

  if (newPassword.length < 6) {
    showError('New password must be at least 6 characters.');
    return;
  }

  if (newPassword !== confirmNewPassword) {
    showError('New passwords do not match.');
    return;
  }

  try {
    const res = await fetch('/api/user/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmNewPassword
      })
    });

    const data = await res.json();
    if (data.success) {
      showSuccess('Password updated successfully!');
      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmNewPassword').value = '';
      
      // Auto-hide success banner and close password section after 2 seconds
      setTimeout(() => {
        if (succBanner) succBanner.style.display = 'none';
        togglePasswordSection();
      }, 2000);
    } else {
      showError(data.error || 'Failed to update password.');
    }
  } catch (e) {
    showError('Network error. Please try again.');
  }
}

function handleImagePreview(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const previewContainer = document.getElementById('modalAvatarPreview');
      let previewImg = document.getElementById('previewImg');
      const initials = document.getElementById('previewInitials');
      
      if (!previewImg) {
        previewImg = document.createElement('img');
        previewImg.id = 'previewImg';
        previewImg.className = 'avatar-img';
        previewContainer.insertBefore(previewImg, initials);
      }
      
      previewImg.src = e.target.result;
      previewImg.style.display = 'block';
      if (initials) {
        initials.style.display = 'none';
      }
    };
    reader.readAsDataURL(input.files[0]);
  }
}

// Global click listener for dropdowns
document.addEventListener('click', (e) => {
  const menu = document.getElementById('userDropdownMenu');
  const btn  = document.getElementById('userDropdownTrigger');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.remove('active');
    btn.setAttribute('aria-expanded', 'false');
  }
});

// Welcome the user and set up click listeners
document.addEventListener('DOMContentLoaded', () => {
  // Read initial sound style from body data attribute loaded from database
  const bodySound = document.body.getAttribute('data-sound-style');
  if (bodySound) {
    notificationSoundStyle = bodySound;
    localStorage.setItem('sound_style', bodySound);
  } else {
    notificationSoundStyle = localStorage.getItem('sound_style') || 'long';
  }

  // Restore persistent eye timer state if active!
  restoreEyeTimer();

  // Initialize notification sound selection value
  const s1 = document.getElementById('soundSelector');
  if (s1) s1.value = notificationSoundStyle;


  setTimeout(() => {
    // Only show the welcome message if the dashboard tab is currently active
    const dashboardActive = document.getElementById('section-dashboard')?.classList.contains('active');
    if (!dashboardActive) return;

    showInstructor("Welcome! 👋 I'm here to help you maintain your WellBeingTracker! ✨", 4000);
    
    setTimeout(() => {
      // Re-verify the dashboard tab is still active before giving the dashboard explanation
      const stillActive = document.getElementById('section-dashboard')?.classList.contains('active');
      if (stillActive) {
        showInstructor("This is your Dashboard. Here you can see your daily balance score and quick stats.", 5000);
      }
    }, 5000);
  }, 1000);


  const container = document.getElementById('instructor-container');

  // Hide the bubble if the user clicks anywhere else
  document.addEventListener('click', (e) => {
    // Ignore clicks on navigation tabs so the instructor can speak!
    if (e.target.closest('.nav-tab')) return;
    
    if (container && !container.contains(e.target)) {
      const bubble = document.getElementById('instructor-bubble');
      if (bubble && bubble.classList.contains('bubble-visible')) {
        bubble.classList.remove('bubble-visible');
        if (instructorTimeout) clearTimeout(instructorTimeout);
      }
    }
  });


  // Initialize background auto-tracker polling
  initTracker();

  // Scroll Observer to offer feedback when scrolling to Most Used Apps
  const autoCard = document.querySelector('.auto-detected-card');
  if (autoCard) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const dashboardActive = document.getElementById('section-dashboard')?.classList.contains('active');
        if (entry.isIntersecting && dashboardActive && !mostUsedAppWarned) {
          const firstRow = document.querySelector('#autoDetectedList .auto-detected-row');
          if (firstRow) {
            const appName = firstRow.querySelector('.auto-app-name')?.innerText || '';
            const rawDur = firstRow.querySelector('.auto-duration')?.innerText || '';
            const duration = rawDur.split('(')[0].trim();
            if (appName && duration) {
              mostUsedAppWarned = true;
              const msg = `I noticed you've spent the most time on ${appName} today (${duration}). 📊 Try taking a short screen break to rest your eyes! 🚶‍♂️👀`;
              showInstructor(msg, 6500);
            }
          }
        }
      });
    }, { threshold: 0.15 });
    observer.observe(autoCard);
  }
});


// ══════════════════════════════════════════════════════════════
// BACKGROUND AUTO-TRACKER FRONTEND LOGIC
// ══════════════════════════════════════════════════════════════
let trackerSessionSeconds = 0;
let trackerTimerInterval = null;

function initTracker() {
  const widget = document.getElementById('trackerStatusWidget');
  if (widget) {
    const isMinimized = localStorage.getItem('trackerWidgetMinimized') !== 'false';
    if (isMinimized) {
      widget.classList.add('minimized');
      const arrow = document.getElementById('widgetArrow');
      if (arrow) arrow.textContent = '▲';
    } else {
      widget.classList.remove('minimized');
      const arrow = document.getElementById('widgetArrow');
      if (arrow) arrow.textContent = '▼';
    }
  }

  // Initial poll and start 3s interval
  pollTrackerStatus();
  setInterval(pollTrackerStatus, 3000);

  // Check active limits on load and every 6 seconds
  checkActiveLimits();
  setInterval(checkActiveLimits, 6000);

  // Smooth real-time timer count up in browser (1s tick)
  if (trackerTimerInterval) clearInterval(trackerTimerInterval);
  trackerTimerInterval = setInterval(() => {
    const banner = document.getElementById('liveTrackerBanner');
    if (banner && banner.style.display !== 'none') {
      trackerSessionSeconds++;
      updateTimerDisplay(trackerSessionSeconds);
    }
  }, 1000);
}

window.toggleWidget = function() {
  const widget = document.getElementById('trackerStatusWidget');
  if (!widget) return;
  const wasMinimized = widget.classList.contains('minimized');
  widget.classList.toggle('minimized');
  localStorage.setItem('trackerWidgetMinimized', !wasMinimized);
  const arrow = document.getElementById('widgetArrow');
  if (arrow) {
    arrow.textContent = wasMinimized ? '▼' : '▲';
  }
};

function updateTimerDisplay(totalSecs) {
  const timerVal = document.getElementById('trackerSessionTimer');
  if (!timerVal) return;
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  
  const hStr = hours > 0 ? `${hours}h ` : '';
  const mStr = mins < 10 ? `0${mins}m` : `${mins}m`;
  const sStr = secs < 10 ? `0${secs}s` : `${secs}s`;
  timerVal.textContent = `${hStr}${mStr} ${sStr}`;
}

const CAT_ICONS = {
  study: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path></svg>`,
  entertainment: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M6 12h4"></path><path d="M8 10v4"></path><line x1="15" y1="13" x2="15" y2="13"></line><line x1="18" y1="11" x2="18" y2="11"></line></svg>`,
  work: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`,
  other: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
};


const CAT_LABELS = {
  study: 'Study',
  entertainment: 'Entertainment',
  work: 'Work',
  other: 'Other'
};

async function pollTrackerStatus() {
  const dotTracker = document.getElementById('widgetDotTracker');
  const textTracker = document.getElementById('widgetTextTracker');
  const dotApi = document.getElementById('widgetDotApi');
  const textApi = document.getElementById('widgetTextApi');
  const liveBanner = document.getElementById('liveTrackerBanner');
  const infoCard = document.getElementById('trackerInfoCard');
  
  try {
    const res = await fetch('/api/tracker/status');
    if (!res.ok) throw new Error('API Offline');
    
    const data = await res.json();
    
    // API is Online
    if (dotApi) {
      dotApi.classList.add('active');
      textApi.textContent = 'Connected';
      textApi.classList.add('active');
    }
    
    if (data.tracker_running) {
      if (dotTracker) {
        dotTracker.classList.add('active');
        textTracker.textContent = 'Active';
        textTracker.classList.add('active');
      }
      
      // Update Live Banner
      if (liveBanner) {
        liveBanner.style.display = 'flex';
      }
      if (infoCard) {
        infoCard.style.display = 'flex';
      }
      
      // Update Banner contents
      const faviconEl = document.getElementById('trackerAppFavicon');
      const nameEl = document.getElementById('trackerAppName');
      const catEl = document.getElementById('trackerAppCat');
      
      if (nameEl) nameEl.textContent = data.current_app;
      if (catEl) {
        catEl.textContent = CAT_LABELS[data.current_category] || data.current_category;
        catEl.className = `tracker-cat-badge auto-cat-${data.current_category}`;
      }
      if (faviconEl) {
        faviconEl.innerHTML = CAT_ICONS[data.current_category] || `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
      }

      
      // Sync running timer (only if out of sync by > 5 seconds)
      if (Math.abs(trackerSessionSeconds - data.session_duration) > 5) {
        trackerSessionSeconds = data.session_duration;
        updateTimerDisplay(trackerSessionSeconds);
      }
    } else {
      if (dotTracker) {
        dotTracker.classList.remove('active');
        textTracker.textContent = 'Offline';
        textTracker.classList.remove('active');
      }
      if (liveBanner) {
        liveBanner.style.display = 'none';
      }
      if (infoCard) {
        infoCard.style.display = 'none';
      }
    }
    
    // Update Auto-Detected List inside Dashboard card
    const listEl = document.getElementById('autoDetectedList');
    if (listEl) {
      if (data.auto_detected_apps && data.auto_detected_apps.length > 0) {
        // Check if we need a full rebuild (different set/order of apps)
        const currentAppNames = Array.from(listEl.querySelectorAll('.auto-detected-row')).map(el => el.getAttribute('data-app'));
        const incomingAppNames = data.auto_detected_apps.map(app => app.app_name);
        
        const setsEqual = currentAppNames.length === incomingAppNames.length && 
                          currentAppNames.every((val, index) => val === incomingAppNames[index]);
                          
        if (!setsEqual) {
          // Rebuild HTML from scratch
          let html = '';
          data.auto_detected_apps.forEach(app => {
            const categoryIcon = CAT_ICONS[app.category] || `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
            const categoryLabel = CAT_LABELS[app.category] || app.category;

            const totalMin = app.minutes;
            
            let durationStr = totalMin >= 60 ? `${Math.floor(totalMin / 60)}h ${Math.round(totalMin % 60)}m` : `${Math.round(totalMin)}m`;
            let barColor = 'var(--green-vivid)';
            if (app.category === 'entertainment') barColor = 'var(--cat-ent)';
            else if (app.category === 'work') barColor = 'var(--cat-work)';
            else if (app.category === 'other') barColor = 'var(--cat-other)';
            
            const safeAppNameAttr = app.app_name.replace(/"/g, '&quot;');
            
            const encodedAppName = encodeURIComponent(app.app_name);
            html += `
              <div class="auto-detected-row" data-app="${safeAppNameAttr}">
                <div class="auto-app-icon">${categoryIcon}</div>
                <div class="auto-app-name" title="${app.app_name}">${app.app_name}</div>
                <div>
                  <span class="auto-cat-pill auto-cat-${app.category}">${categoryLabel}</span>
                </div>
                <div class="auto-bar-track">
                  <div class="auto-bar-fill" style="width: ${app.percentage}%; background-color: ${barColor}; box-shadow: 0 0 8px ${barColor}; transition: width 0.8s ease-in-out;"></div>
                </div>
                <div class="auto-duration">${durationStr} (${app.percentage}%)</div>
                <button class="btn-outline btn-sm" onclick="setLimitForApp('${encodedAppName}')" title="Set Limit" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin-left: 0.5rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--green-vivid);"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  <span>Limit</span>
                </button>
              </div>
            `;

          });
          listEl.innerHTML = html;
        } else {
          // Smoothly update existing rows inline to prevent flickering and keep transitions active
          data.auto_detected_apps.forEach(app => {
            const safeAppNameAttr = app.app_name.replace(/"/g, '&quot;');
            const row = listEl.querySelector(`.auto-detected-row[data-app="${safeAppNameAttr}"]`);
            if (row) {
              const totalMin = app.minutes;
              let durationStr = totalMin >= 60 ? `${Math.floor(totalMin / 60)}h ${Math.round(totalMin % 60)}m` : `${Math.round(totalMin)}m`;
              
              // Update progress bar width smoothly
              const fill = row.querySelector('.auto-bar-fill');
              if (fill) fill.style.width = `${app.percentage}%`;
              
              // Update duration text
              const dur = row.querySelector('.auto-duration');
              if (dur) dur.textContent = `${durationStr} (${app.percentage}%)`;
            }
          });
        }
      } else {
        listEl.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); font-size: 0.88rem; padding: 1.5rem 1rem;">
            <div style="margin-bottom: 0.75rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line></svg>
            </div>
            <p style="margin-top: 0.25rem; font-weight: 500; color: var(--text-color);">No auto-detected applications tracked today.</p>
            <p style="font-size: 0.8rem; margin: 0.35rem 0 1rem; line-height: 1.4;">
              To start automated tracking, run <code style="font-family: monospace; color: var(--green-vivid);">tracker.py</code> locally on your computer.
            </p>
            
            <div class="cloud-helper-box" style="background: rgba(255,255,255,0.02); border: 1px dashed var(--border-glass); border-radius: 12px; padding: 0.85rem; max-width: 380px; margin: 0 auto; text-align: left;">
              <div style="font-size: 0.78rem; font-weight: 600; color: var(--green-vivid); margin-bottom: 0.35rem; display: flex; align-items: center; gap: 4px;">
                ☁️ Cloud Hosting Guide
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.35; margin-bottom: 0.75rem;">
                Running this on a remote server (like Render)? Your local tracker needs to know this website's address and credentials to sync data.
              </div>
              <button class="btn-outline btn-sm" onclick="downloadTrackerConfig()" style="width: 100%; justify-content: center; font-size: 0.75rem; padding: 0.4rem 0.75rem; display: inline-flex; align-items: center; gap: 6.6px; background: var(--green-glow-sm); border-color: var(--green-glow);">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--green-vivid);"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span style="color: var(--text-color);">Download tracker_config.json</span>
              </button>
              <div style="font-size: 0.7rem; color: var(--text-muted); text-align: center; margin-top: 0.5rem; line-height: 1.3;">
                Save this file in your project folder alongside <code style="font-family: monospace;">tracker.py</code>, then run it!
              </div>
            </div>
          </div>
        `;
      }
    }

    // Auto-refresh Dashboard components if on the Dashboard tab
    const dashboardSection = document.getElementById('section-dashboard');
    if (dashboardSection && dashboardSection.classList.contains('active')) {
      const dashDateInput = document.getElementById('dashDate');
      const dateStr = dashDateInput ? dashDateInput.value : null;
      loadDashboard(dateStr, true);
    }

    // Auto-refresh Limits components if on the Limits tab
    const limitsSection = document.getElementById('section-limits');
    if (limitsSection && limitsSection.classList.contains('active')) {
      loadAndRenderLimits();
    }
    
  } catch (err) {
    // API is Offline
    if (dotApi) {
      dotApi.classList.remove('active');
      textApi.textContent = 'Offline';
      textApi.classList.remove('active');
    }
    if (dotTracker) {
      dotTracker.classList.remove('active');
      textTracker.textContent = 'Offline';
      textTracker.classList.remove('active');
    }
    if (liveBanner) {
      liveBanner.style.display = 'none';
    }
    if (infoCard) {
      infoCard.style.display = 'none';
    }
  }
}

// ── Time Input Spinner Helpers ─────────────────────────────────
function incrementInput(id, max) {
  const input = document.getElementById(id);
  if (input) {
    let val = parseInt(input.value, 10) || 0;
    if (val < max) {
      input.value = val + 1;
      input.dispatchEvent(new Event('change'));
    }
  }
}

function decrementInput(id, min) {
  const input = document.getElementById(id);
  if (input) {
    let val = parseInt(input.value, 10) || 0;
    if (val > min) {
      input.value = val - 1;
      input.dispatchEvent(new Event('change'));
    }
  }
}

function incrementSiblingInput(btn, max) {
  const container = btn.closest('div').parentElement;
  const input = container.querySelector('input');
  if (input) {
    let val = parseInt(input.value, 10) || 0;
    if (val < max) {
      input.value = val + 1;
      input.dispatchEvent(new Event('change'));
    }
  }
}

function decrementSiblingInput(btn, min) {
  const container = btn.closest('div').parentElement;
  const input = container.querySelector('input');
  if (input) {
    let val = parseInt(input.value, 10) || 0;
    if (val > min) {
      input.value = val - 1;
      input.dispatchEvent(new Event('change'));
    }
  }
}
