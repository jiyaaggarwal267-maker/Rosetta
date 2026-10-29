import { z } from "zod";
import { LEVELS, type LevelKey } from "../levels";
import type { Explanation, FlowEdge, FlowGraph, FlowNodeKind, LevelText, Walkthrough } from "../types";

/**
 * Gemini can't return maps with arbitrary keys, so labels come back as
 * [{ key, text }], edges as { from, to, label_key }. We convert to the app's
 * Explanation shape here and repair small mistakes.
 */

const S = (description?: string) => ({ type: "STRING", ...(description ? { description } : {}) });
const KINDS: FlowNodeKind[] = ["start", "step", "decision", "data", "end"];

const graphSchema = {
  type: "OBJECT",
  properties: {
    groups: {
      type: "ARRAY",
      description: "Optional boxes around related nodes, e.g. a server pool or a new module.",
      items: { type: "OBJECT", properties: { id: S("letters and digits only"), key: S("snake_case") }, required: ["id", "key"] },
    },
    nodes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: S("letters and digits only, e.g. a1"),
          key: S("snake_case step name, shared across levels"),
          kind: { type: "STRING", enum: KINDS },
          group: S("id of the group it sits in, or empty"),
        },
        required: ["id", "key", "kind"],
      },
    },
    edges: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { from: S(), to: S(), label_key: S("snake_case label key, or empty for no label") },
        required: ["from", "to"],
      },
    },
  },
  required: ["nodes", "edges"],
};

const levelSchema = {
  type: "OBJECT",
  properties: {
    summary: S("One sentence."),
    analogy: S("One sentence, an everyday comparison."),
    impact: S("One or two sentences on what changes for this reader."),
    labels: {
      type: "ARRAY",
      description: "Text for every node key, group key and edge label key, at most 6 words each.",
      items: { type: "OBJECT", properties: { key: S(), text: S() }, required: ["key", "text"] },
    },
    walkthrough_title: S("Title of the worked example at this level."),
    walkthrough_steps: {
      type: "ARRAY",
      description: "One sentence per walkthrough step, same count and order as walkthrough.steps.",
      items: S(),
    },
  },
  required: ["summary", "analogy", "impact", "labels", "walkthrough_title", "walkthrough_steps"],
};

export const explanationSchema = {
  type: "OBJECT",
  properties: {
    title: S("Plain-language title, at most 7 words, sentence case."),
    risk: { type: "STRING", enum: ["low", "medium", "high"] },
    riskReason: S("One short sentence on why this risk level."),
    flow: {
      type: "OBJECT",
      properties: {
        before: { ...graphSchema, nullable: true, description: "null when there was no meaningful before state" },
        after: graphSchema,
      },
      required: ["after"],
    },
    walkthrough: {
      type: "OBJECT",
      description: "A worked example with concrete values, traced through the after graph.",
      properties: {
        steps: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { path: { type: "ARRAY", items: S("after-graph node id"), description: "Nodes visited, in order" } },
            required: ["path"],
          },
        },
      },
      required: ["steps"],
    },
    levels: {
      type: "OBJECT",
      properties: Object.fromEntries(LEVELS.map((l) => [l.key, levelSchema])),
      required: LEVELS.map((l) => l.key),
    },
  },
  required: ["title", "risk", "riskReason", "flow", "walkthrough", "levels"],
};

const rawGraph = z.object({
  groups: z.array(z.object({ id: z.string(), key: z.string() })).default([]),
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      key: z.string().min(1),
      kind: z.enum(KINDS).catch("step"),
      group: z.string().optional(),
    }),
  ),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label_key: z.string().optional() })).default([]),
});

const rawLevel = z.object({
  summary: z.string().min(1),
  analogy: z.string().min(1),
  impact: z.string().min(1),
  labels: z.array(z.object({ key: z.string(), text: z.string() })).default([]),
  walkthrough_title: z.string().default(""),
  walkthrough_steps: z.array(z.string()).default([]),
});

const rawExplanation = z.object({
  title: z.string().min(1),
  risk: z.enum(["low", "medium", "high"]).catch("medium"),
  riskReason: z.string().optional(),
  flow: z.object({ before: rawGraph.nullable().optional(), after: rawGraph }),
  walkthrough: z.object({ steps: z.array(z.object({ path: z.array(z.string()) })) }).optional(),
  levels: z.object(Object.fromEntries(LEVELS.map((l) => [l.key, rawLevel])) as Record<LevelKey, typeof rawLevel>),
});

