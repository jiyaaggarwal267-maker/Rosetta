"""
ROSETTA trailer soundtrack: every sound synthesised from scratch with NumPy.
No samples, no third-party audio: licence-clean and fully reproducible.

Reads src/timeline.json (the same file the picture uses), so every impact is
placed on the exact frame of its visual. Writes public/audio/soundtrack.wav
(48 kHz, 16-bit, stereo).

    python scripts/make_audio.py
"""
import json
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
TL = json.loads((ROOT / "src" / "timeline.json").read_text())
SR = 48_000
FPS = TL["fps"]
DUR = TL["frames"] / FPS
N = int(DUR * SR)
rng = np.random.default_rng(2026)

BEAT = 60 / TL["bpm"]  # 0.5 s


def sec(frame):
    return frame / FPS


# ------------------------------------------------------------------ #
# Buses: dry and a reverb send, stereo                                 #
# ------------------------------------------------------------------ #
dry = np.zeros((2, N))
wet = np.zeros((2, N))


def place(sig, t0, gain=1.0, pan=0.0, send=0.0, bus=None):
    """Mix a mono (n,) or stereo (2, n) signal at t0 seconds, equal-power pan."""
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.stack([sig * np.cos(a), sig * np.sin(a)])
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if i0 < 0:
        sig = sig[:, -i0:]
        i0 = 0
    n = min(sig.shape[1], N - i0)
    target = dry if bus is None else bus
    target[:, i0 : i0 + n] += sig[:, :n] * gain
    if send > 0:
        wet[:, i0 : i0 + n] += sig[:, :n] * gain * send


def mx(*xs):
    """Layer sounds of different lengths."""
    n = max(len(x) for x in xs)
    return sum(np.pad(x, (0, n - len(x))) for x in xs)


def tl(d):
    return np.arange(int(d * SR)) / SR


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ------------------------------------------------------------------ #
# Filters (FFT, zero-phase)                                            #
# ------------------------------------------------------------------ #
def _spec_filter(x, gain_fn):
    n = x.shape[-1]
    X = np.fft.rfft(x, axis=-1)
    f = np.fft.rfftfreq(n, 1 / SR)
    return np.fft.irfft(X * gain_fn(f), n=n, axis=-1)


def lowpass(x, fc, order=4):
    return _spec_filter(x, lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order)))


def highpass(x, fc, order=4):
    return _spec_filter(x, lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order)))


def bandpass(x, lo, hi):
    return highpass(lowpass(x, hi), lo)


def noise(d):
    return rng.standard_normal(int(d * SR))


def env_exp(d, k, attack=0.002):
    t = tl(d)
    e = np.exp(-t * k)
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return e * a


# ------------------------------------------------------------------ #
# Instruments                                                          #
# ------------------------------------------------------------------ #
def saw(f, d, harm=24, bright=0.0, detune=0.0, phase=0.0):
    """Additive band-limited saw; `bright` > 0 makes upper harmonics decay faster over time."""
    t = tl(d)
    out = np.zeros_like(t)
    for k in range(1, harm + 1):
        fk = f * k * (1 + detune)
        if fk > SR / 2.2:
            break
        a = 1 / k
        if bright > 0:
            a = a * np.exp(-t * k * bright)
        out += a * np.sin(2 * np.pi * fk * t + phase * k)
    return out


def sine_sweep(f0, f1, d, curve=2.0):
    t = tl(d)
    p = (t / d) ** curve
    f = f0 * (f1 / f0) ** p
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def kick(d=0.6, f_lo=45, f_hi=150, k=30, drive=1.4):
    t = tl(d)
    f = f_lo + (f_hi - f_lo) * np.exp(-t * k)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
    click = highpass(noise(d), 2000) * np.exp(-t * 300) * 0.3
    return np.tanh((s + click) * drive)


def snare(d=0.35):
    t = tl(d)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 28)
    n = bandpass(noise(d), 900, 9000) * np.exp(-t * 18)
    return body * 0.5 + n * 0.8


def hat(d=0.08, k=70):
    return highpass(noise(d), 7000) * np.exp(-tl(d) * k)


def tom(f=90, d=0.8):
    t = tl(d)
    ff = f * (1 + 0.6 * np.exp(-t * 18))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t * 5)


