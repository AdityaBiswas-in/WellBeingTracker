import sys

filepath = r'c:\Users\adity\OneDrive\AdityaBiswas_Official\GitHub\WellBeingTracker\static\css\welcome.css'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

fix_css = """
/* ── Light Mode Text Adjustments ── */
[data-theme="light"] .credits-content p {
  /* In light mode, replace dark smudge with a white glow to stand out against dark particles */
  text-shadow: 0 1px 4px rgba(255, 255, 255, 0.9), 0 2px 10px rgba(255, 255, 255, 0.8);
}

[data-theme="light"] .welcome-sub {
  text-shadow: 0 1px 3px rgba(255, 255, 255, 0.9);
}

[data-theme="light"] .welcome-title {
  text-shadow: 0 2px 10px rgba(255, 255, 255, 0.8);
}
"""

if "Light Mode Text Adjustments" not in content:
    content += fix_css
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed light mode font shadow")
else:
    print("CSS already updated")
