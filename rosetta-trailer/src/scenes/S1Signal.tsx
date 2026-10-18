import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { clamp, ease, hit, lerp, prog, shake } from "../anim";
import { Camera, Flash, HeroText, MaskRise, Particles } from "../fx";
import { C, F, T } from "../theme";

const S = T.s1;

// The network: origin → junction → three branches, each ending in a labelled node.
const ORIGIN: [number, number] = [960, 470];
const JUNCTION: [number, number] = [960, 585];
const BRANCHES = [
  { label: "ENGINEERING", mid: [700, 690], end: [470, 780], drift: -46 },
  { label: "MANAGEMENT", mid: [960, 710], end: [960, 815], drift: 0 },
  { label: "BUSINESS", mid: [1220, 690], end: [1450, 780], drift: 46 },
] as const;

/** Point along a polyline at t (0..1). */
function along(points: number[][], t: number): [number, number] {
  const segs = points.length - 1;
  const s = Math.min(segs - 1, Math.floor(t * segs));
  const local = t * segs - s;
  return [lerp(points[s][0], points[s + 1][0], local), lerp(points[s][1], points[s + 1][1], local)];
}

export const S1Signal: React.FC = () => {
  const frame = useCurrentFrame();

  // Typing.
  const typed = S.keys.filter((k) => frame >= k).length;
  const cmd = S.command.slice(0, typed);
  const cursorOn = frame >= S.cursor && (frame >= S.enter ? false : Math.floor((frame - S.cursor) / 12) % 2 === 0 || typed > 0);
  const executed = frame >= S.enter;
  const termOut = prog(frame, S.line1 - 6, S.line1 + 8, ease.in);

  // Pulse through the network.
  const pulseT = prog(frame, S.pulse[0], S.pulse[1], ease.inOut);
  const netIn = prog(frame, S.enter, S.enter + 14);
  const split = prog(frame, S.split, S.split + 22, ease.out);
  const splitHit = hit(frame, S.split, 14);

  // Camera: a slow push-in through the scene, then a sudden impact zoom into the junction.
  const push = lerp(1, 1.08, prog(frame, 0, S.zoom, ease.soft));
  const zoom = prog(frame, S.zoom, 240, ease.in);
  const scale = push * lerp(1, 3.4, zoom);
  const sh = shake(frame, splitHit * 10 + zoom * 6, "s1");

  const trunk = [ORIGIN, JUNCTION];
  const pulseSpots: [number, number][] = [];
  if (pulseT > 0 && pulseT < 1) {
    if (pulseT < 0.4) pulseSpots.push(along(trunk as unknown as number[][], pulseT / 0.4));
    else for (const b of BRANCHES) pulseSpots.push(along([JUNCTION, b.mid, b.end] as unknown as number[][], (pulseT - 0.4) / 0.6));
  }

  return (
    <AbsoluteFill style={{ background: C.void }}>
      <Camera scale={scale} x={sh.x} y={sh.y} rotate={sh.r} blur={zoom * 6} originY="54%">
        <Particles frame={frame} opacity={0.35 * prog(frame, 0, 90)} count={90} color="148,163,184" drift={0.5} />

        {/* Terminal */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 300, display: "flex", justifyContent: "center", opacity: 1 - termOut }}>
          <div style={{ fontFamily: F.mono, fontSize: 40, fontWeight: 400, color: C.text, letterSpacing: "0.01em", minWidth: 640 }}>
            <span style={{ color: C.muted, opacity: frame >= S.cursor ? 1 : 0 }}>~/rosetta $ </span>
            <span>{cmd}</span>
            <span style={{ display: "inline-block", width: 22, height: 44, marginLeft: 4, verticalAlign: "-8px", background: cursorOn ? C.violetSoft : "transparent", boxShadow: cursorOn ? `0 0 18px ${C.violet}` : undefined }} />
            {executed && (
              <div style={{ fontSize: 22, color: C.muted, marginTop: 14, opacity: prog(frame, S.enter + 2, S.enter + 10) }}>
                → 1 commit pushed to main
              </div>
            )}
          </div>
        </div>

        {/* Network */}
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: netIn }}>
          <defs>
            <filter id="g1" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <line x1={ORIGIN[0]} y1={ORIGIN[1]} x2={JUNCTION[0]} y2={JUNCTION[1]} stroke={C.violet} strokeOpacity={0.6} strokeWidth={2} />
          {BRANCHES.map((b, i) => {
            // After the split, each branch drifts away and its link to the junction breaks.
            const dx = b.drift * split;
            const gap = split;
            const sx = lerp(JUNCTION[0], b.mid[0], 0.22 + 0.25 * gap);
            const sy = lerp(JUNCTION[1], b.mid[1], 0.22 + 0.25 * gap);
            const lit = pulseT > 0.4 ? clamp((pulseT - 0.4) / 0.6) : 0;
            const tone = split > 0.05 ? C.crimson : C.violet;
            return (
              <g key={i} transform={`translate(${dx} ${split * 18})`}>
                <line x1={JUNCTION[0]} y1={JUNCTION[1]} x2={lerp(JUNCTION[0], b.mid[0], 0.22)} y2={lerp(JUNCTION[1], b.mid[1], 0.22)} stroke={C.violet} strokeOpacity={0.55 * (1 - gap)} strokeWidth={2} />
                <polyline points={`${sx},${sy} ${b.mid[0]},${b.mid[1]} ${b.end[0]},${b.end[1]}`} fill="none" stroke={tone} strokeOpacity={0.35 + 0.4 * lit} strokeWidth={2} strokeDasharray={split > 0.05 ? "10 9" : undefined} />
                {[b.mid, b.end].map((p, j) => (
                  <circle key={j} cx={p[0]} cy={p[1]} r={j ? 9 : 5} fill={C.void} stroke={tone} strokeWidth={2} filter="url(#g1)" opacity={0.6 + 0.4 * lit} />
                ))}
                {split > 0.02 && (
                  <g opacity={split}>
                    <text x={b.end[0]} y={b.end[1] + 58} textAnchor="middle" fontFamily={F.mono} fontSize={26} letterSpacing="0.32em" fill={C.text}>
                      {b.label}
                    </text>
                    <text x={sx + (b.drift ? Math.sign(b.drift) * -10 : 0)} y={sy - 10} textAnchor="middle" fontFamily={F.mono} fontSize={14} fill={C.crimson} opacity={0.8}>
                      ✕ no signal
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          <circle cx={ORIGIN[0]} cy={ORIGIN[1]} r={11} fill={C.violet} filter="url(#g1)" />
          <circle cx={JUNCTION[0]} cy={JUNCTION[1]} r={7} fill={C.void} stroke={C.violetSoft} strokeWidth={2} filter="url(#g1)" />
          {pulseSpots.map(([x, y], i) => (
            <g key={i} filter="url(#g1)">
              <circle cx={x} cy={y} r={9} fill={C.cyan} />
              <circle cx={x} cy={y} r={26} fill={C.cyan} opacity={0.18} />
            </g>
          ))}
          {splitHit > 0 && <circle cx={JUNCTION[0]} cy={JUNCTION[1]} r={20 + (1 - splitHit) * 420} fill="none" stroke={C.crimson} strokeOpacity={splitHit * 0.7} strokeWidth={3} />}
        </svg>

        {/* ONE CODE CHANGE. / THREE DIFFERENT QUESTIONS. */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 230, display: "grid", justifyItems: "center", gap: 6 }}>
          {frame >= S.line1 - 2 && (
            <MaskRise p={prog(frame, S.line1, S.line1 + 16)}>
              <HeroText size={112} glowAmount={0.5} sweep={prog(frame, S.line1 + 6, S.line1 + 40, ease.inOut)}>
                ONE CODE CHANGE.
              </HeroText>
            </MaskRise>
          )}
          {frame >= S.line2 - 2 && (
            <MaskRise p={prog(frame, S.line2, S.line2 + 16)}>
              <HeroText size={58} weight={300} tracking="0.1em" color={C.muted} glowAmount={0}>
                THREE DIFFERENT QUESTIONS.
              </HeroText>
            </MaskRise>
          )}
        </div>
      </Camera>
      <Flash amount={hit(frame, S.split, 5) * 0.35 + zoom * zoom * 0.5} color={zoom > 0 ? "#ffffff" : C.crimson} />
    </AbsoluteFill>
  );
};
