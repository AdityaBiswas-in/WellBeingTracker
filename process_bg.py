# pyrefly: ignore [missing-import]
from PIL import Image

src_path = r"C:\Users\adity\.gemini\antigravity\brain\eb9041ed-da6b-4190-91b8-98e50a4380bd\instructor_magenta_bg_1778948944276.png"
dst_path = r"c:\Users\adity\OneDrive\AdityaBiswas_Official\GitHub\Wellbeing\static\instructor.png"

img = Image.open(src_path).convert('RGBA')
datas = img.getdata()

newData = []
for item in datas:
    r, g, b, a = item
    
    # Detect magenta-ish pixels (R and B significantly higher than G)
    if r > g + 30 and b > g + 30:
        if r > 180 and b > 180 and g < 100:
            # Solid background
            newData.append((255, 255, 255, 0))
        else:
            # Fringe pixel: desaturate the magenta by clipping R and B to G
            new_r = min(r, int(g * 1.2))
            new_b = min(b, int(g * 1.2))
            # Reduce alpha for edges
            magenta_intensity = (r - g) + (b - g)
            alpha = max(0, 255 - int(magenta_intensity * 1.5))
            newData.append((new_r, g, new_b, alpha))
    else:
        newData.append(item)

img.putdata(newData)
img.save(dst_path, "PNG")
print("Done cleaning edges!")
