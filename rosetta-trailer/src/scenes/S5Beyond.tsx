import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { clamp, ease, hit, lerp, prog, shake } from "../anim";
import { Camera, Flash, HeroText, MaskRise, Particles } from "../fx";
import { AppWindow, Bubble, FlowChart, LogoMark, RiskLow } from "../ui";
import { C, F, T } from "../theme";

const S = T.s5;
const U = C.ui;

const QUESTION = "Will this delay our launch?";
const TECH = "Does pickNextServer() change anything the release depends on?";
const REPLY = "No. It only changes which upstream answers each request. Health checks follow next sprint.";
const ANSWER = "No delay. Each visitor now goes to the next of three servers. One follow-up, health checks, is planned for next sprint.";

export const S5Beyond: React.FC = () => {
  const frame = useCurrentFrame() + T.scenes.beyond[0];
  const partB = frame >= S.ask - 8;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 70% 45%, ${C.navy} 0%, ${C.void} 72%)` }}>
      <Particles frame={frame} opacity={0.3} count={100} color="167,139,250" drift={0.6} />
      {!partB || frame < S.ask + 10 ? <FlowPart frame={frame} out={prog(frame, S.ask - 14, S.ask + 8, ease.in)} /> : null}
      {partB && <AskPart frame={frame} />}
      <Flash amount={hit(frame, T.scenes.beyond[0], 8) * 0.6 + hit(frame, S.answer, 6) * 0.12} color={frame < 1220 ? "#ffffff" : C.cyan} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Before / after, inside the real "How it works" panel                */
/* ------------------------------------------------------------------ */

const FlowPart: React.FC<{ frame: number; out: number }> = ({ frame, out }) => {
  const win = prog(frame, S.panel, S.panel + 24, ease.out);
  const m = prog(frame, S.morph[0], S.morph[1], ease.inOut);
  const trace = prog(frame, S.trace[0], S.trace[1], (t) => t);
  const after = m > 0.5;
  const rotY = lerp(-14, -6, prog(frame, S.panel, S.ask, ease.soft));
  const words = prog(frame, S.words1, S.words1 + 14);

  return (
    <AbsoluteFill style={{ opacity: 1 - out, filter: out > 0 ? `blur(${out * 8}px)` : undefined }}>
      <Camera scale={lerp(1.08, 1, win)}>
        {/* Left: the big state label, then the headline */}
        <div style={{ position: "absolute", left: 110, top: 300, width: 560 }}>
          <div style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: "0.4em", color: C.muted, opacity: win }}>HOW IT WORKS</div>
          <div style={{ position: "relative", height: 150, marginTop: 6, overflow: "hidden" }}>
            {["BEFORE", "AFTER"].map((w, i) => {
              const y = (i - ease.inOut(m)) * 150;
              return (
                <div key={w} style={{ position: "absolute", top: y, opacity: win }}>
                  <HeroText size={140} glowAmount={i ? 0.7 : 0.15} glow={i ? C.violet : C.muted} color={i ? C.text : C.muted}>
                    {w}
                  </HeroText>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 40 }}>
            {frame >= S.words1 - 1 && (
              <MaskRise p={words}>
                <HeroText size={64} weight={700} glowAmount={0.4} sweep={prog(frame, S.words1 + 6, S.words1 + 34, ease.inOut)}>
                  NOT JUST
                </HeroText>
              </MaskRise>
            )}
            {frame >= S.words1 + 4 && (
              <MaskRise p={prog(frame, S.words1 + 5, S.words1 + 19)}>
                <HeroText size={64} weight={700} glowAmount={0.4}>
                  SUMMARIES.
                </HeroText>
              </MaskRise>
            )}
          </div>
        </div>

        {/* Right: the Rosetta change page, tilted in space */}
        <div style={{ position: "absolute", left: 700, top: 150, perspective: 1800, opacity: win }}>
          <div style={{ transform: `rotateY(${rotY}deg) rotateX(4deg) translateX(${(1 - win) * 160}px)`, transformOrigin: "0% 50%" }}>
            <AppWindow width={1130} height={760}>
              <div style={{ padding: "30px 40px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 36, color: U.paper }}>Spread traffic across three servers</div>
                    <div style={{ fontFamily: F.sans, fontSize: 16, color: U.text3, marginTop: 8 }}>Rohan Garg · Backend engineer · Explained for you as a manager</div>
                  </div>
                  <RiskLow />
                </div>
                <div style={{ marginTop: 26, padding: "24px 26px", borderRadius: 18, background: U.surface1, boxShadow: `0 0 0 1px ${U.ring}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 24, color: U.paper }}>How it works</div>
                      <div style={{ fontFamily: F.sans, fontSize: 15, color: U.text3, marginTop: 4 }}>{after ? "After this change." : "Before this change."} Select any box to ask why.</div>
                    </div>
                    <div style={{ display: "inline-grid", gridTemplateColumns: "1fr 1fr", padding: 4, borderRadius: 10, background: U.surface2, boxShadow: `0 0 0 1px ${U.ring}`, position: "relative" }}>
                      <div style={{ position: "absolute", top: 4, bottom: 4, left: 4, width: "calc(50% - 4px)", borderRadius: 7, background: U.surface1, boxShadow: "0 2px 8px rgba(0,0,0,0.4)", transform: `translateX(${ease.inOut(m) * 100}%)` }} />
                      {["Before", "After"].map((t, i) => (
                        <span key={t} style={{ position: "relative", padding: "8px 20px", fontFamily: F.sans, fontWeight: 500, fontSize: 15, color: (i === 1) === after ? U.paper : U.mist }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginTop: 18 }}>
                    <FlowChart m={m} trace={trace} />
                  </div>
                  <div style={{ marginTop: 6, padding: "14px 18px", borderRadius: 12, background: U.surface2, opacity: prog(frame, S.trace[0] - 6, S.trace[0] + 8), display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontFamily: F.mono, fontSize: 14, color: C.cyan }}>STEP 1 OF 4</span>
                    <span style={{ fontFamily: F.sans, fontSize: 17, color: U.paper }}>Visitor 1 arrives. It&rsquo;s Server A&rsquo;s turn, so A serves them.</span>
                  </div>
                </div>
              </div>
            </AppWindow>
          </div>
        </div>
      </Camera>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Ask why: the question goes to the engineer and comes back           */
/* ------------------------------------------------------------------ */

const AskPart: React.FC<{ frame: number }> = ({ frame }) => {
  const inP = prog(frame, S.ask - 6, S.ask + 14, ease.out);
  const t1 = prog(frame, S.travel1[0], S.travel1[1], ease.inOut);
  const tech = prog(frame, S.tech, S.tech + 12, ease.snap);
  const typed = Math.floor(prog(frame, S.reply[0], S.reply[1], ease.soft) * REPLY.length);
  const t2 = prog(frame, S.travel2[0], S.travel2[1], ease.inOut);
  const answer = prog(frame, S.answer, S.answer + 14, ease.snap);
  const words = prog(frame, S.words2, S.words2 + 14);
  const sh = shake(frame, hit(frame, S.answer, 8) * 4, "s5");
  const routed = prog(frame, S.travel1[0], S.travel1[0] + 10);

  // Link geometry: manager (left) ↔ Rosetta core (centre) ↔ engineer (right).
  const P1: [number, number] = [740, 330];
  const CORE: [number, number] = [960, 470];
  const P2: [number, number] = [1180, 330];
  const R1: [number, number] = [1180, 600];
  const R2: [number, number] = [740, 640];
  const dot = (a: [number, number], b: [number, number], t: number) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const along = (pts: [number, number][], t: number) => (t < 0.5 ? dot(pts[0], pts[1], t * 2) : dot(pts[1], pts[2], (t - 0.5) * 2));
  const q = along([P1, CORE, P2], t1);
  const a = along([R1, CORE, R2], t2);

  return (
    <AbsoluteFill style={{ opacity: inP, transform: `translate(${sh.x}px, ${sh.y}px)` }}>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <polyline points={`${P1} ${CORE} ${P2}`} fill="none" stroke={C.violet} strokeOpacity={0.25 + 0.5 * routed} strokeWidth={2} style={{ filter: `drop-shadow(0 0 6px ${C.violet})` }} />
        <polyline points={`${R1} ${CORE} ${R2}`} fill="none" stroke={C.cyan} strokeOpacity={0.15 + 0.6 * prog(frame, S.travel2[0], S.travel2[0] + 8)} strokeWidth={2} style={{ filter: `drop-shadow(0 0 6px ${C.cyan})` }} />
        {t1 > 0 && t1 < 1 && <circle cx={q[0]} cy={q[1]} r={9} fill={C.text} style={{ filter: `drop-shadow(0 0 12px ${C.violet}) drop-shadow(0 0 24px ${C.violet})` }} />}
        {t2 > 0 && t2 < 1 && <circle cx={a[0]} cy={a[1]} r={9} fill={C.text} style={{ filter: `drop-shadow(0 0 12px ${C.cyan}) drop-shadow(0 0 24px ${C.cyan})` }} />}
      </svg>

      {/* Core */}
      <div style={{ position: "absolute", left: CORE[0], top: CORE[1], transform: "translate(-50%,-50%)" }}>
        <div style={{ transform: "translate(-50%,-50%)", position: "relative" }}>
          <LogoMark size={72} glow={0.6 + hit(frame, S.travel1[0] + 14, 10) + hit(frame, S.travel2[0] + 11, 10)} />
        </div>
      </div>
      <div style={{ position: "absolute", left: CORE[0] - 210, width: 420, top: CORE[1] + 62, textAlign: "center", fontFamily: F.mono, fontSize: 16, letterSpacing: "0.12em", color: C.muted, opacity: routed * (1 - answer) }}>
        {t2 > 0 ? "REWRITING FOR THE MANAGER" : "ROUTED TO ROHAN, WHO WROTE THE CHANGE"}
      </div>

      {/* Manager side */}
      <div style={{ position: "absolute", left: 130, top: 190 }}>
        <div style={{ fontFamily: F.mono, fontSize: 15, letterSpacing: "0.2em", color: C.violetSoft, marginBottom: 12 }}>ASK WHY · STEP: WHOSE TURN?</div>
        <Bubble who="Vaibhav Singla" role="Manager" text={QUESTION} accent={C.violet} width={600} mine />
      </div>
      {answer > 0 && (
        <div style={{ position: "absolute", left: 130, top: 560, opacity: answer, transform: `translateY(${(1 - answer) * 24}px)` }}>
          <Bubble who="Rohan Garg" role="Engineer · rewritten for you" text={ANSWER} accent={C.cyan} width={600} />
          <div style={{ marginTop: 10, fontFamily: F.sans, fontSize: 15, color: U.text3, textDecoration: "underline", textUnderlineOffset: 4 }}>Show what Rohan wrote</div>
        </div>
      )}

      {/* Engineer side */}
      {tech > 0 && (
        <div style={{ position: "absolute", left: 1190, top: 190, opacity: tech, transform: `translateY(${(1 - tech) * 24}px)` }}>
          <div style={{ fontFamily: F.mono, fontSize: 15, letterSpacing: "0.2em", color: C.cyan, marginBottom: 12 }}>ROSETTA&rsquo;S TECHNICAL VERSION</div>
          <Bubble who="Vaibhav Singla" role="Manager" text={TECH} mono accent={U.steel} width={600} />
        </div>
      )}
      {frame >= S.reply[0] && (
        <div style={{ position: "absolute", left: 1190, top: 470, opacity: prog(frame, S.reply[0], S.reply[0] + 8) }}>
          <Bubble who="Rohan Garg" role="Engineer" text={REPLY.slice(0, Math.max(1, typed)) + (typed < REPLY.length ? "▍" : "")} accent={U.steel} width={600} mine />
        </div>
      )}

      {/* TWO-WAY UNDERSTANDING. */}
      {frame >= S.words2 - 1 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 880, display: "flex", justifyContent: "center" }}>
          <MaskRise p={words}>
            <HeroText size={86} glowAmount={0.6} glow={C.cyan} sweep={prog(frame, S.words2 + 4, S.words2 + 26, ease.inOut)}>
              TWO-WAY UNDERSTANDING.
            </HeroText>
          </MaskRise>
        </div>
      )}
    </AbsoluteFill>
  );
};

export { clamp };
