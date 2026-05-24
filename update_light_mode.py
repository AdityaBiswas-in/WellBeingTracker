import sys

filepath = r'c:\Users\adity\OneDrive\AdityaBiswas_Official\GitHub\WellBeingTracker\templates\welcome.html'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the blending mode for light theme so particles don't disappear into white
content = content.replace("ctx.globalCompositeOperation = 'screen';", "ctx.globalCompositeOperation = isDark ? 'screen' : 'source-over';")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated light theme blending mode.")
