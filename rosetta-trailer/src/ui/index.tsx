import React from "react";
import { clamp, ease, lerp, prog } from "../anim";
import { C, F } from "../theme";

const U = C.ui;

/** Rosetta's mark: the same idea at two depths, deep water below, light above. */
export const LogoMark: React.FC<{ size: number; glow?: number }> = ({ size, glow = 0 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ filter: glow > 0 ? `drop-shadow(0 0 ${size * 0.25 * glow}px ${C.violet})` : undefined, flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" fill={U.steel} />
    <path d="M2 12a10 10 0 0 1 20 0Z" fill={U.paper} />
    <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(179,207,229,0.4)" strokeWidth="0.6" />
  </svg>
);

/** The Rosetta app window: dark glass top bar with the logo, workspace and tabs. */
export const AppWindow: React.FC<{
  width: number;
  height: number;
  tab?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ width, height, tab = "Team activity", children, style }) => (
  <div
    style={{
      width,
      height,
      borderRadius: 22,
      background: U.abyss,
      boxShadow: `0 0 0 1px ${U.ringStrong}, 0 40px 120px rgba(0,0,0,0.65), 0 0 90px ${C.violet}22`,
      overflow: "hidden",
      position: "relative",
      ...style,
    }}
  >
    <div style={{ height: 64, display: "flex", alignItems: "center", gap: 14, padding: "0 26px", background: "linear-gradient(180deg,#0f2a4d,#0c2240)", borderBottom: `1px solid ${U.ring}` }}>
      <LogoMark size={24} />
      <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 21, color: U.paper }}>Rosetta</span>
      <span style={{ fontFamily: F.sans, fontSize: 15, color: U.text3 }}>CodeCrunchers</span>
      <div style={{ flex: 1 }} />
      {["Team activity", "This week", "Questions"].map((t) => (
        <span
          key={t}
          style={{
            fontFamily: F.sans,
            fontWeight: 500,
            fontSize: 15,
            color: t === tab ? U.paper : U.mist,
            padding: "8px 16px",
            borderRadius: 999,
            background: t === tab ? U.surface1 : "transparent",
            boxShadow: t === tab ? `0 0 0 1px ${U.ring}` : undefined,
          }}
        >
          {t}
        </span>
      ))}
      <div style={{ width: 30, height: 30, borderRadius: 999, background: "#1A3D63", color: U.paper, fontFamily: F.sans, fontSize: 12, fontWeight: 600, display: "grid", placeItems: "center", marginLeft: 8 }}>
        NK
      </div>
    </div>
    <div style={{ position: "absolute", inset: "64px 0 0 0" }}>{children}</div>
  </div>
);

export const Pill: React.FC<{ children: React.ReactNode; tone?: string; style?: React.CSSProperties }> = ({ children, tone = U.mist, style }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 28,
      padding: "0 10px",
      borderRadius: 7,
      fontFamily: F.sans,
      fontSize: 14,
      fontWeight: 500,
      color: tone,
      background: `color-mix(in srgb, ${tone} 12%, transparent)`,
      ...style,
    }}
  >
    {children}
  </span>
);

export const RiskLow: React.FC = () => (
  <Pill tone={U.low}>
    <svg width="12" height="12" viewBox="0 0 12 12">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={i * 4.5} y={8 - i * 3} width="3" height={4 + i * 3} rx="1" fill="currentColor" opacity={i < 1 ? 1 : 0.3} />
      ))}
    </svg>
    Low
  </Pill>
);

