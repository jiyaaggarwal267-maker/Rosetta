import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { clamp, ease, hit, lerp, prog, shake } from "../anim";
import { Camera, Flash, HeroText, LightBeams, MaskRise, Particles } from "../fx";
import { LogoMark } from "../ui";
import { C, F, T } from "../theme";

const S = T.s3;
const CX = 960;
const CY = 470;

// A geometric communication network: concentric rings of nodes around the centre.
const RINGS = [
  { r: 120, n: 6 },
  { r: 250, n: 12 },
  { r: 400, n: 18 },
  { r: 580, n: 24 },
];
const NODES = RINGS.flatMap((ring, ri) =>
  Array.from({ length: ring.n }, (_, i) => {
    const a = (i / ring.n) * Math.PI * 2 + ri * 0.21;
    return { ri, a, r: ring.r * (0.94 + random(`rr${ri}-${i}`) * 0.12), z: random(`rz${ri}-${i}`) };
  }),
);
// The broken lines from the breakdown, coming back in from the edges.
const STRAYS = Array.from({ length: 22 }, (_, i) => {
  const a = random(`sa${i}`) * Math.PI * 2;
  return { a, d: 900 + random(`sd${i}`) * 500, w: 0.6 + random(`sw${i}`) * 1.4, delay: random(`sdl${i}`) * 0.4 };
});

