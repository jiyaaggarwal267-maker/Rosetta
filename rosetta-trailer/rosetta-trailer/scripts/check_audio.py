"""Measures the soundtrack: loudness over time, the silence window, and whether impacts land on their frames."""
import json
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TL = json.loads((ROOT / "src/timeline.json").read_text())
with wave.open(str(ROOT / "public/audio/soundtrack.wav")) as w:
    sr, n = w.getframerate(), w.getnframes()
    x = np.frombuffer(w.readframes(n), np.int16).reshape(-1, 2).astype(float) / 32768
mono = x.mean(1)
print(f"duration {n / sr:.3f}s  peak {20*np.log10(np.abs(x).max()):.2f} dBFS  clipped samples {(np.abs(x) > 0.999).sum()}")
db = lambda a, b: 20 * np.log10(np.sqrt(np.mean(mono[int(a*sr):int(b*sr)] ** 2)) + 1e-9)
print(f"freeze silence 16.00-16.40s: {db(16.0, 16.4):.1f} dBFS")
for name, (a, b) in TL["scenes"].items():
    print(f"  {name:10s} {a/30:5.1f}-{b/30:5.1f}s  rms {db(a/30, b/30):6.1f} dBFS")
# Impacts: the loudest 50 ms block should be within ~60 ms after the visual frame.
for label, f in [("split", TL["s1"]["split"]), ("gap", TL["s2"]["line2"]), ("REVEAL", TL["s3"]["reveal"]), ("burst", TL["s4"]["burst"]), ("words1", TL["s4"]["words"][0]), ("beat1", TL["s6"]["beats"][0]), ("LOGO", TL["s7"]["logo"])]:
    t = f / 30
    seg = np.abs(mono[int((t - 0.2) * sr):int((t + 0.3) * sr)])
    k = np.argmax(np.convolve(seg, np.ones(240) / 240, "same"))
    print(f"  {label:7s} frame {f} ({t:.2f}s): peak at {t - 0.2 + k / sr:.3f}s  ({(k / sr - 0.2) * 1000:+.0f} ms)")
# Waveform overview image.
W, H = 1800, 300
img = Image.new("RGB", (W, H), "black")
d = ImageDraw.Draw(img)
step = len(mono) // W
for i in range(W):
    s = mono[i * step:(i + 1) * step]
    d.line([(i, H / 2 - s.max() * H / 2), (i, H / 2 - s.min() * H / 2)], fill=(139, 92, 246))
for name, (a, b) in TL["scenes"].items():
    xpos = a / 1800 * W
    d.line([(xpos, 0), (xpos, H)], fill=(34, 211, 238))
    d.text((xpos + 4, 4), name, fill="white")
img.save(ROOT / "out/waveform.png")
