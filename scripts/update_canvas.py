import sys

content = open(r'c:\Users\adity\OneDrive\AdityaBiswas_Official\GitHub\WellBeingTracker\templates\welcome.html', 'r', encoding='utf-8').read()

new_script = """    // ── Bokeh Particle Animation ──────
    (function initBokehCanvas() {
      const canvas = document.getElementById('welcomeCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { alpha: false }); 
      
      let width = window.innerWidth;
      let height = window.innerHeight;
      let dpr = 1;

      function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2); 
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
      }
      window.addEventListener('resize', resize);
      resize();

      // ── Dynamic Theme Colors ─────────────────────────────────────
      let isDark = true;
      function updateThemeColors() {
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        isDark = (theme === 'dark');
      }
      updateThemeColors();
      const observer = new MutationObserver(() => updateThemeColors());
      observer.observe(document.documentElement, { attributes: true });

      // ── Spawning Particles ────────────────────────────────────────
      const PARTICLE_COUNT = 200;
      const particles = [];

      const colors = ['#00e5ff', '#0099ff', '#ff7b00', '#ff5500', '#00d2ff', '#ff9933'];

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const isSpark = Math.random() > 0.7;
        const depth = 0.1 + Math.random() * 2.4;
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          depth: depth,
          isSpark: isSpark,
          size: isSpark ? (0.5 + Math.random() * 1.5) : (3 + Math.random() * 20 * depth),
          vx: (Math.random() - 0.5) * (isSpark ? 1.0 : 0.4) * depth,
          vy: (Math.random() - 0.5) * (isSpark ? 1.0 : 0.4) * depth - (Math.random() * 0.3),
          color: color,
          opacity: isSpark ? (0.5 + Math.random() * 0.5) : (0.05 + Math.random() * 0.25)
        });
      }

      // ── Interactive Mouse Parallax ───────────────────────────────
      let targetMouseX = 0, targetMouseY = 0;
      let mouseX = 0, mouseY = 0;

      document.addEventListener('mousemove', e => {
        if (isLeaving) return;
        targetMouseX = (e.clientX - width / 2) * 0.05;
        targetMouseY = (e.clientY - height / 2) * 0.05;
      });

      // ── Transition States ────────────────────────────────────────
      let isLeaving = false;
      let transitionTime = 0;

      const getStartedBtn = document.getElementById('getStartedBtn');
      if (getStartedBtn) {
        getStartedBtn.addEventListener('click', function (e) {
          e.preventDefault();
          if (isLeaving) return;
          isLeaving = true;
          document.body.classList.add('leaving');
          setTimeout(() => {
            window.location.href = getStartedBtn.getAttribute('href');
          }, 700);
        });
      }

      // ── Animation Loop ──────────────────────────────────────────
      let lastTime = 0;
      function animate(time) {
        requestAnimationFrame(animate);

        const dt = lastTime ? (time - lastTime) / 16.666 : 1; 
        lastTime = time;

        // Draw Bokeh Background Gradient
        const bgGrad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height));
        if (isDark) {
            bgGrad.addColorStop(0, '#102a43');
            bgGrad.addColorStop(1, '#061422');
        } else {
            bgGrad.addColorStop(0, '#336699');
            bgGrad.addColorStop(1, '#1a3b5c');
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        mouseX += (targetMouseX - mouseX) * 0.1 * dt;
        mouseY += (targetMouseY - mouseY) * 0.1 * dt;

        if (isLeaving) {
          transitionTime += 0.016 * dt; 
        }

        const warpSpeed = isLeaving ? Math.pow(transitionTime * 4, 3) : 0;

        ctx.globalCompositeOperation = 'screen';

        particles.forEach(p => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          
          if (isLeaving) {
            p.depth += warpSpeed * 0.05 * dt;
            if (!p.isSpark) p.size = 3 + Math.random() * 20 * p.depth;
            const dx = p.x - width / 2;
            const dy = p.y - height / 2;
            p.x += dx * warpSpeed * 0.02 * dt;
            p.y += dy * warpSpeed * 0.02 * dt;
          }

          if (!isLeaving) {
            if (p.x < -p.size * 2) p.x = width + p.size * 2;
            if (p.x > width + p.size * 2) p.x = -p.size * 2;
            if (p.y < -p.size * 2) p.y = height + p.size * 2;
            if (p.y > height + p.size * 2) p.y = -p.size * 2;
          }

          const px = p.x + mouseX * p.depth;
          const py = p.y + mouseY * p.depth;

          if (p.size < 0.5) return;
          if (px < -p.size * 2 || px > width + p.size * 2 || 
              py < -p.size * 2 || py > height + p.size * 2) return;

          ctx.save();
          ctx.translate(px, py);

          const opacity = isLeaving ? Math.max(0, p.opacity - transitionTime * 1.5) : p.opacity;
          
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          
          if (p.isSpark) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = opacity;
            ctx.fill();
          } else {
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
            const hex = p.color.replace('#', '');
            const r = parseInt(hex.substring(0,2), 16);
            const g = parseInt(hex.substring(2,4), 16);
            const b = parseInt(hex.substring(4,6), 16);

            grad.addColorStop(0, `rgba(${r},${g},${b},${opacity})`);
            grad.addColorStop(0.7, `rgba(${r},${g},${b},${opacity * 0.8})`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
            
            ctx.fillStyle = grad;
            ctx.fill();
          }

          ctx.restore();
        });
        
        ctx.globalCompositeOperation = 'source-over';
      }

      requestAnimationFrame(animate);
    })();"""

start_marker = "    // ── 3D Scene Animation (Robust 2D Canvas Implementation) ──────"
end_marker = "    })();"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx) + len(end_marker)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + new_script + content[end_idx:]
    open(r'c:\Users\adity\OneDrive\AdityaBiswas_Official\GitHub\WellBeingTracker\templates\welcome.html', 'w', encoding='utf-8').write(new_content)
    print("Successfully replaced.")
else:
    print("Could not find markers.")
