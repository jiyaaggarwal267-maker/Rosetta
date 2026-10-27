import type { CardEdits, Explanation } from "./types";
import type { LevelKey } from "./levels";

/** Returns the explanation with the engineer's inline edits applied. */
export function applyEdits(explanation: Explanation, edits: CardEdits): Explanation {
  const levels = { ...explanation.levels };
  for (const [key, fields] of Object.entries(edits.levels ?? {})) {
    const level = key as LevelKey;
    // Only levels this reader was sent can be edited.
    const current = levels[level];
    if (current) levels[level] = { ...current, ...fields };
  }
  return { ...explanation, title: edits.title ?? explanation.title, levels };
}

export function hasEdits(edits: CardEdits) {
  return Boolean(edits.title) || Object.keys(edits.levels ?? {}).length > 0;
}
