/**
 * Lightweight green particle animation for auth pages.
 * Targets #particleCanvas if present on the page.
 */
(function () {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  const COUNT   = 55;
  const COLOR   = '0, 230, 118';   // --green-vivid in RGB

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function Particle() {
    this.reset = function () {
      this.x    = rand(0, W);
      this.y    = rand(0, H);
      this.r    = rand(1, 3);
      this.vx   = rand(-0.35, 0.35);
      this.vy   = rand(-0.35, 0.35);
      this.life = rand(0.3, 1);
      this.decay = rand(0.001, 0.004);
    };
    this.reset();
  }

  for (let i = 0; i < COUNT; i++) {
    const p = new Particle();
    p.life = Math.random();  // stagger initial opacity
    particles.push(p);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;

      if (p.life <= 0 || p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
        p.reset();
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${COLOR}, ${p.life * 0.7})`;
      ctx.fill();
    });

    // Draw soft connecting lines between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          const alpha = (1 - dist / 120) * 0.12;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${COLOR}, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  draw();
})();
