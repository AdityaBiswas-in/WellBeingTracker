import sys

content = open(r'c:\Users\adity\OneDrive\AdityaBiswas_Official\GitHub\WellBeingTracker\templates\welcome.html', 'r', encoding='utf-8').read()

content = content.replace("const colors = ['#00e5ff', '#0099ff', '#ff7b00', '#ff5500', '#00d2ff', '#ff9933'];", "const colors = ['#00f260', '#00b046', '#9d4edd', '#72efdd', '#5a189a', '#e0b1cb'];")
content = content.replace("bgGrad.addColorStop(0, '#102a43');", "bgGrad.addColorStop(0, '#1c103f');")
content = content.replace("bgGrad.addColorStop(1, '#061422');", "bgGrad.addColorStop(1, '#0b0917');")
content = content.replace("bgGrad.addColorStop(0, '#336699');", "bgGrad.addColorStop(0, '#e0e7ff');")
content = content.replace("bgGrad.addColorStop(1, '#1a3b5c');", "bgGrad.addColorStop(1, '#f0f4f8');")

open(r'c:\Users\adity\OneDrive\AdityaBiswas_Official\GitHub\WellBeingTracker\templates\welcome.html', 'w', encoding='utf-8').write(content)
print("Updated colors.")
