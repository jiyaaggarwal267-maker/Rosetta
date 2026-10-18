import { Easing, interpolate, random } from "remotion";

/** Shared motion vocabulary: custom curves, not presets. */
export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1), // expo-like out: things arrive and settle
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  snap: Easing.bezier(0.2, 1.4, 0.4, 1), // slight overshoot for UI landings
  soft: Easing.bezier(0.33, 0, 0.2, 1),
};

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** 0 → 1 between two frames, with an easing curve. */
export function prog(frame: number, start: number, end: number, curve: (t: number) => number = ease.out) {
  return interpolate(frame, [start, end], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: curve });
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A short decaying envelope after an impact frame: 1 at the hit, 0 after `len` frames. */
export function hit(frame: number, at: number, len = 12) {
  if (frame < at || frame > at + len) return 0;
  const t = (frame - at) / len;
  return Math.pow(1 - t, 2.2);
}

/** Deterministic camera shake from an envelope. */
export function shake(frame: number, amount: number, seed = "s") {
  if (amount <= 0.001) return { x: 0, y: 0, r: 0 };
  return {
    x: (random(`${seed}x${frame}`) - 0.5) * 2 * amount,
    y: (random(`${seed}y${frame}`) - 0.5) * 2 * amount,
    r: (random(`${seed}r${frame}`) - 0.5) * 0.25 * amount,
  };
}

/** Fade in at `a`, out at `b`, over `len` frames each side. */
export function life(frame: number, a: number, b: number, len = 10) {
  return Math.min(prog(frame, a, a + len, ease.out), 1 - prog(frame, b - len, b, ease.in));
}
