import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, hit, lerp, prog, shake } from "../anim";
import { Camera, Flash, HeroText, LightBeams, MaskRise, Particles } from "../fx";
import { AppWindow, CommitCard, ReaderCard } from "../ui";
import { C, F, READERS, T } from "../theme";

const S = T.s6;
const U = C.ui;
const LINES = ["ENGINEERS BUILD.", "TEAMS UNDERSTAND.", "BUSINESSES SEE VALUE."];
const TONES = [C.cyan, C.violet, C.violetSoft];

/** A glimpse of a real Rosetta screen behind each statement. */
const Glimpse: React.FC<{ i: number; t: number }> = ({ i, t }) => {
  const drift = lerp(40, -40, t);
  const common: React.CSSProperties = { position: "absolute", opacity: 0.32, filter: "blur(1.5px)", transform: `translateX(${drift}px) scale(1.15) rotate(-3deg)` };
  if (i === 0)
    return (
      <div style={{ ...common, left: 1080, top: 230 }}>
        <CommitCard lines={8} width={680} />
      </div>
    );
  if (i === 1)
    return (
      <div style={{ ...common, left: 120, top: 180, display: "grid", gridTemplateColumns: "repeat(3, 520px)", gap: 30 }}>
        {READERS.map((r) => (
          <ReaderCard key={r.key} label={r.label} tag={r.tag} text={r.text} width={520} />
        ))}
      </div>
    );
  return (
    <div style={{ ...common, left: 480, top: 120 }}>
      <AppWindow width={1000} height={700} tab="This week">
        <div style={{ padding: 36 }}>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 44, color: U.paper }}>This week</div>
          <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 26, color: U.paper, marginTop: 20 }}>3 changes this week, 2 reviewed by the engineers who made them.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 26 }}>
            {[
              ["Changes", "3"],
              ["Reviewed", "2"],
              ["Need care", "1"],
              ["Questions", "1"],
            ].map(([l, v]) => (
              <div key={l} style={{ padding: 18, borderRadius: 14, background: U.surface1, boxShadow: `0 0 0 1px ${U.ring}` }}>
                <div style={{ fontFamily: F.sans, fontSize: 15, color: U.mist }}>{l}</div>
                <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 42, color: U.paper, marginTop: 6 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </AppWindow>
    </div>
  );
};

export const S6Impact: React.FC = () => {
  const frame = useCurrentFrame() + T.scenes.impact[0];
  const idx = S.beats.reduce((n, at) => (frame >= at ? n + 1 : n), 0) - 1;
  const at = S.beats[Math.max(0, idx)];
  const local = prog(frame, at, at + 42, (t) => t);
  const k = hit(frame, at, 10);
  const sh = shake(frame, k * 10, "s6");
  const lift = prog(frame, S.lift, T.scenes.impact[1], ease.in);
  // Each beat punches in a little more than the last: increasingly confident.
  const punch = lerp(1.12, 1, prog(frame, at, at + 14, ease.out)) + idx * 0.02;

  return (
    <AbsoluteFill style={{ background: C.void }}>
      <Camera scale={punch * lerp(1, 1.25, lift)} x={sh.x} y={sh.y} rotate={sh.r} blur={lift * 6}>
        <LightBeams intensity={0.25 + 0.3 * lift} frame={frame} color={TONES[Math.max(0, idx)]} />
        <Particles frame={frame} opacity={0.5} count={180} color="196,181,253" drift={1.4 + idx} />
        {idx >= 0 && <Glimpse i={idx} t={local} />}
        {idx >= 0 && (
          <AbsoluteFill style={{ display: "grid", placeItems: "center" }}>
            <MaskRise p={prog(frame, at, at + 10)} key={idx}>
              <HeroText size={idx === 2 ? 132 : 150} glowAmount={0.6 + k} glow={TONES[idx]} chroma={k * 8} sweep={prog(frame, at + 6, at + 34, ease.inOut)}>
                {LINES[idx]}
              </HeroText>
            </MaskRise>
          </AbsoluteFill>
        )}
      </Camera>
      <Flash amount={k * 0.35 + lift * lift * 0.6} color="#ffffff" />
    </AbsoluteFill>
  );
};
