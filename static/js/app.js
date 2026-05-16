/* ═══════════════════════════════════════════════════════════════
   Digital Well-Being Tracker  ·  app.js
   ═══════════════════════════════════════════════════════════════ */

// ── Category colours (must match CSS tokens) ─────────────────
const CAT_COLORS = {
  study:         '#00e676',
  entertainment: '#ff6e40',
  social:        '#40c4ff',
  work:          '#ffd740',
  other:         '#b39ddb',
};

// ── Chart instances ───────────────────────────────────────────
let doughnutChart = null;
let weeklyChart   = null;

// ── Eye-care timer ────────────────────────────────────────────
let eyeInterval   = null;
let eyeSeconds    = 20 * 60;   // 20 minutes
let eyeActive     = false;

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
    particles = Array.from({ length: 100 }, randomParticle);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,230,118,${p.a})`;
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
          ctx.strokeStyle = `rgba(0,230,118,${0.06 * (1 - dist / 100)})`;
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
function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(b => {
    b.classList.toggle('active', b.id === `tab-${tab}`);
    b.setAttribute('aria-selected', b.id === `tab-${tab}` ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-section').forEach(s => {
    s.classList.toggle('active', s.id === `section-${tab}`);
  });
  if (tab === 'weekly') loadWeekly();
  if (tab === 'habits') initHabits();
  if (tab === 'limits') initLimits();
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
  if (score >= 80) return '#00e676';
  if (score >= 60) return '#69f0ae';
  if (score >= 40) return '#ffd740';
  return '#ff6e40';
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
async function loadDashboard(dateStr) {
  if (!dateStr) {
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    const localDate = new Date(today.getTime() - offset);
    dateStr = localDate.toISOString().split('T')[0];
  }
  document.getElementById('dashDate').value = dateStr;

  const [reportRes, sessionsRes, eyeRes] = await Promise.all([
    fetch(`/api/report?date=${dateStr}`),
    fetch(`/api/sessions?date=${dateStr}`),
    fetch('/api/eye_care/count'),
  ]);
  const report   = await reportRes.json();
  const sessions = await sessionsRes.json();
  const eye      = await eyeRes.json();

  updateScoreRing(report.balance_score);
  updateStatCards(report, eye.count);
  updateDoughnutChart(report);
  updateRatioBar(report);
  updateBalanceTip(report);
  renderSessions(sessions);
}

// ── Score Ring ───────────────────────────────────────────────
function updateScoreRing(score) {
  const scoreNumEl  = document.getElementById('scoreNum');
  const fillEl      = document.getElementById('scoreRingFill');
  const subtitleEl  = document.getElementById('scoreSubtitle');
  const badgeEl     = document.getElementById('scoreBadge');

  const circumference = 2 * Math.PI * 50;   // r = 50
  const offset = circumference - (score / 100) * circumference;
  const color  = scoreColor(score);

  fillEl.style.strokeDashoffset = offset;
  fillEl.style.stroke           = color;
  fillEl.style.filter           = `drop-shadow(0 0 8px ${color})`;

  animateValue(scoreNumEl, parseInt(scoreNumEl.textContent) || 0, score);
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
  document.getElementById('statEnt').textContent   = fmtMin(report.entertainment);
  document.getElementById('statEye').textContent   = eyeCount;
}

// ── Doughnut Chart ───────────────────────────────────────────
function updateDoughnutChart(report) {
  const data = [report.study, report.entertainment, report.social, report.work, report.other];
  const labels = ['Study', 'Entertainment', 'Social', 'Work', 'Other'];
  const colors = Object.values(CAT_COLORS);

  const ctx = document.getElementById('doughnutChart').getContext('2d');

  if (doughnutChart) { doughnutChart.destroy(); }

  const total = report.total;
  if (total === 0) {
    // Empty state placeholder
    doughnutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['No data yet'],
        datasets: [{ data: [1], backgroundColor: ['rgba(0,230,118,.1)'], borderColor: ['rgba(0,230,118,.2)'], borderWidth: 1 }],
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
      animation: { duration: 900, easing: 'easeOutQuart' },
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
  const ent = report.entertainment;
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
  if (sessions.length === 0) {
    list.innerHTML = `<div class="empty-state"><span>🌱</span><p>No sessions logged yet. Start tracking!</p></div>`;
    return;
  }
  list.innerHTML = sessions.map(s => `
    <div class="session-item" id="sess-${s.id}">
      <span class="session-cat-dot" style="background:${CAT_COLORS[s.category] || '#888'}"></span>
      <span class="session-app">${escHtml(s.app_name)}</span>
      <span class="session-cat">${s.category}</span>
      <span class="session-time">${fmtMin(s.minutes)}</span>
      <button class="session-del" onclick="deleteSession(${s.id})" aria-label="Delete ${escHtml(s.app_name)} session" title="Delete">✕</button>
    </div>`).join('');
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
  eyeActive  = true;
  eyeSeconds = 20 * 60;
  document.getElementById('btnEyeStart').textContent = '⏳ Running…';
  document.getElementById('btnEyeStart').disabled    = true;

  eyeInterval = setInterval(() => {
    eyeSeconds--;
    const m = String(Math.floor(eyeSeconds / 60)).padStart(2, '0');
    const s = String(eyeSeconds % 60).padStart(2, '0');
    document.getElementById('eyeCountdown').textContent = `${m}:${s}`;

    if (eyeSeconds <= 0) {
      clearInterval(eyeInterval);
      eyeActive = false;
      document.getElementById('btnEyeDone').disabled = false;
      openEyeModal();
    }
  }, 1000);
}

function openEyeModal() {
  document.getElementById('eyeModal').classList.add('open');
}

function closeEyeModal() {
  document.getElementById('eyeModal').classList.remove('open');
  logEyeBreak();
}

async function logEyeBreak() {
  await fetch('/api/eye_care', { method: 'POST' });

  // Reset timer
  clearInterval(eyeInterval);
  eyeActive  = false;
  eyeSeconds = 20 * 60;
  document.getElementById('eyeCountdown').textContent = '20:00';
  document.getElementById('btnEyeStart').textContent  = 'Start Timer';
  document.getElementById('btnEyeStart').disabled     = false;
  document.getElementById('btnEyeDone').disabled      = true;

  // Update count
  const res = await fetch('/api/eye_care/count');
  const data = await res.json();
  document.getElementById('statEye').textContent = data.count;

  showToast('👁️ Eye break logged! Great job caring for your eyes.');
}

// ══════════════════════════════════════════════════════════════
// WEEKLY
// ══════════════════════════════════════════════════════════════
async function loadWeekly() {
  const res  = await fetch('/api/weekly');
  const data = await res.json();

  renderWeeklyChart(data);
  renderWeeklyScores(data);
}

function renderWeeklyChart(data) {
  const ctx = document.getElementById('weeklyChart').getContext('2d');
  if (weeklyChart) weeklyChart.destroy();

  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [
        { label: 'Study',         data: data.map(d => d.study),         backgroundColor: `${CAT_COLORS.study}99`,         borderRadius: 4 },
        { label: 'Entertainment', data: data.map(d => d.entertainment), backgroundColor: `${CAT_COLORS.entertainment}99`, borderRadius: 4 },
        { label: 'Social',        data: data.map(d => d.social),        backgroundColor: `${CAT_COLORS.social}99`,        borderRadius: 4 },
        { label: 'Work',          data: data.map(d => d.work),          backgroundColor: `${CAT_COLORS.work}99`,          borderRadius: 4 },
        { label: 'Other',         data: data.map(d => d.other),         backgroundColor: `${CAT_COLORS.other}99`,         borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#a5d6a7', font: { size: 12 }, boxWidth: 14, boxHeight: 14 },
          position: 'bottom',
        },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtMin(ctx.raw)}` } },
      },
      scales: {
        x: { stacked: true, grid: { color: 'rgba(0,230,118,.06)' }, ticks: { color: '#4a7c59' } },
        y: { stacked: true, grid: { color: 'rgba(0,230,118,.06)' }, ticks: { color: '#4a7c59', callback: v => fmtMin(v) } },
      },
      animation: { duration: 900, easing: 'easeOutQuart' },
    },
  });
}

