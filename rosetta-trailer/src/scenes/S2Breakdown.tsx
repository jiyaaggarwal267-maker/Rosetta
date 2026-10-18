import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { clamp, ease, hit, lerp, prog, shake } from "../anim";
import { Camera, Flash, Glitch, HeroText, MaskRise } from "../fx";
import { C, F, T } from "../theme";

const S = T.s2;
const CENTER: [number, number] = [960, 540];
const PANELS = [
  { role: "MANAGER", q: "Will this delay our launch?", x: 420, y: 300 },
  { role: "CMO", q: "What's the customer impact?", x: 1500, y: 300 },
  { role: "CLIENT", q: "What did we actually build?", x: 960, y: 790 },
];

/** Tangled, multiplying lines between the commit, the panels and stray points. */
const Tangle: React.FC<{ f: number; amount: number }> = ({ f, amount }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 1920, 1080);
    if (amount <= 0) return;
    const n = Math.floor(6 + amount * 70);
    for (let i = 0; i < n; i++) {
      const a = PANELS[i % 3];
      const b = i % 4 === 0 ? { x: CENTER[0], y: CENTER[1] } : PANELS[(i + 1 + (i % 2)) % 3];
      const wob = amount * 260;
      const c1x = lerp(a.x, b.x, 0.3) + (random(`t1x${i}`) - 0.5) * wob + Math.sin(f / 9 + i) * 30 * amount;
      const c1y = lerp(a.y, b.y, 0.3) + (random(`t1y${i}`) - 0.5) * wob;
      const c2x = lerp(a.x, b.x, 0.7) + (random(`t2x${i}`) - 0.5) * wob;
      const c2y = lerp(a.y, b.y, 0.7) + (random(`t2y${i}`) - 0.5) * wob + Math.cos(f / 11 + i) * 30 * amount;
      const red = random(`tr${i}`) < 0.5;
      ctx.strokeStyle = red ? `rgba(239,68,68,${0.12 + 0.3 * amount})` : `rgba(148,163,184,${0.1 + 0.2 * amount})`;
      ctx.lineWidth = red ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, b.x, b.y);
      ctx.stroke();
    }
  }, [f, amount]);
  return <canvas ref={ref} width={1920} height={1080} style={{ position: "absolute", inset: 0 }} />;
};

