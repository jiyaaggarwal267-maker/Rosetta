import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { feedItem } from "@/lib/cards";
import { json, preflight, route } from "@/lib/http";
import { drainDue, drainJobs } from "@/lib/jobs";
import { canSeeCard, cardOwner, descendants, orgMembers, personOf, requireOrg, teamOf, visibleAuthorIds } from "@/lib/org";
import { store } from "@/lib/store";
import { syncIsStale, syncOrg } from "@/lib/sync";
import type { Comment, StoredCard, Ticket } from "@/lib/types";

export const dynamic = "force-dynamic";
// Explaining, checking and one rewrite can take a couple of minutes (the Vercel Hobby maximum is 300 s).
export const maxDuration = 300;
export const OPTIONS = preflight;

const WEEK = 7 * 86_400_000;

/**
 * GET /api/feed?author=&team=&status=&q=&risk=&repo=&days=&offset=&limit=
 * The changes this person should see, at their reading level:
 * an engineer sees their own, a manager their team's, a CMO everyone's.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  const users = await orgMembers(org.id);
  const params = new URL(req.url).searchParams;

  // New pushes arrive without anyone pasting a link. Sync runs the explain
  // queue when it's done; otherwise the queue gets a turn on its own, at most once a minute.
  if (syncIsStale(org)) after(() => syncOrg(org, users).catch(() => {}));
  else if (drainDue(org.id)) after(() => drainJobs(org.id).catch(() => {}));

  const [cards, comments, tickets] = await Promise.all([
    store.list<StoredCard>("cards", "orgId", org.id),
    store.list<Comment>("comments", "orgId", org.id),
    store.list<Ticket>("tickets", "orgId", org.id),
  ]);

  const visible = cards.filter((c) => canSeeCard(me, c, users));
  const owner = (c: StoredCard) => cardOwner(c) ?? "";

  let filtered = visible;
  const author = params.get("author");
  const team = params.get("team");
  const status = params.get("status");
  // By who wrote it; a removed member's cards don't count as their manager's.
  if (author) filtered = filtered.filter((c) => (c.authorUserId ?? c.createdBy) === author);
  if (team) {
    const members = new Set([team, ...descendants(team, users).map((u) => u.id)]);
    filtered = filtered.filter((c) => members.has(owner(c)));
  }
  if (status === "draft" || status === "approved") filtered = filtered.filter((c) => c.status === status);

  // Search reads the viewer's own version, so a CMO can search in CMO words.
  const q = params.get("q")?.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((c) => {
      const l = c.explanation.levels[me.role];
      return [c.explanation.title, l.summary, l.impact, c.repo, c.author.name, ...c.explanation.files].some((t) => t?.toLowerCase().includes(q));
    });
  }
  const risk = params.get("risk");
  if (risk === "low" || risk === "medium" || risk === "high") filtered = filtered.filter((c) => c.explanation.risk === risk);
  const repo = params.get("repo")?.toLowerCase();
  if (repo) filtered = filtered.filter((c) => c.repo.toLowerCase() === repo);
  const days = Number(params.get("days"));
  if (days > 0) filtered = filtered.filter((c) => Date.now() - new Date(c.committedAt).getTime() < days * 86_400_000);

  const sorted = filtered.sort((a, b) => b.committedAt.localeCompare(a.committedAt));
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 20));
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const page = sorted.slice(offset, offset + limit);

  const items = page
    .map((c) =>
      feedItem(c, me, users, {
        comments: comments.filter((m) => m.cardId === c.id).length,
        openQuestions: tickets.filter((t) => t.context?.cardId === c.id && t.status !== "closed").length,
      }),
    );

  // People and teams to filter by: only those whose work this person can see.
  const visibleIds = visibleAuthorIds(me, users);
  const people = users
    .filter((u) => visibleIds.has(u.id) && u.id !== me.id && u.role !== "client" && u.role !== "cmo")
    .map((u) => personOf(u, users));
  const teams = users
    .filter((u) => u.role === "manager" && visibleIds.has(u.id))
    .map((u) => ({ id: u.id, name: personOf(u, users).team?.name ?? u.name, lead: u.name }));

  const now = Date.now();
  return json({
    items,
    page: { offset, limit, total: sorted.length, more: offset + limit < sorted.length },
    repos: [...new Set(visible.map((c) => c.repo))].sort(),
    people,
    teams,
    myTeam: teamOf(me, users) ? personOf(me, users).team : null,
    stats: {
      total: visible.length,
      thisWeek: visible.filter((c) => now - new Date(c.committedAt).getTime() < WEEK).length,
      notReviewed: visible.filter((c) => c.status === "draft").length,
      highRisk: visible.filter((c) => c.explanation.risk !== "low").length,
      openQuestions: tickets.filter((t) => (t.toId === me.id || t.fromId === me.id) && t.status !== "closed").length,
    },
    sync: { repos: org.repos.length, lastSyncAt: org.lastSyncAt ?? null },
  });
});