const Network: React.FC<{ frame: number }> = ({ frame }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 1920, 1080);
    const grow = prog(frame, S.expand[0], S.expand[1], ease.inOut);
    const conv = prog(frame, S.converge[0], S.converge[1], ease.inOut);
    const settle = prog(frame, S.reveal, S.reveal + 60);
    const dim = lerp(1, 0.32, settle);
    const rot = frame * 0.0012;
    ctx.globalCompositeOperation = "lighter";

    // Strays converge from the dark edges, crimson turning violet.
    for (const s of STRAYS) {
      const t = clamp((conv - s.delay) / (1 - s.delay));
      if (t <= 0 || t >= 1) continue;
      const start = s.d * (1 - t * 0.98);
      const end = Math.max(0, start - 260);
      const x1 = CX + Math.cos(s.a) * start;
      const y1 = CY + Math.sin(s.a) * start;
      const x2 = CX + Math.cos(s.a) * end;
      const y2 = CY + Math.sin(s.a) * end;
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      const red = `rgba(239,68,68,${0.6 * (1 - t)})`;
      const vio = `rgba(139,92,246,${0.9 * t + 0.2})`;
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, t < 0.5 ? red : vio);
      ctx.strokeStyle = g;
      ctx.lineWidth = s.w * 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Rings grow outwards from the point.
    const pts = NODES.map((n) => {
      const reach = clamp(grow * RINGS.length - n.ri);
      const r = n.r * ease.out(reach);
      const a = n.a + rot * (n.ri % 2 ? -1 : 1);
      return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r * 0.62, on: reach, n };
    });
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.on <= 0) continue;
      // Spokes to the centre for the inner ring, and links to the nearest node on the next ring.
      const targets = pts.filter((q) => q.n.ri === p.n.ri + 1).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 2);
      if (p.n.ri === 0) targets.push({ x: CX, y: CY, on: 1, n: p.n });
      for (const q of targets) {
        if (q.on <= 0) continue;
        ctx.strokeStyle = `rgba(139,92,246,${0.32 * p.on * q.on * dim})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      const size = 2 + p.n.z * 3;
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 6);
      glow.addColorStop(0, `rgba(167,139,250,${0.9 * p.on * dim})`);
      glow.addColorStop(1, "rgba(139,92,246,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(248,250,252,${0.85 * p.on * dim})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // The single point, then the energy pulse.
    const point = prog(frame, S.point, S.point + 14);
    if (point > 0) {
      const breathe = 1 + Math.sin(frame / 6) * 0.12;
      const r = (10 + 30 * grow) * breathe;
      const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, r * 5);
      g.addColorStop(0, `rgba(248,250,252,${point})`);
      g.addColorStop(0.15, `rgba(167,139,250,${0.9 * point})`);
      g.addColorStop(1, "rgba(139,92,246,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(CX, CY, r * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [at, color] of [
      [S.pulse, "34,211,238"],
      [S.reveal, "167,139,250"],
    ] as const) {
      const t = prog(frame, at, at + 34, ease.out);
      if (t > 0 && t < 1) {
        ctx.strokeStyle = `rgba(${color},${0.85 * (1 - t)})`;
        ctx.lineWidth = 10 * (1 - t) + 1;
        ctx.beginPath();
        ctx.ellipse(CX, CY, 40 + t * 1100, (40 + t * 1100) * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }, [frame]);
  return <canvas ref={ref} width={1920} height={1080} style={{ position: "absolute", inset: 0 }} />;
};

export const S3Reveal: React.FC = () => {
  const frame = useCurrentFrame() + T.scenes.reveal[0];
  const reveal = prog(frame, S.reveal, S.reveal + 40, ease.out);
  const impact = hit(frame, S.reveal, 16);
  const sh = shake(frame, impact * 14, "s3");
  // Slow, steady push across the whole hold; a kick on the impact.
  const cam = lerp(1.0, 1.07, prog(frame, S.reveal, T.scenes.reveal[1], ease.soft)) + impact * 0.04;
  const out = prog(frame, S.out, T.scenes.reveal[1], ease.in);
  const tracking = lerp(0.16, 0.06, reveal);

  return (
    <AbsoluteFill style={{ background: C.void }}>
      <Camera scale={cam * lerp(1, 1.5, out)} x={sh.x} y={sh.y} rotate={sh.r} blur={out * 8}>
        <LightBeams intensity={0.55 * prog(frame, S.reveal - 6, S.reveal + 30) * (1 - out)} frame={frame} />
        <Network frame={frame} />
        <Particles
          frame={frame}
          opacity={0.7 * prog(frame, S.reveal - 10, S.reveal + 10)}
          count={220}
          color="196,181,253"
          drift={0.6}
          push={{ x: CX, y: CY, amount: impact * 1.4 + 0.15 * prog(frame, S.reveal, S.reveal + 40) }}
        />

        {frame >= S.reveal - 1 && (
          <AbsoluteFill style={{ display: "grid", placeContent: "center", justifyItems: "center", opacity: 1 - out }}>
            <div style={{ transform: `scale(${lerp(1.14, 1, reveal)})`, opacity: clamp(reveal * 3), marginTop: -40 }}>
              <HeroText
                size={250}
                weight={800}
                tracking={`${tracking}em`}
                glowAmount={0.9 + impact}
                sweep={prog(frame, S.reveal + 14, S.reveal + 70, ease.inOut)}
                chroma={impact * 14}
              >
                ROSETTA
              </HeroText>
            </div>
            <div style={{ marginTop: 34, display: "grid", justifyItems: "center", gap: 12 }}>
              {frame >= S.sub1 && (
                <MaskRise p={prog(frame, S.sub1, S.sub1 + 18)}>
                  <div style={{ fontFamily: F.mono, fontSize: 30, letterSpacing: "0.5em", color: C.text, marginRight: "-0.5em" }}>THE COMMUNICATION LAYER</div>
                </MaskRise>
              )}
              {frame >= S.sub2 && (
                <MaskRise p={prog(frame, S.sub2, S.sub2 + 18)}>
                  <div style={{ fontFamily: F.sans, fontWeight: 300, fontSize: 30, letterSpacing: "0.32em", color: C.muted, marginRight: "-0.32em" }}>BETWEEN CODE AND BUSINESS</div>
                </MaskRise>
              )}
            </div>
            {frame >= S.sub2 + 20 && (
              <div style={{ marginTop: 40, opacity: 0.85 * prog(frame, S.sub2 + 20, S.sub2 + 40) }}>
                <LogoMark size={34} glow={0.6} />
              </div>
            )}
          </AbsoluteFill>
        )}
      </Camera>
      <Flash amount={hit(frame, S.reveal, 7) * 0.75} color="#E9E3FF" />
      <Flash amount={hit(frame, S.pulse, 6) * 0.2} color={C.cyan} />
    </AbsoluteFill>
  );
};