def ping(f, d=0.6, k=7, h=0.25):
    t = tl(d)
    return (np.sin(2 * np.pi * f * t) + h * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3.01 * f * t)) * env_exp(d, k, 0.003)


def metal(f, d=3.0, k=1.4):
    """Inharmonic metallic resonance (struck plate)."""
    t = tl(d)
    out = np.zeros_like(t)
    for r, a in [(1, 1), (2.756, 0.6), (5.404, 0.4), (8.933, 0.25), (13.34, 0.12)]:
        out += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * k * (1 + r * 0.25))
    return out


def keytap(vel=1.0):
    d = 0.06
    t = tl(d)
    n = bandpass(noise(d), 1500, 9000) * np.exp(-t * 160)
    body = np.sin(2 * np.pi * (1800 + rng.uniform(-200, 200)) * t) * np.exp(-t * 120) * 0.4
    thock = np.sin(2 * np.pi * 180 * t) * np.exp(-t * 70) * 0.6
    return (n + body + thock) * vel


def whoosh(d=1.2, peak=0.6, lo=300, hi=6000, pan_from=-0.8, pan_to=0.8):
    """Air moving past: a swelling, brightening band of noise that pans across."""
    n = noise(d)
    dark = lowpass(n, lo)
    bright = bandpass(n, lo, hi)
    t = tl(d)
    p = t / d
    shape = np.where(p < peak, (p / peak) ** 2.2, ((1 - p) / (1 - peak)) ** 1.6)
    sig = (dark * (1 - shape) + bright * shape) * shape
    pan = pan_from + (pan_to - pan_from) * p
    a = (pan + 1) * np.pi / 4
    return np.stack([sig * np.cos(a), sig * np.sin(a)])


def riser(d, f0=110, f1=880, noise_amt=0.6):
    """Rising tension: octave-stacked glides plus brightening noise, ending at full energy."""
    t = tl(d)
    p = t / d
    tones = sum(sine_sweep(f0 * m, f1 * m, d, 1.6) * w for m, w in [(0.5, 0.5), (1, 1), (2, 0.5), (3, 0.2)])
    n = noise(d)
    nz = lowpass(n, 600) * (1 - p) + highpass(n, 1500) * p
    return (tones * 0.35 + nz * noise_amt) * p**2.4


def reverse_swell(d=1.6, fc=2500):
    """A reverb tail played backwards: rises into the hit."""
    t = tl(d)
    tail = lowpass(noise(d), fc) * np.exp(-t * 3.2)
    return tail[::-1]


def impact(d=4.0, sub=(55, 28), weight=1.0):
    """Cinematic hit: sub drop, low thump, noise crack, metallic ring."""
    t = tl(d)
    f = sub[1] + (sub[0] - sub[1]) * np.exp(-t * 2.5)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 0.9)
    thump = kick(min(d, 1.2), 40, 120, 20, 2.0)
    thump = np.pad(thump, (0, len(t) - len(thump)))
    crack = lowpass(noise(d), 3500) * np.exp(-t * 9)
    ring = metal(130, d, 1.1) * 0.25
    return np.tanh((s * 1.1 + thump * 0.8 + crack * 0.6 * weight + ring) * 1.3)


def braaam(root=26, d=5.0, voicing=(0, 12, 19, 24), bright=0.05):
    """The trailer horn: a stack of brassy saws that growl then darken, with a sub underneath."""
    t = tl(d)
    out = np.zeros_like(t)
    for i, iv in enumerate(voicing):
        f = midi(root + iv)
        for det in (-0.004, 0.0, 0.0045):
            out += saw(f, d, harm=36, bright=bright + 0.01 * i, detune=det, phase=rng.uniform(0, 6)) * (1.0 - 0.15 * i)
    att = np.clip(t / 0.06, 0, 1)
    rel = np.exp(-t * 0.55)
    out = np.tanh(out * 0.28) * att * rel
    sub = np.sin(2 * np.pi * midi(root) * t) * np.exp(-t * 0.6) * att
    return out + sub * 0.6


