"""Six 512 px film-grain tiles (luminance noise), cycled per frame by the Grain effect."""
from pathlib import Path

import numpy as np
from PIL import Image

out = Path(__file__).resolve().parent.parent / "public" / "grain"
out.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(2026)
for i in range(6):
    n = rng.normal(128, 46, (512, 512))
    # A touch of clumping so it reads as film, not digital noise.
    n = (n + np.roll(n, 1, 0) + np.roll(n, 1, 1)) / 3 * 1.35 - 45
    Image.fromarray(np.clip(n, 0, 255).astype(np.uint8), "L").save(out / f"grain{i}.png", optimize=True)
print("grain tiles ->", out)