/** "Explain a commit": the link pill and Explain button, as on the engineer's home. */
export const ExplainBox: React.FC<{ typed: string; pressed: number; width?: number }> = ({ typed, pressed, width = 620 }) => (
  <div style={{ width, padding: 28, borderRadius: 20, background: U.surface1, boxShadow: `0 0 0 1px ${U.ring}, 0 30px 80px rgba(0,0,0,0.5)` }}>
    <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 26, color: U.paper }}>Explain a commit</div>
    <div style={{ fontFamily: F.sans, fontSize: 15, color: U.mist, marginTop: 6 }}>Paste a commit or pull request link.</div>
    <div style={{ marginTop: 18, height: 60, borderRadius: 14, display: "flex", alignItems: "center", gap: 8, padding: 6, background: "rgba(20,47,79,0.7)", boxShadow: `0 0 0 1px ${U.ringStrong}` }}>
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", fontFamily: F.mono, fontSize: 18, fontWeight: 500, color: U.paper, padding: "0 14px" }}>
        {typed}
        <span style={{ opacity: pressed > 0 ? 0 : 1, color: C.violetSoft }}>▍</span>
      </div>
      <div
        style={{
          height: 48,
          padding: "0 22px",
          borderRadius: 11,
          display: "grid",
          placeItems: "center",
          fontFamily: F.sans,
          fontWeight: 600,
          fontSize: 17,
          background: U.paper,
          color: U.abyss,
          transform: `scale(${1 - 0.06 * Math.sin(clamp(pressed) * Math.PI)})`,
          boxShadow: pressed > 0 ? `0 0 ${30 * (1 - clamp(pressed))}px ${C.cyan}` : undefined,
        }}
      >
        Explain
      </div>
    </div>
  </div>
);