def pad(notes, d, attack=0.8, release=1.2, cutoff=1800, width=0.006):
    """Detuned saw-stack pad, slow attack, stereo (each side detuned differently)."""
    sides = []
    for side in (-1, 1):
        s = np.zeros(int(d * SR))
        for m in notes:
            for det in (-width, width * 0.4 * side, width * side):
                s += saw(midi(m), d, harm=14, detune=det, phase=rng.uniform(0, 6))
        sides.append(lowpass(s, cutoff))
    t = tl(d)
    e = np.clip(t / attack, 0, 1) * np.clip((d - t) / release, 0, 1)
    return np.stack(sides) * e * 0.06


def pluck(m, d=0.3, k=9, harm=10):
    t = tl(d)
    out = np.zeros_like(t)
    for h in range(1, harm + 1):
        out += np.sin(2 * np.pi * midi(m) * h * t) * np.exp(-t * k * (1 + 0.5 * h)) / h
    return out * np.clip(t / 0.002, 0, 1)


def glitch(d=0.18):
    hold = max(2, int(rng.integers(30, 120)))
    raw = rng.standard_normal(int(d * SR) // hold + 1)
    s = np.repeat(raw, hold)[: int(d * SR)]
    sq = np.sign(np.sin(2 * np.pi * rng.uniform(60, 140) * tl(d)))
    chop = (np.sin(2 * np.pi * rng.uniform(18, 40) * tl(d)) > 0).astype(float)
    return np.round((s * 0.6 + sq * 0.4) * chop * 6) / 6 * np.exp(-tl(d) * 6)


def blips(d, rate=28, f_lo=900, f_hi=3200):
    """Data transmission: a rapid stream of tiny tones."""
    out = np.zeros(int(d * SR))
    k = int(d * rate)
    for _ in range(k):
        i = int(rng.uniform(0, d - 0.03) * SR)
        b = ping(rng.uniform(f_lo, f_hi), 0.03, 120, 0.0) * rng.uniform(0.3, 1)
        out[i : i + len(b)] += b[: len(out) - i]
    return out


# ------------------------------------------------------------------ #
# SCENE 1 — THE SIGNAL (0–8 s)                                         #
# ------------------------------------------------------------------ #
s1 = TL["s1"]
d1 = 16.0
t = tl(d1)
drone = (
    np.sin(2 * np.pi * 36.71 * t) * 0.7
    + np.sin(2 * np.pi * 36.95 * t) * 0.5
    + np.sin(2 * np.pi * 55.0 * t) * 0.35
    + np.sin(2 * np.pi * 73.42 * t) * 0.15 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * t))
)
air = lowpass(noise(d1), 260) * 0.5
drone_env = np.clip(t / 6.5, 0, 1) ** 1.6
place((drone * 0.32 + air * 0.12) * drone_env, 0.0, 0.9)

# Distant electronic ticking, every half-second, very far away.
for i in range(int(1.0 / 0.5), int(7.6 / 0.5)):
    place(highpass(ping(3200, 0.04, 140, 0), 1500), i * 0.5, 0.06, pan=-0.4 + 0.8 * (i % 2), send=0.6)
# A subtle electrical pulse as the cursor wakes.
place(bandpass(noise(0.4), 80, 1200) * env_exp(0.4, 9) * np.sin(2 * np.pi * 50 * tl(0.4)), sec(s1["cursor"]), 0.18, send=0.4)
# Keystrokes.
for i, k in enumerate(s1["keys"]):
    place(keytap(rng.uniform(0.7, 1.0)), sec(k), 0.42, pan=rng.uniform(-0.15, 0.15), send=0.12)
