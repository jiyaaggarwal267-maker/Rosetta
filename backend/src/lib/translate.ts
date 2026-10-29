import { aiConfigured } from "./ai/provider";
import { translateForLevels } from "./ai/tasks";
import { scriptedTranslation } from "./demo/pitch-script";
import type { LevelKey } from "./levels";
import type { Translated } from "./types";

/** Every number in a text: 3, 3x, 60s, 2.5, 10% … */
const numbersIn = (s: string) => new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".")));

/**
 * Fact guard: a rewrite that mentions a number the original never did has
 * added a fact, so that version is thrown away. The reader then gets the
 * nearest clean level instead.
 */
export function guard(original: string, versions: Partial<Record<LevelKey, string>>) {
  const allowed = numbersIn(original);
  const clean: Partial<Record<LevelKey, string>> = {};
  for (const [level, text] of Object.entries(versions) as [LevelKey, string][]) {
    const added = [...numbersIn(text)].filter((n) => !allowed.has(n));
    if (added.length) console.warn(`[rosetta] translate: dropped ${level} version (added ${added.join(", ")})`);
    else clean[level] = text;
  }
  return clean;
}

/**
 * Stores the original plus a version for every level (best effort: no AI key, no versions).
 * `orgId` is the workspace whose share of the AI quota pays for it.
 */
export async function translated(text: string, authorName: string, context?: string, orgId?: string): Promise<Translated> {
  // The pitch's live question and answer: the same versions every time, no AI needed.
  const scripted = scriptedTranslation(text);
  if (scripted) return { text, ...scripted };
  if (!aiConfigured()) return { text };
  try {
    const result = await translateForLevels(text, authorName, context, orgId);
    return { text, levels: guard(text, result.levels), hinglish: guard(text, result.hinglish) };
  } catch {
    return { text };
  }
}

const ORDER: LevelKey[] = ["engineer", "senior", "intern", "manager", "client", "cmo"];

/** What one reader sees: their level's version (Hinglish if they chose it), or the nearest clean one. */
export const display = (t: Translated, level: LevelKey, language: "en" | "hinglish" = "en") => {
  let text = (language === "hinglish" && t.hinglish?.[level]) || t.levels?.[level];
  if (!text && t.levels) {
    // A version the fact guard dropped: borrow the nearest level, simpler side first.
    const i = ORDER.indexOf(level);
    const near = [...ORDER].sort((a, b) => Math.abs(ORDER.indexOf(a) - i) - Math.abs(ORDER.indexOf(b) - i) || ORDER.indexOf(b) - ORDER.indexOf(a));
    text = near.map((l) => t.levels?.[l]).find(Boolean);
  }
  text ??= t.text;
  return { text, original: t.text, translated: text !== t.text };
};

/** After a failed try, an item isn't tried again for this long, so every view doesn't retry a failing provider. */
const RETRY_AFTER_MS = 10 * 60_000;
const failedAt = new Map<string, number>();
const itemKey = (i: Translated & { id?: string }) => i.id ?? i.text;

/**
 * Fills in level versions for items written while no AI key was set.
 * Returns true when anything changed, so the caller can save.
 */
export async function backfill<T extends Translated & { authorId: string; id?: string }>(
  items: T[],
  nameOf: (authorId: string) => string,
  context?: string,
  limit = 4,
  orgId?: string,
) {
  const now = Date.now();
  const missing = items
    .filter((i) => !i.levels && (aiConfigured() || scriptedTranslation(i.text)) && now - (failedAt.get(itemKey(i)) ?? 0) > RETRY_AFTER_MS)
    .slice(0, limit);
  if (!missing.length) return false;
  const results = await Promise.all(missing.map((i) => translated(i.text, nameOf(i.authorId), context, orgId ?? (i as { orgId?: string }).orgId)));
  let changed = false;
  missing.forEach((item, n) => {
    if (results[n].levels) {
      item.levels = results[n].levels;
      item.hinglish = results[n].hinglish;
      failedAt.delete(itemKey(item));
      changed = true;
    } else {
      failedAt.set(itemKey(item), now);
    }
  });
  // Keep the map small.
  if (failedAt.size > 2_000) for (const [k, t] of failedAt) if (now - t > RETRY_AFTER_MS) failedAt.delete(k);
  return changed;
}

/** Adds level versions to one stored message after the response has gone out. */
export async function translateTicketMessageLater(ticketId: string, messageId: string, authorName: string, context?: string) {
  const { store } = await import("./store");
  const ticket = await store.get<import("./types").Ticket>("tickets", ticketId);
  const message = ticket?.messages.find((m) => m.id === messageId);
  if (!ticket || !message || message.levels) return;
  const result = await translated(message.text, authorName, context, ticket.orgId);
  if (!result.levels) return;
  // Re-read: someone may have replied while we were translating.
  const fresh = await store.get<import("./types").Ticket>("tickets", ticketId);
  const target = fresh?.messages.find((m) => m.id === messageId);
  if (!fresh || !target || target.levels) return;
  target.levels = result.levels;
  target.hinglish = result.hinglish;
  await store.set("tickets", ticketId, fresh);
}

export async function translateCommentLater(commentId: string, authorName: string, context?: string) {
  const { store } = await import("./store");
  const comment = await store.get<import("./types").Comment>("comments", commentId);
  if (!comment || comment.levels) return;
  const result = await translated(comment.text, authorName, context, comment.orgId);
  if (!result.levels) return;
  // Re-read: the comment may have been edited or deleted while we were translating.
  const fresh = await store.get<import("./types").Comment>("comments", commentId);
  if (!fresh || fresh.levels || fresh.text !== comment.text) return;
  await store.set("comments", commentId, { ...fresh, levels: result.levels, hinglish: result.hinglish });
}

/** What one person sees of a message: their own words as written, anyone else's at their level. */
export const displayFor = (t: Translated & { authorId: string }, me: { id: string; role: LevelKey; language: "en" | "hinglish" }) =>
  t.authorId === me.id ? { text: t.text, original: t.text, translated: false } : display(t, me.role, me.language);