function renderWeeklyScores(data) {
  const container = document.getElementById('weeklyScores');
  container.innerHTML = data.map(d => {
    const color = scoreColor(d.balance_score);
    return `
      <div class="day-score-card">
        <div class="day-label">${d.label}</div>
        <div class="day-score" style="color:${color}">${d.balance_score}</div>
        <div class="day-total">${d.total > 0 ? fmtMin(d.total) : '–'}</div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// HABITS PAGE
// ══════════════════════════════════════════════════════════════
const HABITS = [
  'No phones during meals 🍽️',
  'Screen-free 30 min before bed 🌙',
  'Took all 3 eye-care breaks today 👁️',
  'Studied for at least 2 hours 📚',
  'Kept entertainment under 2 hours 🎮',
  'Had at least 30 min of offline activity 🚶',
  'Charged phone outside the bedroom 🔌',
  'Reviewed my Balance Score 📊',
];

const TIPS = [
  { emoji: '🌙', title: 'Night Mode', body: 'Enable blue-light filter after 8 PM to protect your sleep cycle.' },
  { emoji: '📵', title: 'App Limits', body: 'Use your phone\'s built-in screen time limits for social media apps.' },
  { emoji: '🧘', title: 'Mindful Scrolling', body: 'Before opening any app, ask: "What is my purpose right now?"' },
  { emoji: '📖', title: 'Read Offline', body: 'Replace 30 min of screen time daily with a physical book or journal.' },
  { emoji: '🏃', title: 'Move Hourly', body: 'Stand up and move for 5 minutes every hour to reset focus.' },
  { emoji: '🔕', title: 'Notification Detox', body: 'Turn off non-essential notifications. Check messages on your schedule.' },
  { emoji: '🎯', title: 'Intentional Use', body: 'Set a specific goal before opening YouTube or social media.' },
  { emoji: '⏰', title: 'Time Blocking', body: 'Allocate fixed time slots for study and entertainment, then stick to them.' },
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
        <div class="tip-emoji">${t.emoji}</div>
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
  loadDashboard();
  // Auto-refresh every 5 minutes
  setInterval(loadDashboard, 5 * 60 * 1000);

  // Request notification permission if not yet decided
  if ('Notification' in window && Notification.permission === 'default') {
    document.getElementById('notifBanner') &&
      (document.getElementById('notifBanner').style.display = 'flex');
  }
});

// ════════════════════════════════════════════════════════════
// TIME LIMITS
// ════════════════════════════════════════════════════════════

// Track which apps we've already notified today so we don't spam
const notifiedToday = new Set();

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
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.1); // C6
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.error("Audio playback failed", e);
  }
}

// ── Send a push notification ────────────────────────────────────
function sendNotification(appName, usedMin, limitMin) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (notifiedToday.has(appName.toLowerCase())) return;  // already notified
  notifiedToday.add(appName.toLowerCase());

  playNotificationSound();

  new Notification(`⏰ Time limit reached: ${appName}`, {
    body: `You’ve used ${fmtMin(usedMin)} of ${fmtMin(limitMin)} today. Take a break! 🌿`,
    icon: '/static/icon.png',
    badge: '/static/icon.png',
    tag:  `limit-${appName}`,
  });
}

// ── Load & render limits tab ────────────────────────────────────
async function initLimits() {
  // Show notif banner if permission not yet decided
  const banner = document.getElementById('notifBanner');
  if (banner && 'Notification' in window && Notification.permission === 'default') {
    banner.style.display = 'flex';
  }
  await loadAndRenderLimits();
}

async function loadAndRenderLimits() {
  const [limitsRes, checkRes] = await Promise.all([
    fetch('/api/limits'),
    fetch('/api/limits/check'),
  ]);
  const limits = await limitsRes.json();
  const status = await checkRes.json();

  // Build a lookup: app_name (lower) -> status object
  const statusMap = {};
  status.forEach(s => { statusMap[s.app_name.toLowerCase()] = s; });

  renderLimits(limits, statusMap);
}

function renderLimits(limits, statusMap) {
  const list = document.getElementById('limitsList');
  if (!limits.length) {
    list.innerHTML = '<div class="empty-state"><span>⏱️</span><p>No limits set yet. Add one above!</p></div>';
    return;
  }

  list.innerHTML = limits.map(lim => {
    const key    = lim.app_name.toLowerCase();
    const s      = statusMap[key] || { used_minutes: 0, percent: 0, exceeded: false };
    const pct    = s.percent;
    const barCol = s.exceeded ? '#ff5252' : pct >= 80 ? '#ffd740' : 'var(--green-vivid)';
    const icon   = APP_ICONS[key] || '📱';

    return `
      <div class="limit-item ${s.exceeded ? 'limit-exceeded' : ''}" id="lim-${escHtml(lim.app_name)}">
        <div class="limit-item-header">
          <span class="limit-app-icon">${icon}</span>
          <span class="limit-app-name">${escHtml(lim.app_name)}</span>
          ${s.exceeded ? '<span class="limit-badge-over">⚠️ Over Limit</span>' : ''}
          <span class="limit-time-info">${fmtMin(s.used_minutes)} / ${fmtMin(lim.limit_minutes)}</span>
          <button class="limit-del-btn" onclick="deleteLimit('${escHtml(lim.app_name)}')" title="Remove limit">✕</button>
        </div>
        <div class="limit-bar-track">
          <div class="limit-bar-fill" style="width:${pct}%; background:${barCol}"></div>
        </div>
        <div class="limit-bar-labels">
          <span>${pct}% used</span>
          <span>${fmtMin(Math.max(0, lim.limit_minutes - s.used_minutes))} remaining</span>
        </div>
      </div>`;
  }).join('');
}

// ── App emoji icon map ─────────────────────────────────────────
const APP_ICONS = {
  youtube: '📺', instagram: '📸', netflix: '🎬', twitter: '🐦',
  tiktok: '🎵', gaming: '🎮', whatsapp: '💬', reddit: '👽',
  facebook: '👤', discord: '💬', spotify: '🎶', coding: '💻',
  reading: '📚', work: '💼', study: '📖',
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
    await loadAndRenderLimits();
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
  await loadAndRenderLimits();
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