place(mx(keytap(1.2), kick(0.15, 70, 200, 60) * 0.3), sec(s1["enter"]), 0.55, send=0.2)
# Terminal execute: a tiny rising confirmation.
place(mx(ping(1200, 0.1, 40), np.pad(ping(1800, 0.12, 40), (int(0.05 * SR), 0))), sec(s1["enter"]) + 0.06, 0.12, send=0.3)
# The pulse travelling through the network.
pd = sec(s1["pulse"][1] - s1["pulse"][0])
place(sine_sweep(180, 720, pd, 1.4) * np.linspace(0.2, 1, int(pd * SR)) * 0.25 + blips(pd, 40) * 0.3, sec(s1["pulse"][0]), 0.5, send=0.3)
# THE SPLIT: a powerful low hit.
place(impact(4.5, (62, 30)), sec(s1["split"]), 0.95, send=0.55)
place(metal(98, 3.0, 1.0), sec(s1["split"]), 0.18, pan=0.3, send=0.7)
# The two lines: soft low thuds.
place(tom(70, 1.2), sec(s1["line1"]), 0.45, send=0.4)
place(tom(62, 1.4) * 0.8, sec(s1["line2"]), 0.4, send=0.4)
# Impact zoom into the next scene.
place(riser(sec(s1["zoom"] - 196), 90, 500, 0.4), sec(196), 0.35)
place(whoosh(0.9, 0.75, 200, 7000, 0.5, -0.5), sec(s1["zoom"]) - 0.25, 0.7, send=0.3)
place(impact(2.0, (70, 35), 0.6), sec(240), 0.7, send=0.4)

# ------------------------------------------------------------------ #
# SCENE 2 — THE BREAKDOWN (8–18 s)                                     #
# ------------------------------------------------------------------ #
s2 = TL["s2"]
place(mx(kick(0.4, 60, 160, 40) * 0.6, ping(420, 0.3, 12) * 0.2), sec(s2["commit"]), 0.5, send=0.2)
for i, at in enumerate(s2["panels"]):
    hitsig = mx(kick(0.9, 42, 140, 28, 2.0), snare(0.5) * 0.7, metal(180 + 40 * i, 1.6, 2.2) * 0.2)
    place(hitsig, sec(at), 0.78, pan=[-0.5, 0.5, 0.0][i], send=0.5)

# Rhythmic tension: low pulse on every beat, ticking eighths that thicken.
t0 = sec(s2["panels"][0])
t_end = sec(s2["freeze"])
b = t0
while b < t_end - 0.01:
    place(tom(55, 0.5) * 0.7, b, 0.4, send=0.25)
    if b > sec(s2["tangle"][0]):
        for sub in (0.25,):
            place(hat(0.05), b + sub, 0.12, pan=0.4)
    if b > sec(410):
        for sub in (0.125, 0.375):
            place(hat(0.04, 90), b + sub, 0.08, pan=-0.4)
    b += BEAT
# Ostinato: a dark low D pulsing in eighths.
b = sec(s2["tangle"][0])
while b < t_end - 0.01:
    place(lowpass(saw(midi(38), 0.22, 12), 900) * env_exp(0.22, 10), b, 0.22)
    b += BEAT / 2
# Glitches on the flashes.
for at in s2["flashes"]:
    place(glitch(0.22), sec(at), 0.35, pan=rng.uniform(-0.6, 0.6))
    place(kick(0.3, 50, 140, 35) * 0.5, sec(at), 0.35)
# The aggressive riser, cut dead at the freeze.
rd = sec(s2["riser"][1] - s2["riser"][0])
place(riser(rd, 80, 1400, 0.9) * 0.9 + riser(rd, 55, 330, 0.0) * 0.6, sec(s2["riser"][0]), 0.75)
# "THE PROBLEM ISN'T CODE." — a quiet, cold tone out of the silence.
place(lowpass(saw(midi(50), 1.0, 8), 600) * env_exp(1.0, 2.5, 0.05), sec(s2["line1"]), 0.12, send=0.6)
# "IT'S THE GAP." — a deep bass impact, then silence.
place(impact(3.0, (48, 24), 0.9), sec(s2["line2"]), 1.0, send=0.5)

