import type { FlowGraph, FlowNode } from "./types";

/** After-nodes whose step didn't exist before: drawn with a 2px Steel border. */
export function changedNodeIds(before: FlowGraph | null, after: FlowGraph) {
  if (!before) return new Set<string>();
  const beforeKeys = new Set(before.nodes.map((n) => n.key));
  return new Set(after.nodes.filter((n) => !beforeKeys.has(n.key)).map((n) => n.id));
}

/** Words Mermaid reads as syntax. Cards saved before the server renamed them still use them as ids. */
const MERMAID_WORDS = new Set(["end", "graph", "flowchart", "subgraph", "style", "class", "classdef", "click", "linkstyle", "direction", "default", "call", "href", "callback"]);

/** The id a node or group gets in the Mermaid text. */
export const mermaidId = (id: string) => (MERMAID_WORDS.has(id.toLowerCase()) ? `${id}Node` : id);

const esc = (text: string) =>
  text.replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;").replace(/`/g, "'").replace(/\|/g, "/");

/** Shape by kind: start/end pill, decision diamond, data cylinder, step box. */
function nodeLine(node: FlowNode, label: string) {
  const l = `"${esc(label)}"`;
  const id = mermaidId(node.id);
  switch (node.kind) {
    case "start":
    case "end":
      return `${id}([${l}])`;
    case "decision":
      return `${id}{${l}}`;
    case "data":
      return `${id}[(${l})]`;
    default:
      return `${id}[${l}]`;
  }
}

/** Our JSON → Mermaid text. The model never writes Mermaid. */
export function toMermaid(graph: FlowGraph, labels: Record<string, string>, changed: Set<string>, direction: "LR" | "TD") {
  const label = (key: string) => labels[key] ?? key.replace(/_/g, " ");
  const lines = [`flowchart ${direction}`];

  const grouped = new Set<string>();
  for (const group of graph.groups ?? []) {
    const members = graph.nodes.filter((n) => n.group === group.id);
    if (!members.length) continue;
    lines.push(`  subgraph ${mermaidId(group.id)}["${esc(label(group.key))}"]`);
    lines.push(`    direction ${direction === "LR" ? "TB" : "LR"}`);
    for (const n of members) {
      lines.push(`    ${nodeLine(n, label(n.key))}`);
      grouped.add(n.id);
    }
    lines.push("  end");
  }
  for (const n of graph.nodes) if (!grouped.has(n.id)) lines.push(`  ${nodeLine(n, label(n.key))}`);

  for (const [from, to, labelKey] of graph.edges) {
    const [a, b] = [mermaidId(from), mermaidId(to)];
    lines.push(labelKey ? `  ${a} -->|"${esc(label(labelKey))}"| ${b}` : `  ${a} --> ${b}`);
  }
  const changedIds = graph.nodes.filter((n) => changed.has(n.id)).map((n) => mermaidId(n.id));
  if (changedIds.length) lines.push(`  class ${changedIds.join(",")} changed`);
  return lines.join("\n");
}

/** Nodes in reading order (breadth-first from the roots), for the text version. */
export function orderedNodes(graph: FlowGraph) {
  const incoming = new Set(graph.edges.map(([, to]) => to));
  const queue = graph.nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id);
  if (!queue.length && graph.nodes[0]) queue.push(graph.nodes[0].id);
  const seen = new Set<string>();
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const [from, to] of graph.edges) if (from === id && !seen.has(to)) queue.push(to);
  }
  for (const n of graph.nodes) if (!seen.has(n.id)) order.push(n.id);
  return order.map((id) => graph.nodes.find((n) => n.id === id)!);
}

export const nextNodes = (graph: FlowGraph, id: string) =>
  graph.edges
    .filter(([from]) => from === id)
    .map(([, to, labelKey]) => ({ node: graph.nodes.find((n) => n.id === to)!, labelKey }));

/** Consecutive pairs of a walkthrough path, as "from>to". */
export const pathEdges = (path: string[]) => new Set(path.slice(1).map((to, i) => `${path[i]}>${to}`));