const keyOf = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "step";

/** Words Mermaid reads as flowchart syntax, so a node can't be called one. */
const MERMAID_WORDS = new Set(["end", "graph", "flowchart", "subgraph", "style", "class", "classdef", "click", "linkstyle", "direction", "default", "call", "href", "callback"]);

/** Mermaid edge ids are L_<from>_<to>_<n>, so node ids must be plain alphanumerics. */
const cleanId = (id: string, fallback: string) => {
  const clean = id.replace(/[^A-Za-z0-9]/g, "");
  if (MERMAID_WORDS.has(clean.toLowerCase())) return `${clean}Node`;
  return /^[A-Za-z]/.test(clean) ? clean : `${fallback}${clean}`;
};

function cleanGraph(raw: z.infer<typeof rawGraph>, prefix: string, maxNodes: number): { graph: FlowGraph; ids: Map<string, string> } {
  const used = new Set<string>();
  const unique = (id: string) => {
    let next = id;
    for (let n = 2; used.has(next); n++) next = `${id}x${n}`;
    used.add(next);
    return next;
  };

  const groupIds = new Map<string, string>();
  const groups = raw.groups.slice(0, 4).map((g, i) => {
    const id = unique(cleanId(g.id, `${prefix}g${i + 1}`));
    groupIds.set(g.id, id);
    return { id, key: keyOf(g.key) };
  });

  const ids = new Map<string, string>();
  const nodes = raw.nodes.slice(0, maxNodes).map((node, i) => {
    const id = unique(cleanId(node.id, `${prefix}${i + 1}`));
    ids.set(node.id, id);
    const group = node.group ? groupIds.get(node.group) : undefined;
    return { id, key: keyOf(node.key), kind: node.kind, ...(group ? { group } : {}) };
  });

  const seen = new Set<string>();
  const edges: FlowEdge[] = [];
  for (const e of raw.edges) {
    const from = ids.get(e.from);
    const to = ids.get(e.to);
    if (!from || !to || from === to || seen.has(`${from}>${to}`)) continue;
    seen.add(`${from}>${to}`);
    const label = e.label_key?.trim() ? keyOf(e.label_key) : "";
    edges.push(label ? [from, to, label] : [from, to]);
  }

  const usedGroups = groups.filter((g) => nodes.some((n) => n.group === g.id));
  return { graph: { nodes, edges, ...(usedGroups.length ? { groups: usedGroups } : {}) }, ids };
}