# ------------------------------------------------------------------ #
# SCENE 3 — THE REVEAL (18–28 s)                                       #
# ------------------------------------------------------------------ #
s3 = TL["s3"]
# The point of light: a single far shimmer.
place(ping(midi(86), 2.5, 1.8, 0.1) + ping(midi(93), 2.5, 2.2, 0.1) * 0.5, sec(s3["point"]), 0.10, send=0.8)
# The network grows: rising drone, metallic swell.
gd = sec(s3["reveal"] - s3["expand"][0])
t = tl(gd)
grow = (np.sin(2 * np.pi * 36.71 * t) * 0.6 + np.sin(2 * np.pi * 73.42 * t) * 0.3) * (t / gd) ** 1.5
place(grow, sec(s3["expand"][0]), 0.35)
place(pad([50, 57, 62], gd + 0.2, attack=gd * 0.8, release=0.2, cutoff=900), sec(s3["expand"][0]), 1.3)
place(metal(73.42, gd, 0.1) * (t / gd) ** 2 * 0.3, sec(s3["expand"][0]), 0.35, send=0.5)
# Converging lines: two crossing whooshes.
place(whoosh(1.6, 0.8, 200, 5000, -0.9, 0.0), sec(s3["converge"][0]), 0.35, send=0.4)
place(whoosh(1.6, 0.8, 200, 5000, 0.9, 0.0), sec(s3["converge"][0]) + 0.2, 0.35, send=0.4)
# Energy pulse.
place(mx(sine_sweep(120, 1600, 0.35, 1.0) * env_exp(0.35, 6) * 0.4, highpass(noise(0.3), 2000) * env_exp(0.3, 12) * 0.3), sec(s3["pulse"]), 0.5, send=0.5)
# Reverse swell into the downbeat, ending exactly on it.
sw = reverse_swell(1.5)
place(sw, sec(s3["reveal"]) - len(sw) / SR, 0.55, send=0.3)
place(riser(1.2, 200, 1600, 0.3) * 0.5, sec(s3["reveal"]) - 1.2, 0.4)
# THE BRAAAM.
REVEAL = sec(s3["reveal"])
place(braaam(26, 6.0), REVEAL, 0.62, send=0.5)
place(impact(5.5, (50, 26), 1.0), REVEAL, 0.85, send=0.5)
place(metal(73.42, 5.0, 0.6), REVEAL, 0.22, pan=-0.3, send=0.8)
place(metal(110, 5.0, 0.7), REVEAL, 0.16, pan=0.3, send=0.8)
# Subtitles: soft tonal accents.
place(ping(midi(74), 1.5, 2.5), sec(s3["sub1"]), 0.08, send=0.8)
place(ping(midi(81), 1.5, 2.5), sec(s3["sub2"]), 0.07, send=0.8)

# ------------------------------------------------------------------ #
# THE SCORE (from the reveal): 120 bpm, D minor → D major             #
# ------------------------------------------------------------------ #
# (start s, chord notes) — two seconds (one bar) each.
CHORDS = [
    (22, [50, 57, 62, 65]),  # Dm
    (24, [46, 53, 58, 62]),  # Bb
    (26, [53, 57, 60, 65]),  # F
    (28, [50, 57, 62, 65]),  # Dm
    (30, [46, 53, 58, 62]),  # Bb
    (32, [53, 57, 60, 65]),  # F
    (34, [48, 55, 60, 64]),  # C
    (36, [50, 57, 62, 65]),  # Dm
    (38, [46, 53, 58, 62]),  # Bb
    (40, [50, 57, 62, 65]),  # Dm
    (42, [46, 53, 58, 62]),  # Bb
    (44, [43, 50, 55, 58]),  # Gm
    (46, [45, 52, 57, 61]),  # A
    (48, [50, 57, 62, 65]),  # Dm
    (50, [46, 53, 58, 62]),  # Bb
    (52, [48, 55, 60, 64]),  # C
    (54, [45, 52, 57, 61]),  # A (dominant, climax)
]
for start, notes in CHORDS:
    place(pad(notes, 2.4, attack=0.35, release=0.6, cutoff=1400 if start < 28 else 2400), start, 1.0, send=0.5)
# Bass: root on every beat from 28 s, octave pumping.
for start, notes in CHORDS:
    if start < 28:
        continue
    for i in range(4):
        b = start + i * BEAT
        place(lowpass(saw(midi(notes[0] - 12), 0.45, 16), 500) * env_exp(0.45, 5), b, 0.30)
        place(lowpass(saw(midi(notes[0]), 0.2, 10), 900) * env_exp(0.2, 12), b + BEAT / 2, 0.14)

# 28–40 s: driving electronic-orchestral rhythm.
for i in range(int((40 - 28) / BEAT)):
    b = 28 + i * BEAT
    place(kick(0.5), b, 0.55)
    if i % 2 == 1 and b >= 30:
        place(snare(0.35), b, 0.32, send=0.35)
    for s in (0.25,):
        place(hat(0.05), b + s, 0.10, pan=0.35)
