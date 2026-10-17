import type { LevelKey } from "./levels";
import type { Explanation, FlowGraph, Risk } from "./types";

/**
 * The weekly report email: what each engineer shipped this week, every
 * change with its explanation, flowchart and worked example, written at the
 * reader's level (usually the CMO who owns the workspace).
 *
 * Email clients can't run the app's flowchart renderer, so flowcharts are
 * drawn as plain HTML tables: boxes in rows, arrows between them, branch
 * labels above the box they lead to, and loops written as "back to …".
 */

export type ReportItem = {
  explanation: Explanation;
  committedAt: string;
  status: "draft" | "approved";
  /** Opens the change in Rosetta; omitted for sample changes that aren't in the workspace. */
  url?: string;
};

export type ReportSection = { engineer: { name: string; title?: string }; items: ReportItem[] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const C = {
  abyss: "#0A1931",
  deep: "#1A3D63",
  steel: "#4A7FA7",
  mist: "#B3CFE5",
  paper: "#F6FAFD",
  muted: "#4A6785",
  line: "#D9E4EE",
  low: "#2E7D5B",
  medium: "#A86A12",
  high: "#B23B3B",
};
const RISK: Record<Risk, { word: string; color: string }> = {
  low: { word: "Low risk", color: C.low },
  medium: { word: "Medium risk", color: C.medium },
  high: { word: "High risk", color: C.high },
};
const ROLE_NOUN: Record<LevelKey, string> = {
  engineer: "an engineer",
  senior: "a senior developer",
  intern: "an intern",
  manager: "a manager",
  client: "a client",
  cmo: "the CMO",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/* ------------------------------------------------------------------ */
/* Flowchart as email-safe HTML                                        */
/* ------------------------------------------------------------------ */

function layers(g: FlowGraph) {
  const index = new Map(g.nodes.map((n, i) => [n.id, i]));
  const out = new Map<string, string[]>();
  for (const [from, to] of g.edges) out.set(from, [...(out.get(from) ?? []), to]);
  const incoming = new Set(g.edges.map(([, to]) => to));
  const starts = g.nodes.filter((n) => n.kind === "start" || !incoming.has(n.id)).map((n) => n.id);

  // Edges that go back to a step already on the path are loops ("back to …").
  const back = new Set<string>();
  const state = new Map<string, 1 | 2>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const next of out.get(id) ?? []) {
      if (state.get(next) === 1) back.add(`${id}>${next}`);
      else if (!state.has(next)) visit(next);
    }
    state.set(id, 2);
  };
  for (const s of starts.length ? starts : [g.nodes[0]?.id].filter(Boolean)) visit(s);
  for (const n of g.nodes) if (!state.has(n.id)) visit(n.id);

  // Longest path over forward edges gives each box its row.
  const forward = g.edges.filter(([a, b]) => !back.has(`${a}>${b}`));
  const level = new Map(g.nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < g.nodes.length; pass++) {
    let moved = false;
    for (const [a, b] of forward) {
      if ((level.get(a) ?? 0) + 1 > (level.get(b) ?? 0)) {
        level.set(b, (level.get(a) ?? 0) + 1);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const rows: string[][] = [];
  for (const n of g.nodes) (rows[level.get(n.id) ?? 0] ??= []).push(n.id);
  return { rows: rows.filter(Boolean).map((r) => r.sort((x, y) => (index.get(x) ?? 0) - (index.get(y) ?? 0))), back };
}

export function emailFlow(g: FlowGraph, labels: Record<string, string>, opts: { newKeys?: Set<string> } = {}) {
  const node = new Map(g.nodes.map((n) => [n.id, n]));
  const text = (key: string) => labels[key] ?? key.replace(/_/g, " ");
  const groupName = new Map((g.groups ?? []).map((gr) => [gr.id, text(gr.key)]));
  const { rows, back } = layers(g);

  const box = (id: string) => {
    const n = node.get(id)!;
    const kind = n.kind ?? "step";
    const style: Record<string, string> = {
      start: `background:#DCE8F3;color:${C.abyss};border-radius:999px;border:1px solid ${C.mist}`,
      end: `background:${C.abyss};color:${C.paper};border-radius:999px;border:1px solid ${C.abyss}`,
      step: `background:#FFFFFF;color:${C.abyss};border-radius:10px;border:1px solid ${C.mist}`,
      decision: `background:#FFF6E5;color:${C.abyss};border-radius:10px;border:1px dashed ${C.medium}`,
      data: `background:#EEF3F8;color:${C.abyss};border-radius:10px;border:3px double ${C.steel}`,
    };
    const into = g.edges.filter(([a, b, l]) => b === id && l && !back.has(`${a}>${b}`));
    const caption = into.length
      ? `<div style="font-size:11px;color:${C.muted};margin:0 0 4px">${into.map(([a, , l]) => `${esc(text(node.get(a)!.key))} → <b>${esc(text(l!))}</b>`).join("<br>")}</div>`
      : "";
    const loops = g.edges.filter(([a, b]) => a === id && back.has(`${a}>${b}`));
    const loopNote = loops.length
      ? `<div style="font-size:11px;color:${C.steel};margin:4px 0 0">${loops.map(([, b, l]) => `↺ back to “${esc(text(node.get(b)!.key))}”${l ? ` (${esc(text(l))})` : ""}`).join("<br>")}</div>`
      : "";
    const group = n.group && groupName.get(n.group) ? `<div style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:${C.steel};margin:0 0 4px">${esc(groupName.get(n.group)!)}</div>` : "";
    const isNew = opts.newKeys?.has(n.key) ? ` <span style="font-size:10px;font-weight:700;color:${C.low}">NEW</span>` : "";
    return `<td valign="top" align="center" style="padding:4px 6px">${caption}${group}<div style="${style[kind]};padding:10px 12px;font-size:13px;line-height:1.35;font-weight:${kind === "decision" ? 700 : 600};min-width:96px">${kind === "decision" ? "◆ " : ""}${esc(text(n.key))}${isNew}</div>${loopNote}</td>`;
  };

  const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  const arrow = `<tr><td align="center" style="font-size:16px;line-height:16px;color:${C.mist};padding:2px 0">↓</td></tr>`;
  const htmlRows = rows
    .flatMap((r) => chunk(r, 3))
    .map((r) => `<tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${r.map(box).join("")}</tr></table></td></tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};border-radius:12px;padding:12px 4px">${htmlRows.join(arrow)}</table>`;
}

/* ------------------------------------------------------------------ */
/* The email                                                           */
/* ------------------------------------------------------------------ */

function changeBlock(item: ReportItem, level: LevelKey, appUrl: string) {
  const e = item.explanation;
  const l = e.levels[level];
  const risk = RISK[e.risk];
  const v = e.verification;
  const trust = v
    ? v.checkedBy === "sample"
      ? "Checked by hand"
      : v.needsReview && item.status !== "approved"
        ? `Needs engineer review (${v.score}/100)`
        : `Checked against the code: ${v.confidence === "high" ? "High" : v.confidence === "medium" ? "Medium" : "Low"} (${v.score}/100)`
    : "";
  const before = e.flow.before;
  const beforeKeys = new Set(before?.nodes.map((n) => n.key) ?? []);
  const newKeys = before ? new Set(e.flow.after.nodes.map((n) => n.key).filter((k) => !beforeKeys.has(k))) : undefined;
  const beforeLine = before
    ? `<p style="margin:12px 0 6px;font-size:12px;color:${C.muted}"><b style="color:${C.deep}">Before:</b> ${before.nodes.map((n) => esc(l.labels[n.key] ?? n.key)).join(" → ")}</p>`
    : "";
  const walk =
    e.walkthrough && l.walkthrough?.steps.length
      ? `<p style="margin:16px 0 6px;font-size:13px;font-weight:700;color:${C.abyss}">${esc(l.walkthrough.title)}</p><ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.55;color:${C.deep}">${l.walkthrough.steps.map((s) => `<li style="margin:0 0 4px">${esc(s)}</li>`).join("")}</ol>`
      : "";
  const open = item.url
    ? `<p style="margin:16px 0 0"><a href="${esc(`${appUrl}${item.url}`)}" style="font-size:13px;font-weight:600;color:${C.steel}">Open it in Rosetta, ask why about any step →</a></p>`
    : "";

  return `<tr><td style="padding:0 0 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:14px;box-shadow:0 0 0 1px ${C.line};padding:22px">
<tr><td>
<p style="margin:0 0 6px;font-size:12px;color:${C.muted}">${esc(day(item.committedAt))} · <span style="color:${risk.color};font-weight:700">${risk.word}</span>${trust ? ` · ${esc(trust)}` : ""}${item.status === "approved" ? " · Reviewed by the engineer" : ""}</p>
<h2 style="margin:0 0 10px;font-size:19px;line-height:1.3;color:${C.abyss}">${esc(e.title)}</h2>
<p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:${C.abyss};font-weight:600">${esc(l.summary)}</p>
<p style="margin:0 0 10px;font-size:14px;line-height:1.55;color:${C.deep}"><i>Think of it like this:</i> ${esc(l.analogy)}</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${C.deep}"><b>What it means for you:</b> ${esc(l.impact)}</p>
<p style="margin:0 0 8px;font-size:13px;font-weight:700;color:${C.abyss}">How it works now</p>
${emailFlow(e.flow.after, l.labels, { newKeys })}
${beforeLine}
${walk}
${open}
</td></tr></table></td></tr>`;
}

export function buildReport(o: {
  orgName: string;
  reader: { name: string; role: LevelKey };
  sections: ReportSection[];
  range: { from: string; to: string };
  appUrl: string;
  sample?: boolean;
}) {
  const level = o.reader.role;
  const all = o.sections.flatMap((s) => s.items);
  const scored = all.map((i) => i.explanation.verification).filter((v) => v && v.checkedBy !== "sample");
  const avg = scored.length ? Math.round(scored.reduce((n, v) => n + v!.score, 0) / scored.length) : null;
  const reviewed = all.filter((i) => i.status === "approved").length;
  const risky = all.filter((i) => i.explanation.risk !== "low").length;
  const one = o.sections.length === 1 ? o.sections[0] : null;
  const firstName = (n: string) => n.split(" ")[0];

  const heading = one ? `${one.engineer.name}'s week at ${o.orgName}` : `Your engineers' week at ${o.orgName}`;
  const subject = one
    ? `${firstName(one.engineer.name)} shipped ${one.items.length} change${one.items.length === 1 ? "" : "s"} this week`
    : `This week at ${o.orgName}: ${all.length} change${all.length === 1 ? "" : "s"}`;
  const stat = (value: string, label: string) =>
    `<td align="center" style="padding:10px 6px;background:${C.paper};border-radius:10px"><div style="font-size:22px;font-weight:700;color:${C.abyss}">${value}</div><div style="font-size:11px;color:${C.muted}">${label}</div></td>`;

  const sectionsHtml = o.sections
    .map(
      (s) => `${one ? "" : `<tr><td style="padding:8px 0 14px"><h2 style="margin:0;font-size:18px;color:${C.abyss}">${esc(s.engineer.name)}${s.engineer.title ? ` <span style="font-size:13px;font-weight:400;color:${C.muted}">· ${esc(s.engineer.title)}</span>` : ""}</h2></td></tr>`}
${s.items.map((i) => changeBlock(i, level, o.appUrl)).join("")}`,
    )
    .join("");

  const list = all.map((i) => `<li style="margin:0 0 4px">${esc(i.explanation.title)}</li>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:${C.paper};font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px">
<tr><td style="padding:0 0 20px">
<p style="margin:0 0 18px;font-size:16px;font-weight:700;color:${C.abyss}">◐ Rosetta</p>
<p style="margin:0 0 4px;font-size:12px;color:${C.muted}">${esc(day(o.range.from))} to ${esc(day(o.range.to))} · written for ${esc(o.reader.name)}, as ${ROLE_NOUN[level]}</p>
<h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;color:${C.abyss}">${esc(heading)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${C.deep}">${one ? esc(firstName(one.engineer.name)) : "Your engineers"} shipped ${all.length} change${all.length === 1 ? "" : "s"}${reviewed ? `, ${reviewed} already reviewed` : ""}. Each change shows how well its AI explanation matched the code, and whether the engineer has reviewed it.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>${stat(String(all.length), "changes")}${stat(String(reviewed), "reviewed")}${stat(avg === null ? "–" : `${avg}/100`, "avg. check score")}${stat(String(risky), "need care")}</tr></table>
<p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:${C.abyss}">In this report</p>
<ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.5;color:${C.deep}">${list}</ol>
</td></tr>
${sectionsHtml}
<tr><td style="padding:4px 0 0">
<p style="margin:0 0 16px"><a href="${esc(`${o.appUrl}/app/digest`)}" style="display:inline-block;background:${C.abyss};color:${C.paper};text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px">See the week in Rosetta</a></p>
<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${C.muted}">Explanations are written by AI and can be wrong; open a change to see the code behind each step.</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:${C.muted}">You get this every Monday as the owner of ${esc(o.orgName)} on Rosetta.${o.sample ? " This copy uses a sample week prepared for demos." : ""}</p>
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    heading,
    `${day(o.range.from)} to ${day(o.range.to)}`,
    "",
    ...all.flatMap((i) => [
      `• ${i.explanation.title} (${RISK[i.explanation.risk].word})`,
      `  ${i.explanation.levels[level].summary}`,
      `  ${i.explanation.levels[level].impact}`,
      "",
    ]),
    `See the week: ${o.appUrl}/app/digest`,
  ].join("\n");

  return { subject, html, text };
}
