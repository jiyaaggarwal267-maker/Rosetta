import { listAuthorCommits, listRepoComments, repoGone } from "./github";
import { drainJobs, enqueue } from "./jobs";
import { isTechnical } from "./org";
import { store } from "./store";
import { translated } from "./translate";
import type { Comment, Org, StoredCard, User } from "./types";

const FIRST_SYNC_DAYS = 14;
/** Feeds trigger a background sync when the last one is older than this. */
export const SYNC_STALE_MS = 5 * 60_000;
/**
 * No new commit is started after this long: one can take a couple of minutes,
 * and the function is stopped at 300 s. What's left stays queued for the next run.
 */
export const SYNC_BUDGET_MS = 150_000;
/** How long a running sync holds the workspace; outlives the 300 s function limit. */
const LOCK_MS = 6 * 60_000;

const syncing = new Set<string>();

const iso = (t: number) => new Date(t).toISOString();

/** The earliest time something was left undone; the cursor never moves past it. */
function leftover() {
  let at: number | undefined;
  return {
    leave: (when: string) => {
      const t = Date.parse(when);
      if (!Number.isNaN(t)) at = at === undefined ? t : Math.min(at, t);
    },
    // A second early, since GitHub's timestamps have whole seconds and comments compare with ">".
    get cursor() {
      return at === undefined ? undefined : iso(at - 1000);
    },
  };
}

const earlier = (a: string | undefined, b: string | undefined) => (!a ? b : !b ? a : Date.parse(a) <= Date.parse(b) ? a : b);

/**
 * Moves the sync cursor back so the next sync reads from `when`, e.g. for
 * pushed commits the webhook had no time for. Never moves it forward.
 */
export async function resumeSyncFrom(orgId: string, when: string) {
  const org = await store.get<Org>("orgs", orgId);
  if (!org) return;
  const current = org.syncCursor ?? org.lastSyncAt;
  // Never synced: the first sync reads the last FIRST_SYNC_DAYS anyway.
  if (!current) return;
  const next = earlier(current, when);
  if (next === current) return;
  await store.set("orgs", orgId, { ...org, syncCursor: next });
}

/**
 * Pulls new commits and comments by workspace members from the watched
 * repos. This is how an engineer's push reaches their manager without
 * anyone pasting a link (the GitHub App does the same, instantly). New
 * commits go into the explain queue, which then runs for what time is left.
 */
export async function syncOrg(org: Org, users: User[]) {
  const started = Date.now();
  const result = await syncOnce(org, users);
  if (!result.skipped) await drainJobs(org.id, Math.max(0, SYNC_BUDGET_MS - (Date.now() - started))).catch(() => undefined);
  return result;
}

async function syncOnce(org: Org, users: User[]) {
  const skipped = { commits: 0, comments: 0, skipped: true };
  if (syncing.has(org.id)) return skipped;
  syncing.add(org.id);
  try {
    // The org passed in may be stale, and another server instance may be syncing it right now.
    const fresh = await store.get<Org>("orgs", org.id);
    if (!fresh || (fresh.syncingUntil && Date.parse(fresh.syncingUntil) > Date.now())) return skipped;
    await store.set("orgs", org.id, { ...fresh, syncingUntil: iso(Date.now() + LOCK_MS) });

    let result: { commits: number; comments: number; cursor?: string; startedAt?: string } = { commits: 0, comments: 0 };
    try {
      result = await run(fresh, users);
      return { commits: result.commits, comments: result.comments, skipped: false };
    } finally {
      // Write back only what sync owns, on top of the latest copy of the org.
      const latest = await store.get<Org>("orgs", org.id);
      if (latest) {
        const rest: Org = { ...latest };
        delete rest.syncingUntil;
        const startCursor = fresh.syncCursor ?? fresh.lastSyncAt;
        const nowCursor = latest.syncCursor ?? latest.lastSyncAt;
        // A webhook may have moved the cursor back meanwhile; keep the earlier one.
        const cursor = nowCursor !== startCursor ? earlier(result.cursor ?? startCursor, nowCursor) : (result.cursor ?? startCursor);
        await store.set("orgs", org.id, {
          ...rest,
          ...(result.startedAt ? { lastSyncAt: result.startedAt } : {}),
          ...(cursor ? { syncCursor: cursor } : {}),
        });
      }
    }
  } finally {
    syncing.delete(org.id);
  }
}