# A 16th-note pluck ostinato on chord tones.
for start, notes in CHORDS:
    if not (28 <= start < 40):
        continue
    pattern = [notes[1] + 12, notes[2] + 12, notes[3] + 12, notes[2] + 12]
    for j in range(16):
        place(pluck(pattern[j % 4], 0.24, 11), start + j * BEAT / 4, 0.11 if j % 4 else 0.15, pan=0.25 if j % 2 else -0.25, send=0.25)

s4 = TL["s4"]
place(whoosh(0.8, 0.5, 300, 6000, -0.8, 0.2), sec(s4["card"]) - 0.1, 0.45, send=0.3)
n_keys = 22
for i in range(n_keys):
    place(keytap(rng.uniform(0.5, 0.8)), sec(s4["typing"][0]) + i * sec(s4["typing"][1] - s4["typing"][0]) / n_keys, 0.22)
place(mx(kick(0.2, 90, 240, 50) * 0.5, ping(900, 0.12, 30) * 0.3), sec(s4["press"]), 0.4)
for i in range(7):
    place(ping(1600 + 120 * i, 0.06, 60, 0), sec(s4["diff"][0]) + i * sec(s4["diff"][1] - s4["diff"][0]) / 7, 0.07, pan=-0.3)
ld = sec(s4["link"][1] - s4["link"][0])
place(blips(ld, 50, 1200, 3600) * 0.5 + sine_sweep(300, 900, ld, 1.2) * 0.1, sec(s4["link"][0]), 0.35, pan=0.2, send=0.3)
for i, at in enumerate(s4["labels"]):
    place(mx(kick(0.15, 120, 400, 80) * 0.3, ping(midi(74 + i * 5), 0.4, 9) * 0.5), sec(at), 0.30, send=0.4)
# The burst into six: a harmonic swell.
place(reverse_swell(0.8, 4000), sec(s4["burst"]) - 0.8, 0.35)
place(impact(2.5, (80, 40), 0.4), sec(s4["burst"]), 0.5, send=0.5)
for i, at in enumerate(s4["cards"]):
    place(ping(midi([74, 77, 81, 86, 89, 93][i]), 0.6, 7), sec(at), 0.12, pan=-0.6 + 0.24 * i, send=0.5)
# ONE CHANGE. SIX PERSPECTIVES. ZERO REPETITION.
for i, at in enumerate(s4["words"]):
    place(mx(kick(0.9, 40, 130, 24, 2.0), snare(0.4) * 0.6), sec(at), 0.8, send=0.5)
    place(braaam([38, 34, 41][i], 1.6, (0, 12, 19), 0.12) * np.exp(-tl(1.6) * 2.0), sec(at), 0.30, send=0.4)
place(whoosh(1.1, 0.8, 200, 8000, 0.0, 0.0), sec(s4["dive"][0]), 0.6, send=0.3)

# 40–50 s: sophisticated futuristic arpeggios, lighter drums, an echo.
arp = np.zeros((2, int(10.5 * SR)))
for start, notes in CHORDS:
    if not (40 <= start < 50):
        continue
    seq = [notes[0] + 24, notes[1] + 12, notes[2] + 12, notes[3] + 12, notes[1] + 24, notes[3] + 12, notes[2] + 12, notes[1] + 12]
    for j in range(16):
        note = ping(midi(seq[j % 8]), 0.3, 12, 0.35)
        i0 = int((start - 40 + j * BEAT / 4) * SR)
        arp[0, i0 : i0 + len(note)] += note * (0.8 if j % 2 else 0.5)
        arp[1, i0 : i0 + len(note)] += note * (0.5 if j % 2 else 0.8)
# Ping-pong delay at a dotted eighth.
dl = int(0.375 * SR)
echo = np.zeros_like(arp)
for k, g in [(1, 0.45), (2, 0.25), (3, 0.12)]:
    echo[(k % 2), k * dl :] += arp[(k + 1) % 2, : -k * dl] * g
place(arp + echo, 40, 0.16, send=0.3)
for i in range(int(10 / BEAT)):
    b = 40 + i * BEAT
    place(kick(0.4, 45, 130) * 0.7, b, 0.40)
    place(hat(0.04, 90), b + BEAT / 2, 0.08, pan=0.3)