const humanize = (key: string) => {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Indexes of other levels, nearest first, preferring the simpler side. */
const nearest = (index: number) =>
  LEVELS.map((_, j) => j).sort((a, b) => Math.abs(a - index) - Math.abs(b - index) || b - a);

/** A graph's shape by step keys, ignoring ids: equal shapes mean "nothing visibly changed". */
function shape(g: FlowGraph) {
  const keyById = new Map(g.nodes.map((n) => [n.id, n.key]));
  const nodes = g.nodes.map((n) => `${n.key}:${n.kind ?? "step"}`).sort();
  const edges = g.edges.map(([a, b, l]) => `${keyById.get(a)}>${keyById.get(b)}:${l ?? ""}`).sort();
  return JSON.stringify([nodes, edges]);
}

export class SameFlowError extends Error {
  constructor() {
    super("Before and after flowcharts are identical");
  }
}

/**
 * Strict: identical before/after graphs are rejected so the model tries again.
 * Lenient (last resort): the before graph is dropped instead of showing two copies.
 */
export function parseExplanation(raw: unknown, { strict = true }: { strict?: boolean } = {}): Omit<Explanation, "files"> {
  const parsed = parseExplanationInner(raw);
  if (parsed.flow.before && shape(parsed.flow.before) === shape(parsed.flow.after)) {
    if (strict) throw new SameFlowError();
    return { ...parsed, flow: { before: null, after: parsed.flow.after } };
  }
  return parsed;
}

/**
 * Smaller models sometimes skip a level or two. A missing one borrows from
 * the nearest level on the same side (code readers or not), so a CMO never
 * gets engineer text. If a whole side is missing, parsing still fails.
 */
function fillMissingLevels(raw: unknown): unknown {
  const levels = (raw as { levels?: Record<string, unknown> } | null)?.levels;
  if (!levels || typeof levels !== "object") return raw;
  const ok = (key: LevelKey) => rawLevel.safeParse(levels[key]).success;
  const filled = { ...levels };
  LEVELS.forEach(({ key }, i) => {
    if (ok(key)) return;
    const technical = i < 3;
    const donor = nearest(i).find((j) => j < 3 === technical && ok(LEVELS[j].key));
    if (donor !== undefined) filled[key] = levels[LEVELS[donor].key];
  });
  return { ...(raw as object), levels: filled };
}

function parseExplanationInner(raw: unknown): Omit<Explanation, "files"> {
  const data = rawExplanation.parse(fillMissingLevels(raw));
  const beforeResult = data.flow.before?.nodes.length ? cleanGraph(data.flow.before, "b", 10) : null;
  const afterResult = cleanGraph(data.flow.after, "a", 14);
  if (!afterResult.graph.nodes.length) throw new Error("Flow has no after nodes");

  // Ids must not collide across the two panels.
  let before = beforeResult?.graph ?? null;
  if (before) {
    const afterIds = new Set(afterResult.graph.nodes.map((n) => n.id));
    if (before.nodes.some((n) => afterIds.has(n.id))) {
      const rename = new Map(before.nodes.map((n, i) => [n.id, `b${i + 1}`]));
      before = {
        ...before,
        nodes: before.nodes.map((n) => ({ ...n, id: rename.get(n.id)! })),
        edges: before.edges.map(([a, b, l]): FlowEdge => (l ? [rename.get(a)!, rename.get(b)!, l] : [rename.get(a)!, rename.get(b)!])),
      };
    }
  }
  const after = afterResult.graph;

  const graphs = [before, after].filter(Boolean) as FlowGraph[];
  const keys = [
    ...new Set(
      graphs.flatMap((g) => [
        ...g.nodes.map((n) => n.key),
        ...(g.groups ?? []).map((gr) => gr.key),
        ...g.edges.flatMap((e) => (e[2] ? [e[2]] : [])),
      ]),
    ),
  ];

  // Walkthrough: keep only steps whose path stays inside the after graph.
  const steps = (data.walkthrough?.steps ?? [])
    .map((s) => ({ path: s.path.map((id) => afterResult.ids.get(id)).filter((id): id is string => Boolean(id)) }))
    .filter((s) => s.path.length > 0)
    .slice(0, 6);

  const given = Object.fromEntries(
    LEVELS.map(({ key }) => [key, new Map(data.levels[key].labels.map((l) => [keyOf(l.key), l.text.trim()]))]),
  ) as Record<LevelKey, Map<string, string>>;
  // A missing label borrows from the nearest level, so the CMO never gets the engineer's words.
  const labelFor = (index: number, key: string) => {
    for (const j of nearest(index)) {
      const text = given[LEVELS[j].key].get(key);
      if (text) return text;
    }
    return humanize(key);
  };
  const stepText = (index: number, step: number) => {
    for (const j of nearest(index)) {
      const text = data.levels[LEVELS[j].key].walkthrough_steps[step]?.trim();
      if (text) return text;
    }
    return "";
  };
  const hasWalkthrough = steps.length > 0 && steps.every((_, i) => stepText(0, i));

  const levels = Object.fromEntries(
    LEVELS.map(({ key }, index) => {
      const level = data.levels[key];
      const text: LevelText = {
        summary: level.summary.trim(),
        analogy: level.analogy.trim(),
        impact: level.impact.trim(),
        labels: Object.fromEntries(keys.map((k) => [k, labelFor(index, k)])),
        ...(hasWalkthrough
          ? {
              walkthrough: {
                title: level.walkthrough_title.trim() || "Walk through an example",
                steps: steps.map((_, i) => stepText(index, i)),
              },
            }
          : {}),
      };
      return [key, text];
    }),
  ) as Record<LevelKey, LevelText>;

  const walkthrough: Walkthrough | undefined = hasWalkthrough ? { steps } : undefined;
  return {
    title: data.title.trim().replace(/\.$/, ""),
    risk: data.risk,
    riskReason: data.riskReason?.trim(),
    flow: { before, after },
    ...(walkthrough ? { walkthrough } : {}),
    levels,
  };
}

/** The app shape → the model's shape, for few-shot examples. */
export function toModelShape(explanation: Explanation) {
  const graph = (g: FlowGraph) => ({
    groups: g.groups ?? [],
    nodes: g.nodes.map((n) => ({ id: n.id, key: n.key, kind: n.kind ?? "step", group: n.group ?? "" })),
    edges: g.edges.map(([from, to, label]) => ({ from, to, label_key: label ?? "" })),
  });
  return {
    title: explanation.title,
    risk: explanation.risk,
    riskReason: explanation.riskReason,
    flow: { before: explanation.flow.before ? graph(explanation.flow.before) : null, after: graph(explanation.flow.after) },
    walkthrough: explanation.walkthrough ?? { steps: [] },
    levels: Object.fromEntries(
      LEVELS.map(({ key }) => {
        const l = explanation.levels[key];
        return [
          key,
          {
            summary: l.summary,
            analogy: l.analogy,
            impact: l.impact,
            labels: Object.entries(l.labels).map(([k, text]) => ({ key: k, text })),
            walkthrough_title: l.walkthrough?.title ?? "",
            walkthrough_steps: l.walkthrough?.steps ?? [],
          },
        ];
      }),
    ),
  };
}

/* Smaller tasks */

export const askSchema = {
  type: "OBJECT",
  properties: {
    answerable: { type: "BOOLEAN" },
    answer: S("The answer at the reader's level, empty when not answerable."),
    technical_question: S("The question rewritten for the engineer, empty when answerable."),
  },
  required: ["answerable", "answer", "technical_question"],
};

export const parseAsk = (raw: unknown) => {
  const r = z.object({ answerable: z.boolean(), answer: z.string(), technical_question: z.string() }).parse(raw);
  if (r.answerable && !r.answer.trim()) throw new Error("Empty answer");
  if (!r.answerable && !r.technical_question.trim()) throw new Error("Empty technical question");
  return r;
};

export const textSchema = { type: "OBJECT", properties: { text: S() }, required: ["text"] };
export const parseText = (raw: unknown) => {
  const { text } = z.object({ text: z.string().min(1) }).parse(raw);
  return text.trim();
};

/** One message rewritten for every level at once. */
export const levelsTextSchema = {
  type: "OBJECT",
  properties: Object.fromEntries(LEVELS.map((l) => [l.key, S()])),
  required: LEVELS.map((l) => l.key),
};
export const parseLevelsText = (raw: unknown) =>
  z.object(Object.fromEntries(LEVELS.map((l) => [l.key, z.string().min(1)])) as Record<LevelKey, z.ZodString>).parse(raw) as Record<
    LevelKey,
    string
  >;

/* ------------------------------------------------------------------ */
/* Repair: a model that skipped whole levels                          */
/* ------------------------------------------------------------------ */

/** Levels that are missing even after borrowing from neighbours: a whole side was skipped. */
export function missingLevels(raw: unknown): LevelKey[] {
  const levels = (fillMissingLevels(raw) as { levels?: Record<string, unknown> } | null)?.levels;
  if (!levels || typeof levels !== "object") return [];
  return LEVELS.map((l) => l.key).filter((key) => !rawLevel.safeParse(levels[key]).success);
}

/** Schema for just the missing levels. */
export const someLevelsSchema = (keys: LevelKey[]) => ({
  type: "OBJECT",
  properties: { levels: { type: "OBJECT", properties: Object.fromEntries(keys.map((k) => [k, levelSchema])), required: keys } },
  required: ["levels"],
});

/** Every key that needs a label, and how many walkthrough steps there are, from a raw answer. */
export function labelKeysOf(raw: unknown) {
  const r = raw as { flow?: { before?: z.infer<typeof rawGraph> | null; after?: z.infer<typeof rawGraph> }; walkthrough?: { steps?: unknown[] } };
  const keys = new Set<string>();
  for (const g of [r.flow?.before, r.flow?.after]) {
    if (!g) continue;
    for (const n of g.nodes ?? []) keys.add(n.key);
    for (const grp of g.groups ?? []) keys.add(grp.key);
    for (const e of g.edges ?? []) if (e.label_key) keys.add(e.label_key);
  }
  return { keys: [...keys], steps: r.walkthrough?.steps?.length ?? 0 };
}