/**
 * One sync pass. The cursor only moves past what was handled: anything left
 * over (the time budget, a GitHub error, a commit that couldn't be queued) is
 * read again next time. Jobs and comments are keyed by id, so rereading is harmless.
 * Commits are only queued here; the queue retries and gives up on its own.
 */
async function run(org: Org, users: User[]) {
  const started = Date.now();
  const startedAt = iso(started);
  const since = org.syncCursor ?? org.lastSyncAt ?? iso(started - FIRST_SYNC_DAYS * 86_400_000);
  const authors = users.filter((u) => u.githubLogin && u.status === "active");
  const outOfTime = () => Date.now() - started > SYNC_BUDGET_MS;
  const left = leftover();
  // False when a listing failed or was cut short: then the cursor stays where it was.
  let complete = true;
  let commits = 0;
  let comments = 0;

  const pending: { repo: string; sha: string; date: string; author: User }[] = [];
  for (const repoName of org.repos) {
    for (const author of authors) {
      try {
        const listed = await listAuthorCommits(repoName, author.githubLogin!, since, org.id);
        // Too many to read at once: carry on from the oldest one read.
        if (listed.resumeAt) left.leave(listed.resumeAt);
        else if (!listed.complete) complete = false;
        pending.push(...listed.commits.map((c) => ({ repo: repoName, sha: c.sha, date: c.date, author })));
      } catch (error) {
        // A repo that's gone for good is skipped (with a warning) rather than holding every other one back.
        if (repoGone(error)) console.warn(`[rosetta] sync of ${org.id} can't read ${repoName} any more; skipping it.`);
        else complete = false;
      }
    }
  }

  // Oldest first, so whatever is left over is all newer than the cursor.
  pending.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  for (const c of pending) {
    if (outOfTime()) {
      left.leave(c.date);
      break;
    }
    try {
      const login = c.author.githubLogin!.toLowerCase();
      const out = await enqueue(org, users, [{ repo: c.repo, sha: c.sha, committedAt: c.date, author: { login }, userId: c.author.id }], "sync");
      commits += out.queued;
    } catch {
      left.leave(c.date);
    }
  }

  for (const repoName of org.repos) {
    let listed: Awaited<ReturnType<typeof listRepoComments>>;
    try {
      listed = await listRepoComments(repoName, since, org.id);
    } catch (error) {
      if (!repoGone(error)) complete = false;
      continue;
    }
    if (listed.resumeAt) left.leave(listed.resumeAt);
    else if (!listed.complete) complete = false;

    for (const c of listed.comments.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
      const author = users.find((u) => u.githubLogin?.toLowerCase() === c.login.toLowerCase());
      if (!author || !isTechnical(author.role) || c.body.includes("[Rosetta]")) continue;
      const id = `gh_${c.id}`;
      if (await store.get("comments", id)) continue;
      if (outOfTime()) {
        left.leave(c.createdAt);
        break;
      }
      try {
        const cards = c.commitSha ? await store.list<StoredCard>("cards", "orgId", org.id) : [];
        const card = cards.find((k) => k.headSha === c.commitSha);
        const comment: Comment = {
          id,
          orgId: org.id,
          cardId: card?.id,
          authorId: author.id,
          source: "github",
          githubUrl: c.url,
          repo: repoName,
          createdAt: c.createdAt,
          ...(await translated(c.body, author.name, card?.explanation.title, org.id)),
        };
        await store.set("comments", id, comment);
        comments++;
      } catch {
        left.leave(c.createdAt);
      }
    }
  }

  if (!complete) console.warn(`[rosetta] sync of ${org.id} could not read everything from GitHub; it will read from ${since} again.`);
  const cursor = complete ? (left.cursor ?? startedAt) : since;
  return { commits, comments, cursor, startedAt };
}

/** Stale by the last attempt, so leftover work waits for the next round instead of every feed load. */
export const syncIsStale = (org: Org) =>
  org.repos.length > 0 &&
  !(org.syncingUntil && Date.parse(org.syncingUntil) > Date.now()) &&
  (!org.lastSyncAt || Date.now() - new Date(org.lastSyncAt).getTime() > SYNC_STALE_MS);