s5 = TL["s5"]
place(whoosh(1.0, 0.4, 300, 7000, 0.6, -0.4), sec(s5["panel"]) - 0.2, 0.45, send=0.3)
md = sec(s5["morph"][1] - s5["morph"][0])
place(sine_sweep(400, 1200, md, 1.0) * np.hanning(int(md * SR)) * 0.15 + blips(md, 24) * 0.3, sec(s5["morph"][0]), 0.35, send=0.4)
place(mx(kick(0.6, 50, 150, 30) * 0.7, ping(midi(81), 1.2, 3) * 0.3), sec(s5["words1"]), 0.6, send=0.5)
for i in range(5):
    place(ping(midi(86), 0.2, 25, 0), sec(s5["trace"][0]) + i * sec(s5["trace"][1] - s5["trace"][0]) / 5, 0.06, pan=-0.5 + 0.25 * i, send=0.4)
place(ping(midi(79), 0.4, 12) + np.pad(ping(midi(86), 0.4, 12), (int(0.06 * SR), 0))[: int(0.4 * SR)], sec(s5["ask"]), 0.14, pan=-0.4, send=0.4)
t1d = sec(s5["travel1"][1] - s5["travel1"][0])
place(sine_sweep(500, 1500, t1d, 1.1) * np.hanning(int(t1d * SR)) * 0.18 + blips(t1d, 40) * 0.3, sec(s5["travel1"][0]), 0.40, send=0.4)
place(ping(midi(84), 0.3, 18), sec(s5["tech"]), 0.12, pan=0.4, send=0.4)
rk = 26
for i in range(rk):
    place(keytap(rng.uniform(0.4, 0.7)), sec(s5["reply"][0]) + i * sec(s5["reply"][1] - s5["reply"][0]) / rk, 0.16, pan=0.4)
t2d = sec(s5["travel2"][1] - s5["travel2"][0])
place(sine_sweep(1500, 600, t2d, 0.9) * np.hanning(int(t2d * SR)) * 0.18 + blips(t2d, 40) * 0.3, sec(s5["travel2"][0]), 0.40, send=0.4)
# The confirmation chime: the answer has arrived, in the manager's words.
chime = ping(midi(81), 1.4, 3.5) + np.pad(ping(midi(88), 1.4, 3.5), (int(0.09 * SR), 0))[: int(1.4 * SR)]
place(chime, sec(s5["answer"]), 0.18, pan=-0.3, send=0.6)
place(mx(kick(0.8, 42, 140, 26, 1.8), snare(0.4) * 0.5), sec(s5["words2"]), 0.7, send=0.5)

# 50–56 s: climactic acceleration.
s6 = TL["s6"]
for i in range(int(6 / (BEAT / 2))):
    b = 50 + i * BEAT / 2
    place(kick(0.35), b, 0.48 if i % 2 == 0 else 0.30)
    place(hat(0.04), b + BEAT / 4, 0.09, pan=0.35)
    if i % 4 == 2:
        place(snare(0.3), b, 0.34, send=0.35)
for i in range(16):  # tom roll building into the finale
    place(tom(110 - i * 2, 0.4), 54.0 + i * BEAT / 4, 0.18 + i * 0.012, pan=-0.5 + i / 16)
for i, at in enumerate(s6["beats"]):
    place(impact(2.6, (60, 32), 0.7), sec(at), 0.75, send=0.5)
    place(braaam([34, 36, 33][i], 2.0, (0, 12, 19, 24), 0.08) * np.exp(-tl(2.0) * 1.3), sec(at), 0.36, send=0.4)
    place(highpass(noise(1.5), 4000) * env_exp(1.5, 2.5, 0.005), sec(at), 0.12, send=0.5)  # crash
place(riser(sec(T6 := TL["scenes"]["impact"][1]) - sec(s6["lift"]), 150, 2400, 0.8), sec(s6["lift"]), 0.6)