/** GitHub-style commit card with real diff lines from the sample change. */
export const CommitCard: React.FC<{ lines: number; width?: number; glow?: number }> = ({ lines, width = 620, glow = 0 }) => {
  const diff: [kind: "+" | "-" | " ", text: string][] = [
    [" ", "let current = -1;"],
    ["+", "export function pickNextServer() {"],
    ["+", "  current = (current + 1) % servers.length;"],
    ["+", "  return servers[current];"],
    ["+", "}"],
    ["-", "const upstream = servers[0];"],
    ["+", "const upstream = pickNextServer();"],
  ];
  return (
    <div style={{ width, borderRadius: 18, background: "#0B1A30", boxShadow: `0 0 0 1px ${U.ringStrong}, 0 30px 80px rgba(0,0,0,0.55), 0 0 ${60 * glow}px ${C.cyan}55`, overflow: "hidden" }}>
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${U.ring}`, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: C.cyan, boxShadow: `0 0 12px ${C.cyan}` }} />
        <span style={{ fontFamily: F.mono, fontSize: 15, color: C.cyan, letterSpacing: "0.12em" }}>COMMIT DETECTED</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: F.mono, fontSize: 15, color: U.text3 }}>a3f9c2e</span>
      </div>
      <div style={{ padding: "16px 22px 6px" }}>
        <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 21, color: U.paper }}>Spread traffic across three servers</div>
        <div style={{ fontFamily: F.mono, fontSize: 14, color: U.text3, marginTop: 6 }}>src/balancer.js · +18 −4</div>
      </div>
      <div style={{ padding: "8px 0 16px", fontFamily: F.mono, fontSize: 16, lineHeight: "28px" }}>
        {diff.map(([k, t], i) => {
          const p = clamp(lines - i);
          return (
            <div
              key={i}
              style={{
                opacity: p,
                transform: `translateX(${(1 - p) * -24}px)`,
                display: "flex",
                gap: 14,
                padding: "0 22px",
                background: k === "+" ? "rgba(111,194,160,0.11)" : k === "-" ? "rgba(232,133,126,0.11)" : "transparent",
              }}
            >
              <span style={{ width: 10, color: k === "+" ? U.low : k === "-" ? U.high : U.text3 }}>{k === " " ? "" : k === "-" ? "−" : "+"}</span>
              <span style={{ color: U.paper, whiteSpace: "pre" }}>{t}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** One reader's version of the change. */
export const ReaderCard: React.FC<{ label: string; tag: string; text: string; width: number; accent?: string; lit?: number }> = ({ label, tag, text, width, accent = C.violet, lit = 0 }) => (
  <div
    style={{
      width,
      padding: "22px 24px",
      borderRadius: 18,
      background: U.surface1,
      boxShadow: `0 0 0 1px ${lit > 0 ? accent : U.ring}, 0 24px 60px rgba(0,0,0,0.5), 0 0 ${50 * lit}px ${accent}44`,
    }}
  >
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 24, color: U.paper }}>{label}</span>
      <span style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", color: accent }}>{tag}</span>
    </div>
    <div style={{ marginTop: 10, fontFamily: F.sans, fontSize: 19, lineHeight: 1.45, color: U.mist }}>{text}</div>
  </div>
);

/* ------------------------------------------------------------------ */
/* The before/after flowchart (manager reading level)                  */
/* ------------------------------------------------------------------ */

type N = { key: string; label: string; kind: "start" | "step" | "decision" | "end" };
const NODES: Record<string, N> = {
  request: { key: "request", label: "A visitor arrives", kind: "start" },
  move: { key: "move", label: "Note whose turn it is", kind: "step" },
  pick: { key: "pick", label: "Whose turn?", kind: "decision" },
  a: { key: "a", label: "Server A", kind: "step" },
  b: { key: "b", label: "Server B", kind: "step" },
  c: { key: "c", label: "Server C", kind: "step" },
  response: { key: "response", label: "Page shown", kind: "end" },
};
const BEFORE: Record<string, [number, number]> = { request: [110, 210], a: [470, 90], b: [470, 210], c: [470, 330], response: [860, 210] };
const AFTER: Record<string, [number, number]> = { request: [100, 210], move: [345, 210], pick: [555, 210], a: [750, 80], b: [750, 210], c: [750, 340], response: [930, 210] };

/**
 * `m` 0 → 1 morphs BEFORE into AFTER; `trace` 0 → 1 lights the walkthrough
 * path (visitor 1 → Server A).
 */
export const FlowChart: React.FC<{ m: number; trace: number; scale?: number }> = ({ m, trace, scale = 1 }) => {
  const pos = (k: string): [number, number] => {
    const a = BEFORE[k] ?? AFTER[k];
    const b = AFTER[k] ?? BEFORE[k];
    return [lerp(a[0], b[0], ease.inOut(m)), lerp(a[1], b[1], ease.inOut(m))];
  };
  const newOnes = new Set(["move", "pick"]);
  const label = (k: string) => {
    if (m < 0.5 && (k === "b" || k === "c")) return `${NODES[k].label} unused`;
    return NODES[k].label;
  };
  const appear = (k: string) => (newOnes.has(k) ? clamp((m - 0.35) / 0.5) : 1);
  const PATH = ["request", "move", "pick", "a", "response"];
  const lit = (i: number) => clamp(trace * PATH.length - i);

  const beforeEdges: [string, string, string?][] = [
    ["request", "a", "everyone"],
    ["a", "response"],
  ];
  const afterEdges: [string, string, string?][] = [
    ["request", "move"],
    ["move", "pick"],
    ["pick", "a", "1st, 4th, 7th…"],
    ["pick", "b", "2nd, 5th, 8th…"],
    ["pick", "c", "3rd, 6th, 9th…"],
    ["a", "response"],
    ["b", "response"],
    ["c", "response"],
  ];
  const W = 1010;
  const H = 420;
  const box = (k: string) => {
    const n = NODES[k];
    const w = n.kind === "decision" ? 150 : Math.max(112, label(k).length * 9.6 + 30);
    return { w, h: n.kind === "decision" ? 110 : 56 };
  };
  const edge = (from: string, to: string, text: string | undefined, o: number, i: number, glowing: number) => {
    const [x1, y1] = pos(from);
    const [x2, y2] = pos(to);
    const bf = box(from);
    const bt = box(to);
    const sx = x1 + bf.w / 2;
    const ex = x2 - bt.w / 2;
    const mx = (sx + ex) / 2;
    const d = `M ${sx} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${ex} ${y2}`;
    return (
      <g key={`${from}-${to}-${i}`} opacity={o}>
        <path d={d} fill="none" stroke={glowing > 0 ? C.cyan : "rgba(179,207,229,0.45)"} strokeWidth={glowing > 0 ? 3 : 1.6} style={glowing > 0 ? { filter: `drop-shadow(0 0 6px ${C.cyan})` } : undefined} />
        {text && (
          <text x={mx} y={(y1 + y2) / 2 - 10} textAnchor="middle" fontFamily={F.sans} fontSize={13} fill={U.text3}>
            {text}
          </text>
        )}
      </g>
    );
  };
  return (
    <svg width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      {beforeEdges.map(([f, t, l], i) => edge(f, t, l, 1 - clamp(m * 2), i, 0))}
      {afterEdges.map(([f, t, l], i) => {
        const idxF = PATH.indexOf(f);
        const onPath = idxF >= 0 && PATH[idxF + 1] === t;
        return edge(f, t, l, clamp((m - 0.4) / 0.4), i, onPath ? lit(idxF + 1) : 0);
      })}
      {Object.keys(NODES).map((k) => {
        const [x, y] = pos(k);
        const n = NODES[k];
        const { w, h } = box(k);
        const o = appear(k);
        if (o <= 0) return null;
        const pathIdx = PATH.indexOf(k);
        const on = pathIdx >= 0 ? lit(pathIdx) : 0;
        const isNew = newOnes.has(k);
        const idle = m < 0.5 && (k === "b" || k === "c");
        const stroke = on > 0 ? C.cyan : isNew ? C.violet : "rgba(179,207,229,0.4)";
        const fill = n.kind === "end" ? U.paper : n.kind === "start" ? "#1C3E66" : n.kind === "decision" ? "#2A2347" : U.surface2;
        const color = n.kind === "end" ? U.abyss : U.paper;
        const glow = on > 0 ? `drop-shadow(0 0 ${14 * on}px ${C.cyan})` : isNew ? `drop-shadow(0 0 12px ${C.violet}aa)` : undefined;
        return (
          <g key={k} opacity={o * (idle ? 0.45 : 1)} transform={`translate(${x} ${y}) scale(${0.85 + 0.15 * o})`} style={{ filter: glow }}>
            {n.kind === "decision" ? (
              <polygon points={`0,${-h / 2} ${w / 2},0 0,${h / 2} ${-w / 2},0`} fill={fill} stroke={stroke} strokeWidth={2} />
            ) : (
              <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={n.kind === "step" ? 12 : h / 2} fill={fill} stroke={stroke} strokeWidth={2} />
            )}
            <text textAnchor="middle" dominantBaseline="central" fontFamily={F.sans} fontWeight={600} fontSize={n.kind === "decision" ? 16 : 17} fill={color}>
              {label(k)}
            </text>
            {isNew && m > 0.6 && (
              <text y={-h / 2 - 12} textAnchor="middle" fontFamily={F.mono} fontSize={12} letterSpacing="0.14em" fill={C.violetSoft}>
                NEW
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

/** A message bubble in a question thread. */
export const Bubble: React.FC<{ who: string; role: string; text: string; mono?: boolean; accent?: string; width?: number; mine?: boolean }> = ({
  who,
  role,
  text,
  mono = false,
  accent = U.steel,
  width = 560,
  mine = false,
}) => (
  <div style={{ width }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexDirection: mine ? "row-reverse" : "row" }}>
      <div style={{ width: 38, height: 38, borderRadius: 999, background: mine ? "#1A3D63" : U.surface2, boxShadow: `0 0 0 1px ${U.ringStrong}`, color: U.paper, display: "grid", placeItems: "center", fontFamily: F.sans, fontWeight: 600, fontSize: 14 }}>
        {who
          .split(" ")
          .map((w) => w[0])
          .join("")}
      </div>
      <div style={{ fontFamily: F.sans, fontSize: 16, color: U.mist, textAlign: mine ? "right" : "left" }}>
        <span style={{ color: U.paper, fontWeight: 600 }}>{who}</span> · {role}
      </div>
    </div>
    <div
      style={{
        padding: "18px 22px",
        borderRadius: 18,
        background: mine ? U.surface2 : U.surface1,
        boxShadow: `0 0 0 1px ${accent}, 0 20px 50px rgba(0,0,0,0.45), 0 0 40px ${accent}33`,
        fontFamily: mono ? F.mono : F.sans,
        fontSize: mono ? 19 : 22,
        lineHeight: 1.45,
        color: U.paper,
      }}
    >
      {text}
    </div>
  </div>
);

export { prog };
