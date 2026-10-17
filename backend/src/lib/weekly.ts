import { cardIdFor } from "./cards";
import { PITCH, pitchExplanation } from "./demo/pitch";
import { SAMPLES } from "./demo/samples";
import { env } from "./env";
import { isTechnical } from "./org";
import { buildReport, type ReportItem, type ReportSection } from "./report";
import { store } from "./store";
import type { Org, StoredCard, User } from "./types";

const DAY = 86_400_000;
export const WEEK = 7 * DAY;

const owner = (c: StoredCard) => c.authorUserId ?? c.createdBy ?? "";

/** One engineer's real week: their changes from the last 7 days, oldest first. */
export function realItems(cards: StoredCard[], engineerId: string, now = Date.now()): ReportItem[] {
  return cards
    .filter((c) => owner(c) === engineerId && now - new Date(c.committedAt).getTime() < WEEK)
    .sort((a, b) => a.committedAt.localeCompare(b.committedAt))
    .map((c) => ({ explanation: c.explanation, committedAt: c.committedAt, status: c.status, url: `/app/c/${c.id}` }));
}

/**
 * A full week for demos: the pitch commit plus the three samples, spread over
 * the week. Links go to the workspace's own copies when they exist.
 */
export async function sampleItems(org: Org, now = Date.now()): Promise<ReportItem[]> {
  const link = async (repo: string, sha: string) => {
    const [o, r] = repo.split("/");
    const id = cardIdFor(org.id, { owner: o, repo: r, kind: "commit", sha });
    return (await store.get<StoredCard>("cards", id)) ? `/app/c/${id}` : undefined;
  };
  const byKey = Object.fromEntries(SAMPLES.map((s) => [s.key, s]));
  const plan = [
    { e: byKey["round-robin"].card.explanation, repo: byKey["round-robin"].card.repo, sha: byKey["round-robin"].sha, daysAgo: 5, status: "approved" as const },
    { e: byKey.caching.card.explanation, repo: byKey.caching.card.repo, sha: byKey.caching.sha, daysAgo: 4, status: "approved" as const },
    { e: byKey.retry.card.explanation, repo: byKey.retry.card.repo, sha: byKey.retry.sha, daysAgo: 2, status: "draft" as const },
    { e: pitchExplanation(), repo: PITCH.repo, sha: PITCH.sha, daysAgo: 1, status: "approved" as const },
  ];
  return Promise.all(
    plan.map(async (p) => ({
      explanation: p.e,
      committedAt: new Date(now - p.daysAgo * DAY).toISOString(),
      status: p.status,
      url: await link(p.repo, p.sha),
    })),
  );
}

/** Builds the report for the workspace owner. engineerId "all" gives one section per engineer with changes. */
export async function reportFor(o: { org: Org; users: User[]; cards: StoredCard[]; engineerId: string; sample: boolean; now?: number }) {
  const now = o.now ?? Date.now();
  const reader = o.users.find((u) => u.id === o.org.ownerId);
  if (!reader) return null;
  const engineers = o.users.filter((u) => isTechnical(u.role));
  const chosen = o.engineerId === "all" ? engineers : engineers.filter((u) => u.id === o.engineerId);

  let sections: ReportSection[];
  if (o.sample) {
    const who = chosen[0] ?? engineers[0];
    sections = [{ engineer: { name: who?.name ?? "Arjun Mehta", title: who?.title }, items: await sampleItems(o.org, now) }];
  } else {
    sections = chosen.map((u) => ({ engineer: { name: u.name, title: u.title }, items: realItems(o.cards, u.id, now) })).filter((s) => s.items.length);
  }
  if (!sections.length) return { reader, report: null };

  const report = buildReport({
    orgName: o.org.name,
    reader: { name: reader.name, role: reader.role },
    sections,
    range: { from: new Date(now - WEEK).toISOString(), to: new Date(now).toISOString() },
    appUrl: env.appUrl,
    sample: o.sample,
  });
  return { reader, report };
}
