import sys

filepath = r'c:\Users\adity\OneDrive\AdityaBiswas_Official\GitHub\WellBeingTracker\static\css\auth.css'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

legacy_css = """

/* ── Legacy Support for Forgot/Reset Password Pages ── */
.auth-wrapper {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-surface);
  position: relative;
}

.auth-wrapper .auth-brand {
  width: 50%;
  height: 100%;
  position: relative;
  z-index: 1;
}

.auth-wrapper .auth-card-wrap {
  width: 50%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 10;
  padding: 2rem;
}
"""

if ".auth-wrapper" not in content:
    content += legacy_css
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Added auth-wrapper CSS")
else:
    print("CSS already contains auth-wrapper")