export const S2Breakdown: React.FC = () => {
  const frame = useCurrentFrame() + T.scenes.breakdown[0];
  // Everything freezes at 0:16.
  const f = Math.min(frame, S.freeze);
  const frozen = frame >= S.freeze;
  const chaosGone = frame >= S.silenceEnd;

  const tangle = prog(f, S.tangle[0], S.tangle[1], ease.in);
  const glitch = frozen ? 0 : clamp(prog(f, 420, S.freeze, ease.in) + S.flashes.reduce((m, at) => Math.max(m, hit(f, at, 6)), 0));
  const panelHits = S.panels.reduce((m, at) => Math.max(m, hit(f, at, 10)), 0);
  const sh = shake(f, frozen ? 0 : panelHits * 8 + tangle * 6, "s2");
  const cam = lerp(1.06, 1.0, prog(frame, 240, 300)) * lerp(1, 1.05, prog(f, S.tangle[0], S.freeze, ease.in));

  // Duplicated messages: copies of the questions sliding along the tangle.
  const echoes = Math.floor(tangle * 14);

  return (
    <AbsoluteFill style={{ background: C.void }}>
      {!chaosGone && (
        <Camera scale={cam} x={sh.x} y={sh.y} rotate={sh.r}>
          <Glitch amount={glitch} frame={f}>
            <AbsoluteFill style={{ filter: frozen ? "saturate(0.2) brightness(0.8)" : undefined }}>
              <Tangle f={f} amount={tangle} />
              <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
                {PANELS.map((p, i) => {
                  const o = prog(f, S.panels[i], S.panels[i] + 10);
                  return <line key={i} x1={CENTER[0]} y1={CENTER[1]} x2={p.x} y2={p.y} stroke={C.crimson} strokeOpacity={0.45 * o} strokeWidth={2} strokeDasharray="8 10" strokeDashoffset={-f * 2} />;
                })}
              </svg>

              {/* The commit */}
              <div
                style={{
                  position: "absolute",
                  left: CENTER[0] - 210,
                  top: CENTER[1] - 64,
                  width: 420,
                  padding: "20px 24px",
                  borderRadius: 16,
                  background: C.navy,
                  boxShadow: `0 0 0 1px rgba(148,163,184,0.25), 0 0 60px ${C.violet}33`,
                  opacity: prog(f, S.commit, S.commit + 12),
                  transform: `scale(${lerp(0.9, 1, prog(f, S.commit, S.commit + 16, ease.snap))})`,
                }}
              >
                <div style={{ fontFamily: F.mono, fontSize: 16, color: C.cyan, letterSpacing: "0.14em" }}>COMMIT a3f9c2e</div>
                <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 24, color: C.text, marginTop: 8 }}>Spread traffic across three servers</div>
                <div style={{ fontFamily: F.mono, fontSize: 15, color: C.muted, marginTop: 6 }}>+23 −5 · src/balancer.js</div>
              </div>

              {/* Echoed, duplicated questions */}
              {Array.from({ length: echoes }, (_, i) => {
                const p = PANELS[i % 3];
                const t = (f * 0.02 + random(`e${i}`)) % 1;
                const x = lerp(p.x, CENTER[0], t) + (random(`ex${i}`) - 0.5) * 300;
                const y = lerp(p.y, CENTER[1], t) + (random(`ey${i}`) - 0.5) * 200;
                return (
                  <div key={i} style={{ position: "absolute", left: x - 140, top: y, width: 280, fontFamily: F.sans, fontSize: 16, color: C.muted, opacity: 0.25 + 0.3 * random(`eo${i}`), textAlign: "center" }}>
                    {p.q}
                  </div>
                );
              })}

              {/* The three questions */}
              {PANELS.map((p, i) => {
                const o = prog(f, S.panels[i], S.panels[i] + 8, ease.out);
                if (o <= 0) return null;
                const jitter = tangle * 6;
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: p.x - 270 + Math.sin(f / 5 + i) * jitter,
                      top: p.y - 70,
                      width: 540,
                      padding: "24px 30px",
                      borderRadius: 18,
                      background: "rgba(11,16,32,0.92)",
                      boxShadow: `0 0 0 1px rgba(239,68,68,${0.25 + 0.35 * hit(f, S.panels[i], 12)}), 0 30px 70px rgba(0,0,0,0.6)`,
                      opacity: o,
                      transform: `scale(${lerp(1.15, 1, o)})`,
                    }}
                  >
                    <div style={{ fontFamily: F.mono, fontSize: 18, letterSpacing: "0.3em", color: C.crimson }}>{p.role}</div>
                    <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 40, color: C.text, marginTop: 8, lineHeight: 1.15 }}>&ldquo;{p.q}&rdquo;</div>
                  </div>
                );
              })}

              {/* MISUNDERSTOOD / REPEATED / DISCONNECTED */}
              {S.flashes.slice(0, 3).map((at, i) => {
                const word = ["MISUNDERSTOOD", "REPEATED", "DISCONNECTED"][i];
                const on = f >= at && f < at + 14;
                if (!on) return null;
                const k = 1 - (f - at) / 14;
                return (
                  <AbsoluteFill key={word} style={{ display: "grid", placeItems: "center" }}>
                    <HeroText size={190} weight={800} tracking="0.02em" color="transparent" glow={C.crimson} glowAmount={0.6 * k} chroma={12 * k} style={{ WebkitTextStroke: `2px ${C.crimson}`, transform: `scale(${1 + (1 - k) * 0.06})` }}>
                      {word}
                    </HeroText>
                  </AbsoluteFill>
                );
              })}
            </AbsoluteFill>
          </Glitch>
        </Camera>
      )}

      {/* THE PROBLEM ISN'T CODE. / IT'S THE GAP. */}
      {chaosGone && frame < S.out + 6 && (
        <AbsoluteFill style={{ display: "grid", placeContent: "center", justifyItems: "center", gap: 18, opacity: 1 - prog(frame, S.out - 4, S.out + 6, ease.in) }}>
          <MaskRise p={prog(frame, S.line1, S.line1 + 14)}>
            <HeroText size={84} weight={300} tracking="0.04em" color={C.muted} glowAmount={0}>
              THE PROBLEM ISN&rsquo;T CODE.
            </HeroText>
          </MaskRise>
          {frame >= S.line2 && <Gap frame={frame} />}
        </AbsoluteFill>
      )}
      <Flash amount={hit(frame, S.freeze, 3) * 0.6 + hit(frame, S.line2, 6) * 0.25} />
    </AbsoluteFill>
  );
};

/** "IT'S THE GAP." — the line splits open, a thin crimson fissure between the halves. */
const Gap: React.FC<{ frame: number }> = ({ frame }) => {
  const open = prog(frame, S.line2, S.line2 + 16, ease.out);
  const split = 40 * open;
  const k = hit(frame, S.line2, 10);
  const sh = shake(frame, k * 12, "gap");
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", transform: `translate(${sh.x}px, ${sh.y}px) scale(${lerp(1.3, 1, open)})` }}>
      <div style={{ transform: `translateX(${-split}px)` }}>
        <HeroText size={150} glowAmount={0.4} glow={C.crimson} chroma={k * 10}>
          IT&rsquo;S THE
        </HeroText>
      </div>
      <div style={{ width: 2 * split, height: 150, display: "grid", placeItems: "center" }}>
        <div style={{ width: 2, height: 170 * open, background: C.crimson, boxShadow: `0 0 24px ${C.crimson}, 0 0 60px ${C.crimson}` }} />
      </div>
      <div style={{ transform: `translateX(${split}px)` }}>
        <HeroText size={150} glowAmount={0.4} glow={C.crimson} chroma={k * 10} style={{ marginLeft: 36 }}>
          GAP.
        </HeroText>
      </div>
    </div>
  );
};
