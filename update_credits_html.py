import sys

filepath = r'c:\Users\adity\OneDrive\AdityaBiswas_Official\GitHub\WellBeingTracker\templates\welcome.html'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

old_text = """    <p class="welcome-about">
      Track your screen time, set healthy limits, and reclaim your focus. 
      WellBeingTracker helps you build a healthier relationship with your digital life through insightful analytics and gentle nudges.
    </p>"""

new_text = """    <div class="credits-container">
      <div class="credits-content">
        <p>Track your screen time, set healthy limits, and reclaim your focus.</p>
        <p>WellBeingTracker helps you build a healthier relationship with your digital life through insightful analytics and gentle nudges.</p>
        <p>Features include real-time usage tracking, productivity scoring, and customizable goals.</p>
        <p>Designed with privacy in mind. Your digital habits are analyzed locally.</p>
        <p>Join us to balance your digital diet and reclaim hours of your day.</p>
      </div>
    </div>"""

content = content.replace(old_text, new_text)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated welcome.html")
