/* ═══════════════════════════════════════════════════════════════
   Digital Well-Being Tracker  ·  app.js
   ═══════════════════════════════════════════════════════════════ */

// ── Namespaced localStorage for Multi-Account support ─────────
const userSpecificKeys = ['eyeTimerActive', 'eyeTimerEndTime', 'eyeTimerPaused', 'eyeTimerRemainingMs', 'habitChecks'];

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
    return isLight ? '#2e7d32' : '#00e676';
  },
  get entertainment() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return isLight ? '#d84315' : '#ff6e40';
  },
  get social() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return isLight ? '#0277bd' : '#40c4ff';
  },
  get work() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return isLight ? '#f57f17' : '#ffd740';
  },
  get other() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return isLight ? '#651fff' : '#b39ddb';
  }
};

// ── Theme Toggle ───────────────────────────────────────────────
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = newTheme === 'light' ? '🌙' : '☀️';

  // Force a re-render of current charts and particles to grab new colors
  loadDashboard();
  loadWeekly(currentWeekOffset);
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
let weeklyChartStyle   = 'bar'; // 'area', 'bar', 'trend'
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
    particles = Array.from({ length: 100 }, randomParticle);
  }

  function draw() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const rgb = isLight ? '0,162,255' : '0,230,118';

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
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (score >= 80) return isLight ? '#007acc' : '#00e676';
  if (score >= 60) return isLight ? '#00a2ff' : '#69f0ae';
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

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  fillEl.style.strokeDashoffset = offset;
  fillEl.style.stroke           = color;
  fillEl.style.filter           = isLight ? `drop-shadow(0 2px 4px rgba(0, 122, 204, 0.3))` : `drop-shadow(0 0 8px ${color})`;

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
  const gridColor = isLight ? 'rgba(0,162,255,.08)' : 'rgba(0,230,118,.06)';
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
      { label: 'Social',        key: 'social',        color: CAT_COLORS.social },
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
        ticks: { color: tickColor, callback: v => fmtMin(v) } 
      },
    };
  } else if (weeklyChartStyle === 'bar') {
    chartType = 'bar';
    datasets = [
      { label: 'Study',         key: 'study',         color: CAT_COLORS.study },
      { label: 'Entertainment', key: 'entertainment', color: CAT_COLORS.entertainment },
      { label: 'Social',        key: 'social',        color: CAT_COLORS.social },
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
        ticks: { color: tickColor, callback: v => fmtMin(v) } 
      },
    };
  } else if (weeklyChartStyle === 'trend') {
    chartType = 'bar'; // Root type is bar, line layers can override
    
    const scoreColorHex = isLight ? '#0070f3' : '#00e676';

    datasets = [
      {
        type: 'line',
        label: 'Digital Balance Score',
        data: data.map(d => d.total > 0 ? d.balance_score : null), // null so empty days don't fall to 0
        borderColor: scoreColorHex,
        borderWidth: 3,
        fill: false,
        tension: 0.35,
        pointRadius: pointRadius > 0 ? pointRadius + 1 : 3,
        pointHoverRadius: pointRadius > 0 ? pointRadius + 4 : 6,
        pointBackgroundColor: scoreColorHex,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        yAxisID: 'yScore',
        spanGaps: true, // draw smooth connection between active days
      },
      {
        type: 'bar',
        label: 'Total Screen Time',
        data: data.map(d => d.total),
        backgroundColor: isLight ? 'rgba(87, 121, 156, 0.15)' : 'rgba(165, 214, 167, 0.12)',
        borderColor: isLight ? 'rgba(87, 121, 156, 0.35)' : 'rgba(165, 214, 167, 0.25)',
        borderWidth: 1,
        borderRadius: 4,
        yAxisID: 'yTime',
      }
    ];

    scales = {
      x: { 
        grid: { color: gridColor }, 
        ticks: { 
          color: tickColor,
          maxTicksLimit: data.length > 30 ? 10 : (data.length > 7 ? 8 : undefined)
        } 
      },
      yScore: {
        type: 'linear',
        position: 'left',
        min: 0,
        max: 100,
        grid: { color: gridColor },
        ticks: { color: scoreColorHex, stepSize: 20 },
        title: { display: true, text: 'Wellbeing Score', color: scoreColorHex, font: { weight: 'bold', family: 'Space Grotesk' } }
      },
      yTime: {
        type: 'linear',
        position: 'right',
        grid: { drawOnChartArea: false }, // avoid duplicate horizontal lines
        ticks: { color: tickColor, callback: v => fmtMin(v) },
        title: { display: true, text: 'Screen Time', color: tickColor, font: { weight: 'bold', family: 'Space Grotesk' } }
      }
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
      { name: 'Social', key: 'social', emoji: '💬', color: 'var(--cat-social)' },
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
    }
  } catch (e) {
    console.error("Audio playback failed", e);
  }
}