# 56–60 s: the heroic resolution in D major.
s7 = TL["s7"]
cd = sec(s7["converge"][1] - s7["converge"][0])
place(reverse_swell(cd, 5000) * 1.2, sec(s7["converge"][0]), 0.6)
place(whoosh(cd, 0.95, 200, 8000, -0.6, 0.6), sec(s7["converge"][0]), 0.45)
LOGO = sec(s7["logo"])
place(braaam(26, 3.2, (0, 12, 16, 19, 24), 0.035), LOGO, 0.62, send=0.55)  # D major: D, D, F#, A, D
place(impact(3.2, (55, 27), 0.9), LOGO, 0.9, send=0.5)
place(metal(146.8, 3.0, 0.8), LOGO, 0.2, send=0.8)
place(pad([50, 54, 57, 62, 66], 3.1, attack=0.05, release=1.6, cutoff=3200), LOGO, 1.4, send=0.6)
place(highpass(noise(3.0), 3500) * env_exp(3.0, 1.6, 0.005), LOGO, 0.14, send=0.6)  # cymbal swell tail
place(ping(midi(78), 1.2, 3), sec(s7["line1"]), 0.08, send=0.7)
place(ping(midi(81), 1.2, 3), sec(s7["line2"]), 0.08, send=0.7)
shimmer = sum(ping(midi(m), 1.6, 2.2, 0.1) for m in (86, 90, 93, 98)) * 0.4
place(shimmer, sec(s7["sweep"]), 0.12, send=0.8)

# ------------------------------------------------------------------ #
# Reverb, silences, master                                             #
# ------------------------------------------------------------------ #
ir_d = 3.2
ir_t = tl(ir_d)
ir = np.stack([lowpass(noise(ir_d), 6000) * np.exp(-ir_t / 0.75), lowpass(noise(ir_d), 6000) * np.exp(-ir_t / 0.8)])
ir[:, : int(0.012 * SR)] = 0  # pre-delay
ir /= np.sqrt(np.sum(ir**2, axis=1, keepdims=True))
size = 1 << int(np.ceil(np.log2(N + ir.shape[1])))
W = np.fft.rfft(wet, size, axis=1)
R = np.fft.rfft(ir, size, axis=1)
reverb = np.fft.irfft(W * R, size, axis=1)[:, :N] * 0.55
mix = dry + reverb


def fade_mask(t0, t1, level=0.0, ramp=0.006):
    """Multiply the mix between t0 and t1 down to `level`, with tiny ramps."""
    m = np.ones(N)
    a, b = int(t0 * SR), int(t1 * SR)
    r = int(ramp * SR)
    m[a:b] = level
    m[max(0, a - r) : a] = np.linspace(1, level, a - max(0, a - r))
    m[b : b + r] = np.linspace(level, 1, min(r, N - b))
    return m


# 0:16 — total silence for 0.4 s (the freeze), as the brief demands.
mix *= fade_mask(sec(s2["freeze"]), sec(s2["silenceEnd"]), 0.0, 0.004)
# After "IT'S THE GAP." the tail sinks into near-silence before the point of light.
m = np.ones(N)
a, b = int(sec(s2["out"]) * SR), int(sec(s3["point"]) * SR)
m[a:b] = np.linspace(1, 0.08, b - a)
m[b : b + int(1.2 * SR)] = np.linspace(0.08, 1, int(1.2 * SR))
mix *= m
# Final fade to black at exactly 60 s.
tail = np.ones(N)
fa = int(sec(s7["fade"][0]) * SR)
tail[fa:] = np.linspace(1, 0, N - fa) ** 1.5
mix *= tail

# Gentle low-end tidy and a soft-knee limiter.
mix = highpass(mix, 22, 2)
peak = np.max(np.abs(mix))
mix = mix / peak * 1.25
mix = np.tanh(mix) / np.tanh(1.25)
mix *= 10 ** (-1.0 / 20)  # −1 dBFS ceiling
mix[:, -int(0.02 * SR) :] *= np.linspace(1, 0, int(0.02 * SR))

out = ROOT / "public" / "audio" / "soundtrack.wav"
out.parent.mkdir(parents=True, exist_ok=True)
pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16).T.copy()
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

rms = np.sqrt(np.mean(mix**2))
print(f"wrote {out}  {DUR:.2f}s  peak {20*np.log10(np.max(np.abs(mix))):.1f} dBFS  rms {20*np.log10(rms):.1f} dBFS")
