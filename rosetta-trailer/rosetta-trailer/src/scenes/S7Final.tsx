import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { ease, hit, lerp, prog, shake } from "../anim";
import { Camera, Flash, HeroText, MaskRise, Particles } from "../fx";
import { LogoMark } from "../ui";
import { C, F, T } from "../theme";

const S = T.s7;
const CX = 960;
const CY = 470;
const NODES = Array.from({ length: 140 }, (_, i) => {
  const a = random(`fa${i}`) * Math.PI * 2;
  const d = 260 + random(`fd${i}`) * 900;
  return { x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d * 0.6, delay: random(`fl${i}`) * 0.35, z: random(`fz${i}`) };
});

/** Every node of the network flies home into the wordmark. */
const Converge: React.FC<{ frame: number }> = ({ frame }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 1920, 1080);
    const t = prog(frame, S.converge[0], S.converge[1], ease.in);
    const after = prog(frame, S.logo, S.logo + 30);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < NODES.length; i++) {
      const n = NODES[i];
      const local = Math.min(1, Math.max(0, (t - n.delay) / (1 - n.delay)));
      if (after >= 1) break;
      const x = lerp(n.x, CX + (i % 14 - 7) * 40, local);
      const y = lerp(n.y, CY, local);
      const tail = 40 * local;
      const ang = Math.atan2(CY - n.y, CX - n.x);
      ctx.strokeStyle = `rgba(167,139,250,${(0.5 + n.z * 0.5) * (1 - after)})`;
      ctx.lineWidth = 1 + n.z * 1.5;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(ang) * tail, y - Math.sin(ang) * tail);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = `rgba(248,250,252,${0.9 * (1 - after)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + n.z * 2, 0, Math.PI * 2);
      ctx.fill();
      // A few links between neighbours keep it reading as a network, not dust.
      if (i % 3 === 0 && i + 1 < NODES.length) {
        const m = NODES[i + 1];
        const ml = Math.min(1, Math.max(0, (t - m.delay) / (1 - m.delay)));
        ctx.strokeStyle = `rgba(139,92,246,${0.18 * (1 - after)})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(lerp(m.x, CX, ml), lerp(m.y, CY, ml));
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }, [frame]);
  return <canvas ref={ref} width={1920} height={1080} style={{ position: "absolute", inset: 0 }} />;
};

export const S7Final: React.FC = () => {
  const frame = useCurrentFrame() + T.scenes.final[0];
  const logo = prog(frame, S.logo, S.logo + 26, ease.out);
  const k = hit(frame, S.logo, 16);
  const sh = shake(frame, k * 12, "s7");
  // The camera pulls back from the network as it converges, then holds.
  const pull = lerp(1.35, 1, prog(frame, S.converge[0], S.logo + 10, ease.inOut));
  const fade = prog(frame, S.fade[0], S.fade[1], ease.inOut);

  return (
    <AbsoluteFill style={{ background: C.void }}>
      <AbsoluteFill style={{ opacity: 1 - fade }}>
        <Camera scale={pull + k * 0.03} x={sh.x} y={sh.y} rotate={sh.r}>
          <Converge frame={frame} />
          <Particles frame={frame} opacity={0.45 * logo} count={140} color="196,181,253" drift={0.3} push={{ x: CX, y: CY, amount: k * 1.2 }} />
          {frame >= S.logo - 1 && (
            <AbsoluteFill style={{ display: "grid", placeContent: "center", justifyItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 40, transform: `scale(${lerp(1.18, 1, logo)})`, opacity: Math.min(1, logo * 3), marginTop: -60 }}>
                <LogoMark size={150} glow={0.7 + k} />
                <HeroText size={210} weight={800} tracking={`${lerp(0.2, 0.04, logo)}em`} glowAmount={0.8 + k} chroma={k * 10} sweep={prog(frame, S.sweep, S.sweep + 22, ease.inOut)}>
                  ROSETTA
                </HeroText>
              </div>
              <div style={{ marginTop: 46, display: "grid", justifyItems: "center", gap: 6 }}>
                {frame >= S.line1 && (
                  <MaskRise p={prog(frame, S.line1, S.line1 + 14)}>
                    <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 52, letterSpacing: "0.08em", color: C.text }}>CODE HAS VALUE.</div>
                  </MaskRise>
                )}
                {frame >= S.line2 && (
                  <MaskRise p={prog(frame, S.line2, S.line2 + 14)}>
                    <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 52, letterSpacing: "0.08em", color: C.violetSoft, textShadow: `0 0 30px ${C.violet}` }}>MAKE IT UNDERSTOOD.</div>
                  </MaskRise>
                )}
              </div>
            </AbsoluteFill>
          )}
        </Camera>
      </AbsoluteFill>
      <Flash amount={hit(frame, S.logo, 7) * 0.7} color="#EEE8FF" />
    </AbsoluteFill>
  );
};