function changeSoundStyle(style) {
  notificationSoundStyle = style;
  localStorage.setItem('sound_style', style);
  playNotificationSound(); // instantly preview the newly selected sound!
}

// ── Send a push notification ────────────────────────────────────
function sendNotification(appName, usedMin, limitMin) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (notifiedToday.has(appName.toLowerCase())) return;  // already notified
  notifiedToday.add(appName.toLowerCase());

  playNotificationSound();
  
  // Also show the pop-in instructor
  showInstructor(`You've reached your limit for ${appName}! Time to take a break. 🌿`, 8000);

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

// ══════════════════════════════════════════════════════════════
// POP-IN INSTRUCTOR
// ══════════════════════════════════════════════════════════════
const INSTRUCTOR_MESSAGES = [
  "Welcome! I'm here to help you maintain your WellBeingTracker! ✨",
  "Use the Dashboard to see your WellBeing Score. Aim for 80 or higher! 📈",
  "Don't forget to log your study and entertainment sessions. 📚",
  "The 20-20-20 rule is great for eye care. I'll remind you to take breaks! 👁️",
  "You can set Time Limits for any app. I'll pop up if you go over! ⏰",
  "Check out the Habits tab for some daily wellness tips! 🌿",
  "Having a diverse set of activities boosts your WellBeing Score. Try something new! 🎨",
];
let messageIndex = 0;

let instructorTimeout = null;

function showInstructor(message, duration = 6000) {
  const container = document.getElementById('instructor-container');
  const msgEl = document.getElementById('instructor-message');
  const bubble = document.getElementById('instructor-bubble');
  
  if (!container || !msgEl || !bubble) return;
  
  // If a specific message is provided, use it. Otherwise, cycle through the info messages.
  if (message) {
    msgEl.textContent = message;
  } else {
    msgEl.textContent = INSTRUCTOR_MESSAGES[messageIndex];
    messageIndex = (messageIndex + 1) % INSTRUCTOR_MESSAGES.length;
  }
  
  // Ensure the character stays visible
  container.classList.remove('instructor-hidden');
  container.classList.add('instructor-visible');
  
  // Show the bubble
  bubble.classList.add('bubble-visible');
  
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
  const gender   = document.getElementById('editGender').value;
  const avatar   = document.getElementById('editAvatar').files[0];
  
  if (!username || !email || !gender) {
    alert('Please fill in all mandatory fields, including gender.');
    return;
  }
  
  const formData = new FormData();
  formData.append('username', username);
  formData.append('email', email);
  formData.append('phone', phone);
  formData.append('bio', bio);
  formData.append('gender', gender);
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
      
      if (!previewImg) {
        // Replace initials with a new image element
        const initials = document.getElementById('previewInitials');
        if (initials) initials.remove();
        
        previewImg = document.createElement('img');
        previewImg.id = 'previewImg';
        previewImg.className = 'avatar-img';
        previewContainer.appendChild(previewImg);
      }
      
      previewImg.src = e.target.result;
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
  // Restore persistent eye timer state if active!
  restoreEyeTimer();

  // Initialize notification sound selection value
  const selector = document.getElementById('soundSelector');
  if (selector) {
    selector.value = notificationSoundStyle;
  }

  setTimeout(() => {
    showInstructor();
  }, 1000);

  const container = document.getElementById('instructor-container');
  if (container) {
    container.style.cursor = 'pointer';
    container.addEventListener('click', (e) => {
      // Prevent the global click listener from immediately catching this
      e.stopPropagation();
      showInstructor();
    });
  }

  // Hide the bubble if the user clicks anywhere else
  document.addEventListener('click', (e) => {
    if (container && !container.contains(e.target)) {
      const bubble = document.getElementById('instructor-bubble');
      if (bubble && bubble.classList.contains('bubble-visible')) {
        bubble.classList.remove('bubble-visible');
        if (instructorTimeout) clearTimeout(instructorTimeout);
      }
    }
  });
});
