"""Render assets/icon-180.png from the plugin's icon geometry (4x supersampled)."""
from PIL import Image, ImageDraw

S = 4                      # supersample factor
SIZE = 180
canvas = SIZE * S
scale = canvas / 64.0      # icon.svg is authored on a 64x64 grid


def p(x, y):
    return (x * scale, y * scale)


def w(v):
    return max(1, round(v * scale))


img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

d.rounded_rectangle(
    [p(4, 4), p(60, 60)],
    radius=14 * scale,
    fill=(47, 111, 237, 255),   # #2f6fed
)

white = (255, 255, 255, 255)
stroke = w(3.4)

for y in (24.5, 43.5):
    d.line([p(17, y), p(21, y + 4), p(28, y - 3)], fill=white, width=stroke, joint="curve")

for y in (24, 43):
    d.line([p(34, y), p(47, y)], fill=white, width=stroke)

# round the tips and joints the same way stroke-linecap="round" does
for y in (24.5, 43.5):
    for pt in (p(17, y), p(28, y - 3)):
        d.ellipse([pt[0] - stroke / 2, pt[1] - stroke / 2, pt[0] + stroke / 2, pt[1] + stroke / 2], fill=white)
    mid = p(21, y + 4)
    d.ellipse([mid[0] - stroke / 2, mid[1] - stroke / 2, mid[0] + stroke / 2, mid[1] + stroke / 2], fill=white)

for y in (24, 43):
    for x in (34, 47):
        pt = p(x, y)
        d.ellipse([pt[0] - stroke / 2, pt[1] - stroke / 2, pt[0] + stroke / 2, pt[1] + stroke / 2], fill=white)

out = img.resize((SIZE, SIZE), Image.LANCZOS)
out.save(r"F:\project\deepseek_workplace\dsh-todo\assets\icon-180.png", format="PNG", optimize=True)
print("written", out.size, out.mode)
