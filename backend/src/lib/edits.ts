import type { CardEdits, Explanation } from "./types";
import { LEVELS, type LevelKey } from "./levels";

/** Returns the explanation with the engineer's inline edits applied. */
export function applyEdits(explanation: Explanation, edits: CardEdits): Explanation {
  const levels = { ...explanation.levels };
  for (const [key, fields] of Object.entries(edits.levels ?? {})) {
    // Only real reading levels (never "__proto__" or other keys).
    if (!LEVELS.some((l) => l.key === key)) continue;
    const level = key as LevelKey;
    levels[level] = { ...levels[level], ...fields };
  }
  return { ...explanation, title: edits.title ?? explanation.title, levels };
}

export function hasEdits(edits: CardEdits) {
  return Boolean(edits.title) || Object.keys(edits.levels ?? {}).length > 0;
}
