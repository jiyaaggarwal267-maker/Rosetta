import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, Img, random, staticFile, useCurrentFrame } from "remotion";
import { clamp } from "../anim";
import { C } from "../theme";

/* ------------------------------------------------------------------ */
/* Film surface                                                        */
/* ------------------------------------------------------------------ */

/** Film grain: six pre-baked noise tiles, cycled with seeded offsets. Near-zero render cost. */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.09 }) => {
  const frame = useCurrentFrame();
  const tile = frame % 6;
  const ox = Math.floor(random(`gx${frame}`) * 256);
  const oy = Math.floor(random(`gy${frame}`) * 256);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity, overflow: "hidden" }}>
      {/* Hidden copies: the renderer waits for <Img>, so the tiles are cached before any frame is captured. */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Img key={i} src={staticFile(`grain/grain${i}.png`)} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
      ))}
      <div
        style={{
          position: "absolute",
          inset: -256,
          backgroundImage: `url(${staticFile(`grain/grain${tile}.png`)})`,
          backgroundSize: "512px 512px",
          transform: `translate(${ox}px, ${oy}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.75 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

/** Cinematic 2.39:1 bars; `open` 0 → 1 retracts them (used at the reveal). */
export const Letterbox: React.FC<{ open: number }> = ({ open }) => {
  const h = 138 * (1 - clamp(open));
  if (h < 0.5) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: h, background: "#000" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: "#000" }} />
    </AbsoluteFill>
  );
};

export const Flash: React.FC<{ amount: number; color?: string }> = ({ amount, color = "#ffffff" }) =>
  amount > 0.002 ? <AbsoluteFill style={{ background: color, opacity: clamp(amount), mixBlendMode: "screen", pointerEvents: "none" }} /> : null;

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

/** Scale / translate / roll for a whole scene, plus directional motion blur on fast moves. */
export const Camera: React.FC<{
  scale?: number;
  x?: number;
  y?: number;
  rotate?: number;
  blur?: number;
  originX?: string;
  originY?: string;
  children: React.ReactNode;
}> = ({ scale = 1, x = 0, y = 0, rotate = 0, blur = 0, originX = "50%", originY = "50%", children }) => (
  <AbsoluteFill
    style={{
      transform: `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotate}deg)`,
      transformOrigin: `${originX} ${originY}`,
      filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
    }}
  >
    {children}
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ */
/* Light                                                               */
/* ------------------------------------------------------------------ */

/** Volumetric-style beams: soft additive gradients raking down from above. */
export const LightBeams: React.FC<{ intensity: number; color?: string; frame: number }> = ({ intensity, color = C.violet, frame }) => {
  if (intensity <= 0.01) return null;
  const beams = [
    { x: 38, w: 260, r: -16, d: 0 },
    { x: 52, w: 180, r: 4, d: 1.7 },
    { x: 64, w: 320, r: 18, d: 3.1 },
  ];
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen", opacity: intensity }}>
      {beams.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${b.x}%`,
            top: -200,
            width: b.w,
            height: 1500,
            marginLeft: -b.w / 2,
            transform: `rotate(${b.r + Math.sin(frame / 60 + b.d) * 2}deg)`,
            transformOrigin: "50% 0%",
            background: `linear-gradient(180deg, ${color}55 0%, ${color}18 40%, transparent 85%)`,
            filter: "blur(28px)",
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

