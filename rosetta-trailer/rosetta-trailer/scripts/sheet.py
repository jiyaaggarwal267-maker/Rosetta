"""Contact sheet of review stills: python scripts/sheet.py out/sheet.jpg f0100 f0180 ..."""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

out, names = sys.argv[1], sys.argv[2:]
cols = 2
w, h = 960, 540
rows = (len(names) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * h), "black")
draw = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    im = Image.open(Path("out/stills") / f"{n}.jpg").resize((w, h))
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(im, (x, y))
    draw.rectangle([x, y, x + 120, y + 30], fill="black")
    draw.text((x + 8, y + 8), n, fill="yellow")
sheet.save(out, quality=85)
print(out)
