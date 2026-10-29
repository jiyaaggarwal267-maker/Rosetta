import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, route } from "@/lib/http";
import { canSeeCard, cardOwner, isTechnical, orgMembers, personOf, requireOrg } from "@/lib/org";
import { store } from "@/lib/store";
import type { Comment, Risk, StoredCard, Ticket } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const DAY = 86_400_000;
const RISK_ORDER: Record<Risk, number> = { high: 0, medium: 1, low: 2 };

/**
 * GET /api/digest?week=0 → the week in one page, at the reader's level.
 * week=0 is the last 7 days, week=1 the 7 before that. No AI: it's a
 * summary of what's already written, so it costs nothing and never fails.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  if (isTechnical(me.role)) throw new ApiError("forbidden", "The weekly digest is for managers, clients and the CMO.");
  const org = await requireOrg(me);
  const users = await orgMembers(org.id);
  const week = Math.min(12, Math.max(0, Number(new URL(req.url).searchParams.get("week")) || 0));
  const to = Date.now() - week * 7 * DAY;
  const from = to - 7 * DAY;
  const inWeek = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= from && t < to;
  };

  const [cards, comments, tickets] = await Promise.all([
    store.list<StoredCard>("cards", "orgId", org.id),
    store.list<Comment>("comments", "orgId", org.id),
    store.list<Ticket>("tickets", "orgId", org.id),
  ]);
  const visible = cards.filter((c) => canSeeCard(me, c, users));
  const changes = visible.filter((c) => inWeek(c.committedAt));
  const ids = new Set(visible.map((c) => c.id));
  const owner = (c: StoredCard) => cardOwner(c) ?? "";

  const reviewed = changes.filter((c) => c.status === "approved");
  const risky = changes.filter((c) => c.explanation.risk !== "low");
  const flagged = changes.filter((c) => (c.explanation.verification?.needsReview || c.explanation.verification?.checkedBy === "code") && c.status !== "approved");
  const reported = changes.filter((c) => (c.reports ?? 0) > 0);
  const myTickets = tickets.filter((t) => t.fromId === me.id || t.toId === me.id);
  const asked = myTickets.filter((t) => inWeek(t.createdAt));
  const waiting = myTickets.filter((t) => t.fromId === me.id && t.status === "open" && Date.now() - new Date(t.updatedAt).getTime() > DAY);

  const line = (c: StoredCard) => {
    const level = c.explanation.levels[me.role];
    const author = users.find((u) => u.id === owner(c));
    return {
      id: c.id,
      title: c.explanation.title,
      summary: level.summary,
      impact: level.impact,
      risk: c.explanation.risk,
      status: c.status,
      committedAt: c.committedAt,
      author: author ? personOf(author, users) : null,
      authorName: author?.name ?? c.author.name,
      confidence: c.explanation.verification ? { score: c.explanation.verification.score, level: c.explanation.verification.confidence } : null,
    };
  };

  const highlights = [...changes]
    .sort((a, b) => RISK_ORDER[a.explanation.risk] - RISK_ORDER[b.explanation.risk] || b.committedAt.localeCompare(a.committedAt))
    .slice(0, 6)
    .map(line);

  const attention = [
    ...flagged.map((c) => ({ ...line(c), reason: "Rosetta's check scored this low. Wait for the engineer's review." })),
    ...risky.filter((c) => c.status !== "approved" && !flagged.includes(c)).map((c) => ({ ...line(c), reason: `${c.explanation.risk === "high" ? "High" : "Medium"} risk and not reviewed yet.` })),
    ...reported.filter((c) => !flagged.includes(c)).map((c) => ({ ...line(c), reason: `${c.reports} reader${c.reports === 1 ? "" : "s"} reported a possible mistake.` })),
  ].slice(0, 6);

  const byPerson = new Map<string, { changes: number; reviewed: number }>();
  for (const c of changes) {
    const p = byPerson.get(owner(c)) ?? { changes: 0, reviewed: 0 };
    p.changes++;
    if (c.status === "approved") p.reviewed++;
    byPerson.set(owner(c), p);
  }
  const people = [...byPerson.entries()]
    .map(([id, n]) => ({ person: users.find((u) => u.id === id), ...n }))
    .filter((p) => p.person)
    .map((p) => ({ person: personOf(p.person!, users), changes: p.changes, reviewed: p.reviewed }))
    .sort((a, b) => b.changes - a.changes);

  const n = changes.length;
  const headline =
    n === 0
      ? "A quiet week: no new changes."
      : `${n} change${n === 1 ? "" : "s"} this week, ${reviewed.length} reviewed by the engineer who made ${n === 1 ? "it" : "them"}.` +
        (attention.length ? ` ${attention.length} need${attention.length === 1 ? "s" : ""} your attention.` : " Nothing needs your attention.");

  return json({
    org: { name: org.name },
    range: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), week },
    headline,
    stats: {
      changes: n,
      reviewed: reviewed.length,
      risky: risky.length,
      questions: asked.length,
      comments: comments.filter((c) => c.cardId && ids.has(c.cardId) && inWeek(c.createdAt)).length,
    },
    highlights,
    attention,
    people,
    waiting: waiting.map((t) => ({ id: t.id, subject: t.subject, to: personOf(users.find((u) => u.id === t.toId) ?? me, users), since: t.updatedAt })),
  });
});