/** Hero type with layered bloom, an optional light sweep and an optional chromatic split. */
export const HeroText: React.FC<{
  children: string;
  size: number;
  weight?: number;
  tracking?: string;
  color?: string;
  glow?: string;
  glowAmount?: number;
  sweep?: number | null; // 0 → 1 position of the light sweep, null for none
  chroma?: number; // px of red/cyan split
  family?: string;
  style?: React.CSSProperties;
}> = ({ children, size, weight = 800, tracking = "-0.02em", color = C.text, glow = C.violet, glowAmount = 1, sweep = null, chroma = 0, family, style }) => {
  const base: React.CSSProperties = {
    fontFamily: family ?? "Bricolage, sans-serif",
    fontWeight: weight,
    fontSize: size,
    letterSpacing: tracking,
    lineHeight: 1,
    whiteSpace: "nowrap",
    ...style,
  };
  const shadow =
    glowAmount > 0
      ? `0 0 ${size * 0.04}px ${glow}${Math.round(150 * glowAmount).toString(16).padStart(2, "0")}, 0 0 ${size * 0.16}px ${glow}${Math.round(90 * glowAmount)
          .toString(16)
          .padStart(2, "0")}, 0 0 ${size * 0.5}px ${glow}${Math.round(50 * glowAmount).toString(16).padStart(2, "0")}`
      : undefined;
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {chroma > 0.2 && (
        <>
          <div style={{ ...base, position: "absolute", inset: 0, color: "#ff3b6b", opacity: 0.55, transform: `translateX(${-chroma}px)`, mixBlendMode: "screen" }}>
            {children}
          </div>
          <div style={{ ...base, position: "absolute", inset: 0, color: C.cyan, opacity: 0.55, transform: `translateX(${chroma}px)`, mixBlendMode: "screen" }}>
            {children}
          </div>
        </>
      )}
      <div style={{ ...base, color, textShadow: shadow, position: "relative" }}>{children}</div>
      {sweep !== null && sweep > 0 && sweep < 1 && (
        <div
          aria-hidden
          style={{
            ...base,
            position: "absolute",
            inset: 0,
            color: "transparent",
            backgroundImage: `linear-gradient(100deg, transparent ${sweep * 140 - 30}%, rgba(255,255,255,0.95) ${sweep * 140 - 12}%, transparent ${sweep * 140 + 4}%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            mixBlendMode: "screen",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

/** A line of type that rises out of a mask, with a short blur-to-sharp. */
export const MaskRise: React.FC<{ p: number; children: React.ReactNode; distance?: number; style?: React.CSSProperties }> = ({ p, children, distance = 1, style }) => (
  <div style={{ overflow: "hidden", padding: "0.12em 0.06em", ...style }}>
    <div
      style={{
        transform: `translateY(${(1 - p) * 110 * distance}%)`,
        filter: p < 0.98 ? `blur(${(1 - p) * 10}px)` : undefined,
        opacity: clamp(p * 1.6),
      }}
    >
      {children}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Particles (Canvas, seeded, deterministic)                           */
/* ------------------------------------------------------------------ */

type Particle = { x: number; y: number; z: number; s: number; v: number; ph: number };
const POOL: Particle[] = Array.from({ length: 260 }, (_, i) => ({
  x: random(`px${i}`),
  y: random(`py${i}`),
  z: random(`pz${i}`),
  s: 0.6 + random(`ps${i}`) * 1.8,
  v: 0.2 + random(`pv${i}`) * 0.8,
  ph: random(`pp${i}`) * Math.PI * 2,
}));

/**
 * Atmospheric dust drifting in depth. `push` displaces particles away from a
 * point (the reveal shockwave), `count` limits density, `color` tints them.
 */
export const Particles: React.FC<{
  frame: number;
  opacity: number;
  count?: number;
  color?: string;
  drift?: number;
  push?: { x: number; y: number; amount: number } | null;
}> = ({ frame, opacity, count = 160, color = "180,190,255", drift = 1, push = null }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 1920, 1080);
    if (opacity <= 0.01) return;
    for (let i = 0; i < Math.min(count, POOL.length); i++) {
      const p = POOL[i];
      let x = ((p.x * 1920 + frame * p.v * drift * (0.4 + p.z)) % 2000) - 40;
      let y = p.y * 1080 + Math.sin(frame / 40 + p.ph) * 14 * p.z - frame * 0.15 * p.v * drift;
      y = ((y % 1100) + 1100) % 1100 - 10;
      if (push && push.amount > 0) {
        const dx = x - push.x;
        const dy = y - push.y;
        const d = Math.max(30, Math.hypot(dx, dy));
        const f = (push.amount * 260 * 200) / (d + 200);
        x += (dx / d) * f;
        y += (dy / d) * f;
      }
      const a = opacity * (0.15 + p.z * 0.6) * (0.6 + 0.4 * Math.sin(frame / 25 + p.ph));
      const r = p.s * (0.5 + p.z);
      ctx.fillStyle = `rgba(${color},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [frame, opacity, count, color, drift, push?.amount, push?.x, push?.y]);
  return <canvas ref={ref} width={1920} height={1080} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />;
};

/* ------------------------------------------------------------------ */
/* Glitch (scene 2 only)                                               */
/* ------------------------------------------------------------------ */

/** Horizontal slices displaced by a 0–1 envelope. Wrap content in it. */
export const Glitch: React.FC<{ amount: number; frame: number; children: React.ReactNode }> = ({ amount, frame, children }) => {
  if (amount <= 0.02) return <AbsoluteFill>{children}</AbsoluteFill>;
  const slices = 9;
  return (
    <AbsoluteFill>
      {Array.from({ length: slices }, (_, i) => {
        const top = (i / slices) * 100;
        const bottom = 100 - ((i + 1) / slices) * 100;
        const jump = random(`gl${i}-${Math.floor(frame / 2)}`) > 0.55 ? (random(`gd${i}-${frame}`) - 0.5) * 120 * amount : 0;
        return (
          <AbsoluteFill key={i} style={{ clipPath: `inset(${top}% 0 ${bottom}% 0)`, transform: `translateX(${jump}px)` }}>
            {children}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

export const Img2 = Img;
