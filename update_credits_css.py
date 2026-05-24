import sys

filepath = r'c:\Users\adity\OneDrive\AdityaBiswas_Official\GitHub\WellBeingTracker\static\css\welcome.css'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the old welcome-about with the new credits container styles
old_style = """.welcome-about {
  font-size: 1.05rem;
  line-height: 1.6;
  color: var(--welcome-text);
  text-shadow: 0 2px 8px rgba(0,0,0,0.8);
  max-width: 480px;
  margin: 1.5rem auto 2rem auto;
  font-weight: 500;
  letter-spacing: 0.3px;
}"""

new_style = """/* ── Credits Animation ────────────────────────────────────────── */
.credits-container {
  width: 100%;
  max-width: 480px;
  height: 100px;
  margin: 1.5rem auto 2rem auto;
  position: relative;
  overflow: hidden;
  /* Fade out at top and bottom */
  mask-image: linear-gradient(to bottom, transparent, black 15%, black 85%, transparent);
  -webkit-mask-image: linear-gradient(to bottom, transparent, black 15%, black 85%, transparent);
}

.credits-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  animation: scrollCredits 25s linear infinite;
  padding-top: 100px; /* start below container */
  padding-bottom: 100px; /* buffer after last item */
}

.credits-content p {
  font-size: 1.05rem;
  line-height: 1.6;
  color: var(--welcome-text);
  text-shadow: 0 2px 8px rgba(0,0,0,0.8);
  font-weight: 500;
  letter-spacing: 0.3px;
  text-align: center;
}

@keyframes scrollCredits {
  0% { transform: translateY(0); }
  100% { transform: translateY(-100%); }
}

.credits-container:hover .credits-content {
  animation-play-state: paused;
}
"""

if old_style in content:
    content = content.replace(old_style, new_style)
else:
    content += "\n" + new_style

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated welcome.css")
