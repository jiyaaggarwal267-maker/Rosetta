import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { clamp, ease, hit, lerp, prog, shake } from "../anim";
import { Camera, Flash, HeroText, LightBeams, MaskRise, Particles } from "../fx";
import { CommitCard, ExplainBox, LogoMark, ReaderCard } from "../ui";
import { C, F, READERS, T } from "../theme";

const S = T.s4;
const LABELS = ["ANALYZING DIFF", "UNDERSTANDING CONTEXT", "TRANSLATING IMPACT"];
const ACCENTS = [C.cyan, C.cyan, C.cyan, C.violetSoft, C.violetSoft, C.violetSoft];

// Six cards in a 3 × 2 grid.
const CARD_W = 540;
const GRID = READERS.map((_, i) => ({ x: 114 + (i % 3) * (CARD_W + 36), y: i < 3 ? 330 : 630 }));

export const S4Six: React.FC = () => {
  const frame = useCurrentFrame() + T.scenes.six[0];

  // Walkthrough: the Explain box, the link typed, Explain pressed.
  const boxIn = prog(frame, S.card, S.card + 18, ease.out);
  const typedLen = Math.floor(prog(frame, S.typing[0], S.typing[1], ease.soft) * S.url.length);
  const press = prog(frame, S.press, S.press + 10);
  const diffLines = prog(frame, S.diff[0], S.diff[1], (t) => t) * 7.5;
  const linkT = prog(frame, S.link[0], S.link[1], ease.inOut);
  const coreIn = prog(frame, S.core[0], S.core[0] + 16, ease.snap);
  const labelIdx = S.labels.reduce((n, at) => (frame >= at ? n + 1 : n), 0) - 1;

  // The burst: the core rises, the walkthrough slides away, six cards arrive.
  const burst = prog(frame, S.burst, S.burst + 26, ease.inOut);
  const burstHit = hit(frame, S.burst, 14);
  const words = prog(frame, S.words[0] - 8, S.words[0] + 6);
  const dive = prog(frame, S.dive[0], S.dive[1], ease.in);
  const sh = shake(frame, burstHit * 8 + S.words.reduce((m, at) => Math.max(m, hit(frame, at, 8)), 0) * 6, "s4");

  const coreX = lerp(1150, 960, burst);
  const coreY = lerp(470, 175, burst);
  const coreS = lerp(1, 0.55, burst) * (1 + 0.08 * hit(frame, S.labels[Math.max(0, labelIdx)] ?? 0, 8));

  // Dive into the Manager card (index 3) at the end.
  const mgr = GRID[3];
  const diveScale = lerp(1, 4.2, dive);
  const originX = `${mgr.x + CARD_W / 2}px`;
  const originY = `${mgr.y + 90}px`;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 60% 40%, ${C.navy} 0%, ${C.void} 70%)` }}>
      <Camera scale={lerp(1.04, 1, prog(frame, 840, 900)) * diveScale} x={sh.x} y={sh.y} originX={originX} originY={originY} blur={dive * 10}>
        <LightBeams intensity={0.22} frame={frame} color={C.cyan} />
        <Particles frame={frame} opacity={0.35} count={120} color="125,211,252" drift={0.8} />

        {/* Walkthrough: Explain box + commit card */}
        <div style={{ position: "absolute", left: 120, top: 150, opacity: boxIn * (1 - burst), transform: `translateX(${(1 - boxIn) * -120 - burst * 200}px)` }}>
          <ExplainBox typed={S.url.slice(0, typedLen)} pressed={press} />
          {frame >= S.diff[0] - 4 && (
            <div style={{ marginTop: 26, opacity: prog(frame, S.diff[0] - 4, S.diff[0] + 8), transform: `translateY(${(1 - prog(frame, S.diff[0] - 4, S.diff[0] + 12)) * 20}px)` }}>
              <CommitCard lines={diffLines} glow={linkT * (1 - linkT) * 2} />
            </div>
          )}
        </div>

        {/* The flowing neon connection into the core */}
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: 1 - burst }}>
          <defs>
            <linearGradient id="lk" x1="0" x2="1">
              <stop offset="0" stopColor={C.cyan} />
              <stop offset="1" stopColor={C.violet} />
            </linearGradient>
          </defs>
          <path
            d="M 745 600 C 880 600, 900 470, 1030 470"
            fill="none"
            stroke="url(#lk)"
            strokeWidth={3}
            strokeDasharray="420"
            strokeDashoffset={420 * (1 - linkT)}
            style={{ filter: `drop-shadow(0 0 8px ${C.cyan})` }}
          />
          {linkT > 0 &&
            [0, 0.33, 0.66].map((o, i) => {
              const t = (frame / 20 + o) % 1;
              const x = lerp(745, 1030, t);
              const y = lerp(600, 470, ease.inOut(t));
              return <circle key={i} cx={x} cy={y} r={5} fill={C.text} opacity={linkT} style={{ filter: `drop-shadow(0 0 8px ${C.cyan})` }} />;
            })}
        </svg>

        {/* Rosetta core */}
        {coreIn > 0 && (
          <div style={{ position: "absolute", left: coreX, top: coreY, transform: `translate(-50%, -50%) scale(${coreS * coreIn})` }}>
            <svg width={300} height={300} viewBox="-150 -150 300 300" style={{ position: "absolute", left: -150, top: -150, overflow: "visible" }}>
              {[96, 120, 140].map((r, i) => (
                <circle
                  key={r}
                  r={r}
                  fill="none"
                  stroke={i === 1 ? C.cyan : C.violet}
                  strokeOpacity={0.5 - i * 0.1}
                  strokeWidth={i === 1 ? 2 : 1.2}
                  strokeDasharray={i === 1 ? "60 24" : "4 10"}
                  transform={`rotate(${frame * (i % 2 ? -1.2 : 0.8)})`}
                />
              ))}
            </svg>
            <div style={{ position: "relative", transform: "translate(-50%, -50%)" }}>
              <LogoMark size={110} glow={0.8} />
            </div>
          </div>
        )}
        {labelIdx >= 0 && burst < 1 && (
          <div style={{ position: "absolute", left: 1150 - 300, width: 600, top: 650, textAlign: "center", opacity: 1 - burst }}>
            {LABELS.map((l, i) => (
              <div
                key={l}
                style={{
                  fontFamily: F.mono,
                  fontSize: 24,
                  letterSpacing: "0.3em",
                  color: i === labelIdx ? C.cyan : C.muted,
                  opacity: i <= labelIdx ? (i === labelIdx ? 1 : 0.35) : 0,
                  marginTop: 10,
                  textShadow: i === labelIdx ? `0 0 16px ${C.cyan}` : undefined,
                }}
              >
                {i < labelIdx ? "✓ " : "› "}
                {l}
              </div>
            ))}
          </div>
        )}

        {/* Six readers */}
        {burst > 0 &&
          READERS.map((r, i) => {
            const at = S.cards[i];
            const o = prog(frame, at, at + 14, ease.snap);
            if (o <= 0) return null;
            const g = GRID[i];
            const dimmed = i === 3 ? 1 - 0.5 * words * (1 - dive) : 1 - 0.72 * words;
            return (
              <React.Fragment key={r.key}>
                <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  <line x1={960} y1={210} x2={g.x + CARD_W / 2} y2={g.y} stroke={ACCENTS[i]} strokeOpacity={0.35 * o * dimmed} strokeWidth={1.5} />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    left: g.x,
                    top: g.y,
                    opacity: o * dimmed,
                    transform: `translateY(${(1 - o) * 40}px) scale(${lerp(0.92, 1, o)})`,
                    filter: words > 0.5 && i !== 3 ? `blur(${3 * words}px)` : undefined,
                  }}
                >
                  <ReaderCard label={r.label} tag={r.tag} text={r.text} width={CARD_W} accent={ACCENTS[i]} lit={hit(frame, at, 16)} />
                </div>
              </React.Fragment>
            );
          })}

        {/* ONE CHANGE. SIX PERSPECTIVES. ZERO REPETITION. */}
        {words > 0 && (
          <AbsoluteFill style={{ display: "grid", placeContent: "center", justifyItems: "center", gap: 4, opacity: 1 - prog(frame, S.dive[0] - 10, S.dive[0] + 6, ease.in) }}>
            {["ONE CHANGE.", "SIX PERSPECTIVES.", "ZERO REPETITION."].map((w, i) => {
              const at = S.words[i];
              if (frame < at - 1) return <div key={w} style={{ height: 120 }} />;
              const p = prog(frame, at, at + 12);
              const k = hit(frame, at, 10);
              return (
                <MaskRise key={w} p={p}>
                  <HeroText size={112} glowAmount={0.5 + k} glow={i === 1 ? C.cyan : C.violet} chroma={k * 6} sweep={prog(frame, at + 4, at + 30, ease.inOut)}>
                    {w}
                  </HeroText>
                </MaskRise>
              );
            })}
          </AbsoluteFill>
        )}
      </Camera>
      <Flash amount={burstHit * 0.3 + clamp(dive * dive) * 0.4} color={dive > 0 ? "#ffffff" : C.cyan} />
    </AbsoluteFill>
  );
};
