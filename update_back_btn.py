import sys

filepath = r'c:\Users\adity\OneDrive\AdityaBiswas_Official\GitHub\WellBeingTracker\static\css\auth.css'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

btn_css = """
/* ── Floating Back Button ── */
.back-btn-floating {
  position: absolute;
  top: 1.5rem;
  left: 1.5rem;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-glass);
  cursor: pointer;
  padding: 0.65rem;
  border-radius: 50%;
  transition: all 0.2s;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.back-btn-floating:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  transform: translateX(-3px);
}

[data-theme="light"] .back-btn-floating {
  background: rgba(0, 0, 0, 0.03);
}

[data-theme="light"] .back-btn-floating:hover {
  background: rgba(0, 0, 0, 0.08);
}
"""

if ".back-btn-floating" not in content:
    content += btn_css
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Added back button CSS")
else:
    print("CSS already present")
