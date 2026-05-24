import sys

filepath = r'c:\Users\adity\OneDrive\AdityaBiswas_Official\GitHub\WellBeingTracker\templates\welcome.html'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the dynamic colors and particles section
old_colors_section = """      // ── Dynamic Theme Colors ─────────────────────────────────────
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

      const colors = ['#00f260', '#00b046', '#9d4edd', '#72efdd', '#5a189a', '#e0b1cb'];

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
      }"""

new_colors_section = """      // ── Spawning Particles ────────────────────────────────────────
      const PARTICLE_COUNT = 200;
      const particles = [];

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const isSpark = Math.random() > 0.7;
        const depth = 0.1 + Math.random() * 2.4;
        
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          depth: depth,
          isSpark: isSpark,
          size: isSpark ? (0.5 + Math.random() * 1.5) : (3 + Math.random() * 20 * depth),
          vx: (Math.random() - 0.5) * (isSpark ? 1.0 : 0.4) * depth,
          vy: (Math.random() - 0.5) * (isSpark ? 1.0 : 0.4) * depth - (Math.random() * 0.3),
          color: '#ffffff', // Placeholder, updated in updateThemeColors
          opacity: isSpark ? (0.5 + Math.random() * 0.5) : (0.05 + Math.random() * 0.25)
        });
      }

      // ── Dynamic Theme Colors ─────────────────────────────────────
      let isDark = true;
      let currentColors = [];

      function updateThemeColors() {
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        isDark = (theme === 'dark');
        
        if (isDark) {
            // Midnight Plum & Vivid Green
            currentColors = ['#00f260', '#00b046', '#9d4edd', '#72efdd', '#5a189a', '#e0b1cb'];
        } else {
            // Light Blue & Ocean Blue
            currentColors = ['#0066cc', '#0088ff', '#004499', '#66aaff', '#99ccff', '#2e7d32'];
        }

        // Apply new colors to particles
        particles.forEach(p => {
          p.color = currentColors[Math.floor(Math.random() * currentColors.length)];
        });
      }

      updateThemeColors();
      const observer = new MutationObserver(() => updateThemeColors());
      observer.observe(document.documentElement, { attributes: true });"""

content = content.replace(old_colors_section, new_colors_section)

# Update light mode background gradient colors
content = content.replace("bgGrad.addColorStop(0, '#e0e7ff');", "bgGrad.addColorStop(0, '#e0f0ff');")
content = content.replace("bgGrad.addColorStop(1, '#f0f4f8');", "bgGrad.addColorStop(1, '#dbeafe');")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated light theme colors dynamically.")
