import { randomBytes } from "node:crypto";
import { aiConfigured } from "./ai/provider";
import { env } from "./env";
import { ApiError } from "./http";
import { ingestLink, SkipChange } from "./ingest";
import { orgMembers } from "./org";
import { store } from "./store";
import { spent, type Provider } from "./usage";
import type { Org, StoredCard, User } from "./types";

/**
 * The explain queue: one durable job per commit, so a push of 40 commits is
 * explained in full (no cap), a crashed or timed-out run picks up where it
 * stopped, and the same commit is never explained twice.
 *
 * Pushes (GitHub App and the older webhook) and sync all enqueue here; the
 * worker (`drainJobs`) explains, makes the card and notifies people. It runs
 * from QStash when set up, else right after the webhook answers, on feed loads
 * and from a daily cron.
 */

/**
 * queued: waiting (or waiting to retry, from `nextAt`) · running: someone holds
 * its lease · done: explained (or already was) · failed: gave up after
 * MAX_TRIES · skipped: not worth explaining (a merge, a bot, lockfiles) ·
 * unassigned: nobody in the workspace matched its author, so nothing is spent
 * until a lead says whose it is.
 */
export type JobStatus = "queued" | "running" | "done" | "failed" | "skipped" | "unassigned";
export type JobSource = "push" | "webhook" | "sync";

/** Someone as a commit or push names them. `login` and `email` are lower case. */
export type GitPerson = { login?: string; email?: string; name?: string; id?: number };

export type Job = {
  id: string;
  orgId: string;
  /** owner/repo, lower case. */
  repo: string;
  sha: string;
  status: JobStatus;
  /** Runs started, including one that crashed. */
  tries: number;
  /** Not run before this time (retry backoff, or the AI quota's reset). */
  nextAt: string;
  /** A running job whose lease has passed was abandoned (the function was stopped): it's run again. */
  leaseUntil?: string;
  /** Which run holds the lease, so two runs that both read "queued" don't both explain it. */
  runId?: string;
  lastError?: string;
  source: JobSource;
  branch?: string;
  /** First line of the commit message, for lists. */
  subject?: string;
  committedAt: string;
  author: GitPerson;
  pusher?: GitPerson;
  /** The member it was matched to, and how. */
  userId?: string;
  matchedBy?: MatchedBy;
  cardId?: string;
  createdAt: string;
  updatedAt: string;
};

export const MAX_TRIES = 3;
/** The first retry waits this long; each later one twice as long. */
const BACKOFF_MS = Math.max(1, Number(process.env.JOBS_BACKOFF_MS || 60_000));
/** Outlives the 300 s function limit, so only a run that really stopped loses its job. */
const LEASE_MS = 6 * 60_000;
/** No new job is started after this long; one can take a couple of minutes, and the function is stopped at 300 s. */
export const DRAIN_BUDGET_MS = 150_000;
/** Done and skipped jobs are forgotten after this long (cards are kept; they dedupe on their own). */
const KEEP_MS = 30 * 86_400_000;

const now = () => new Date().toISOString();

/** One job per commit per workspace. Doc ids can't hold "/", and "~" never appears in a repo name. */
export const jobId = (orgId: string, repo: string, sha: string) => `${orgId}_${repo.toLowerCase().replace("/", "~")}_${sha.toLowerCase()}`;

/* ------------------------------------------------------------------ */
/* Who wrote it                                                        */
/* ------------------------------------------------------------------ */

export type MatchedBy = "github-id" | "verified-login" | "login" | "email" | "alias";

const lower = (s: string | undefined) => s?.trim().toLowerCase() || undefined;

/**
 * The member who wrote a commit, strongest proof first: the GitHub account
 * they linked (by id, then username), a username they typed in, their Rosetta
 * email as the commit email, then a lead's assignment of that username or email.
 */
export function matchAuthor(org: Org, users: User[], who: GitPerson): { user: User; by: MatchedBy } | null {
  const login = lower(who.login);
  const email = lower(who.email);
  const sameLogin = (u: User) => Boolean(login && u.githubLogin?.toLowerCase() === login);
  const tries: [MatchedBy, (u: User) => boolean][] = [
    ["github-id", (u) => Boolean(who.id && u.githubVerified && u.githubId === who.id)],
    ["verified-login", (u) => Boolean(u.githubVerified) && sameLogin(u)],
    ["login", sameLogin],
    ["email", (u) => Boolean(email && u.email.toLowerCase() === email)],
  ];
  for (const [by, test] of tries) {
    const user = users.find(test);
    if (user) return { user, by };
  }
  const aliased = (login && org.githubAliases?.[login]) || (email && org.githubAliases?.[email]);
  const user = aliased ? users.find((u) => u.id === aliased) : undefined;
  return user ? { user, by: "alias" } : null;
}

/** The key a lead assigns: the GitHub username when the commit has one, else its email. */
export const aliasKey = (who: GitPerson) => lower(who.login) ?? lower(who.email);

/* ------------------------------------------------------------------ */
/* Adding work                                                         */
/* ------------------------------------------------------------------ */

export type Incoming = {
  repo: string;
  sha: string;
  committedAt?: string;
  subject?: string;
  branch?: string;
  author: GitPerson;
  pusher?: GitPerson;
  /** Why it isn't worth explaining, when it isn't. */
  skip?: string;
  /** Already known (sync lists commits by member). */
  userId?: string;
};

export type EnqueueResult = { queued: number; duplicates: number; unassigned: number; skipped: number };

/**
 * Adds commits to the queue, once each. A commit already there (a second
 * delivery, the same commit pushed to two branches, sync finding a pushed one)
 * is left as it is.
 */
export async function enqueue(org: Org, users: User[], commits: Incoming[], source: JobSource): Promise<EnqueueResult> {
  const out: EnqueueResult = { queued: 0, duplicates: 0, unassigned: 0, skipped: 0 };
  for (const c of commits) {
    const repo = c.repo.toLowerCase();
    const id = jobId(org.id, repo, c.sha);
    if (await store.get<Job>("jobs", id)) {
      out.duplicates++;
      continue;
    }
    const match = c.userId ? { user: users.find((u) => u.id === c.userId), by: "login" as MatchedBy } : matchAuthor(org, users, c.author);
    const status: JobStatus = c.skip ? "skipped" : match?.user ? "queued" : "unassigned";
    const at = now();
    const job: Job = {
      id,
      orgId: org.id,
      repo,
      sha: c.sha.toLowerCase(),
      status,
      tries: 0,
      nextAt: at,
      source,
      committedAt: c.committedAt ?? at,
      author: c.author,
      createdAt: at,
      updatedAt: at,
      ...(c.skip ? { lastError: c.skip } : {}),
      ...(c.branch ? { branch: c.branch } : {}),
      ...(c.subject ? { subject: c.subject.slice(0, 200) } : {}),
      ...(c.pusher ? { pusher: c.pusher } : {}),
      ...(match?.user ? { userId: match.user.id, matchedBy: match.by } : {}),
    };
    await store.set("jobs", id, job);
    if (status === "queued") out.queued++;
    else if (status === "skipped") out.skipped++;
    else out.unassigned++;
  }
  return out;
}

/**
 * Puts a workspace's unassigned commits by this username or email (lower
 * case) back in the queue for `userId`. Returns how many.
 */
export async function requeueUnassigned(orgId: string, keys: string[], userId: string) {
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  let n = 0;
  for (const job of await store.list<Job>("jobs", "orgId", orgId)) {
    if (job.status !== "unassigned") continue;
    if (![job.author.login, job.author.email].some((k) => k && wanted.has(k.toLowerCase()))) continue;
    const latest = await store.get<Job>("jobs", job.id);
    if (latest?.status !== "unassigned") continue;
    await store.set<Job>("jobs", job.id, { ...latest, status: "queued", userId, matchedBy: "alias", tries: 0, nextAt: now(), updatedAt: now() });
    n++;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* The worker                                                          */
/* ------------------------------------------------------------------ */

/** Midnight in a time zone, as a timestamp: when that provider's daily count starts again. */
function nextMidnight(timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const past = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000;
  // A minute late, so the count has surely rolled over.
  return Date.now() + 86_400_000 - past + 60_000;
}

const RESET_ZONE: Record<Provider, string> = { gemini: "America/Los_Angeles", fallback: "Asia/Kolkata" };
const configured = (): Provider[] => [...(env.geminiKey ? ["gemini" as const] : []), ...(env.fallbackKey ? ["fallback" as const] : [])];

/** True when every AI provider is used up for this workspace today: jobs wait instead of failing. */
async function quotaSpent(orgId: string) {
  if (!aiConfigured()) return false;
  for (const p of configured()) if (!(await spent(p, orgId))) return false;
  return true;
}

/** The earliest moment any provider's quota comes back. */
const quotaBack = () => new Date(Math.min(...configured().map((p) => nextMidnight(RESET_ZONE[p])), Date.now() + 86_400_000)).toISOString();

const quotaMessage = (error: unknown) => error instanceof ApiError && /quota/i.test(error.message);
/** Errors that another try won't fix. */
const permanent = (error: unknown) => error instanceof ApiError && (error.code === "not_found" || error.code === "private");

const errorText = (error: unknown) =>
  (error instanceof ApiError ? (error.message !== error.code ? error.message : `GitHub or the AI said "${error.code}"`) : error instanceof Error ? error.message : String(error)).slice(0, 300);

const claimable = (job: Job, at: number) =>
  (job.status === "queued" && Date.parse(job.nextAt) <= at) || (job.status === "running" && Date.parse(job.leaseUntil ?? "") < at);

/** Jobs ready to run, oldest commit first, and when the next waiting one comes due. */
async function ready(orgId?: string): Promise<{ jobs: Job[]; nextDue?: number }> {
  const at = Date.now();
  const all = orgId
    ? await store.list<Job>("jobs", "orgId", orgId)
    : [...(await store.list<Job>("jobs", "status", "queued")), ...(await store.list<Job>("jobs", "status", "running"))];
  const due = all.filter((j) => j.status === "queued" && !claimable(j, at)).map((j) => Date.parse(j.nextAt));
  return {
    jobs: all.filter((j) => claimable(j, at)).sort((a, b) => a.committedAt.localeCompare(b.committedAt)),
    nextDue: due.length ? Math.min(...due) : undefined,
  };
}

/** A retry due this soon is waited for in the same run rather than left for the next one. */
const WAIT_FOR_RETRY_MS = 10_000;

/** Takes the job for this run, or null when it's gone, not ready, or another run took it first. */
async function claim(id: string): Promise<Job | null> {
  const fresh = await store.get<Job>("jobs", id);
  if (!fresh || !claimable(fresh, Date.now())) return null;
  const runId = randomBytes(8).toString("hex");
  const at = Date.now();
  const mine: Job = { ...fresh, status: "running", runId, tries: fresh.tries + 1, leaseUntil: new Date(at + LEASE_MS).toISOString(), updatedAt: new Date(at).toISOString() };
  await store.set("jobs", id, mine);
  // Read it back: when two runs raced, only the last writer's run id is there.
  const check = await store.get<Job>("jobs", id);
  return check?.runId === runId ? mine : null;
}

/** Writes a job's outcome, unless another run took it over meanwhile (its lease ran out). */
async function finish(job: Job, patch: Partial<Job>) {
  const latest = await store.get<Job>("jobs", job.id);
  if (!latest || latest.runId !== job.runId) return;
  const next: Job = { ...latest, ...patch, updatedAt: now() };
  delete next.leaseUntil;
  delete next.runId;
  await store.set("jobs", job.id, next);
}

export type DrainResult = { done: number; failed: number; retrying: number; skipped: number; waiting: number; unassigned: number };

const draining = new Set<string>();

/**
 * Runs ready jobs (one workspace's, or everyone's) until there are none or the
 * time budget is used. Each is explained with the usual pipeline (explain,
 * check, card, notifications). A failure is retried later with backoff, up to
 * MAX_TRIES; a used-up AI quota leaves jobs queued until it resets.
 */
export async function drainJobs(orgId?: string, budgetMs = DRAIN_BUDGET_MS): Promise<DrainResult> {
  const result: DrainResult = { done: 0, failed: 0, retrying: 0, skipped: 0, waiting: 0, unassigned: 0 };
  const key = orgId ?? "*";
  if (draining.has(key)) return result;
  draining.add(key);
  const started = Date.now();
  const outOfTime = () => Date.now() - started > budgetMs;
  /** Workspaces out of AI quota this run: their jobs wait. */
  const waiting = new Set<string>();
  const members = new Map<string, User[]>();
  try {
    // Several passes, so a quick retry (short backoff) runs in the same call.
    for (let pass = 0; pass < 20 && !outOfTime(); pass++) {
      const next = await ready(orgId);
      const jobs = next.jobs.filter((j) => !waiting.has(j.orgId));
      if (!jobs.length) {
        const wait = (next.nextDue ?? Infinity) - Date.now();
        if (waiting.size || wait > WAIT_FOR_RETRY_MS || wait > budgetMs - (Date.now() - started)) break;
        await new Promise((r) => setTimeout(r, Math.max(0, wait) + 5));
        continue;
      }
      for (const queued of jobs) {
        if (outOfTime()) break;
        if (waiting.has(queued.orgId)) continue;
        const job = await claim(queued.id);
        if (!job) continue;
        await runOne(job, members, waiting, result);
      }
    }
  } finally {
    draining.delete(key);
  }
  return result;
}

async function runOne(job: Job, members: Map<string, User[]>, waiting: Set<string>, result: DrainResult) {
  const org = await store.get<Org>("orgs", job.orgId);
  if (!org) {
    // The workspace was deleted.
    await store.remove("jobs", job.id);
    return;
  }
  let users = members.get(org.id);
  if (!users) members.set(org.id, (users = await orgMembers(org.id)));

  // The member may have left since: match again, or wait for a lead to assign it.
  const author = users.find((u) => u.id === job.userId) ?? matchAuthor(org, users, job.author)?.user;
  if (!author) {
    await finish(job, { status: "unassigned", tries: job.tries - 1 });
    result.unassigned++;
    return;
  }
  // Pushes and sync only explain watched repos; the repo may have been dropped since.
  if (job.source !== "webhook" && !org.repos.includes(job.repo)) {
    await finish(job, { status: "skipped", lastError: "This repository isn't watched any more." });
    result.skipped++;
    return;
  }
  const wait = async () => {
    waiting.add(org.id);
    await finish(job, { status: "queued", tries: job.tries - 1, nextAt: quotaBack(), lastError: "Waiting for tomorrow's AI quota." });
    result.waiting++;
  };
  if (await quotaSpent(org.id)) return wait();

  const [owner, repo] = job.repo.split("/");
  const source: StoredCard["source"] = job.source;
  try {
    const card = await ingestLink(org, { owner, repo, kind: "commit", sha: job.sha }, users, source, { authorUserId: author.id, skipMerges: true });
    await finish(job, { status: "done", userId: author.id, ...(card ? { cardId: card.id } : {}), lastError: undefined });
    result.done++;
  } catch (error) {
    if (error instanceof SkipChange) {
      await finish(job, { status: "skipped", lastError: `Skipped: ${error.message}.` });
      result.skipped++;
    } else if (quotaMessage(error)) {
      await wait();
    } else if (permanent(error) || job.tries >= MAX_TRIES) {
      await finish(job, { status: "failed", lastError: errorText(error) });
      result.failed++;
    } else {
      const delay = BACKOFF_MS * 2 ** (job.tries - 1);
      await finish(job, { status: "queued", nextAt: new Date(Date.now() + delay).toISOString(), lastError: errorText(error) });
      result.retrying++;
    }
  }
}

/** Forgets done and skipped jobs older than a month, from the daily run. */
export async function pruneJobs() {
  const cutoff = Date.now() - KEEP_MS;
  let n = 0;
  for (const status of ["done", "skipped"] as const) {
    for (const job of await store.list<Job>("jobs", "status", status)) {
      if (Date.parse(job.updatedAt) < cutoff) {
        await store.remove("jobs", job.id);
        n++;
      }
    }
  }
  return n;
}

/** The last time this server drained a workspace, so feed loads don't drain on every request. */
const lastDrain = new Map<string, number>();
const DRAIN_STALE_MS = 60_000;

/** Whether a feed load should give the queue a turn; marks it as given. */
export function drainDue(orgId: string) {
  const last = lastDrain.get(orgId) ?? 0;
  if (Date.now() - last < DRAIN_STALE_MS) return false;
  lastDrain.set(orgId, Date.now());
  if (lastDrain.size > 5_000) lastDrain.clear();
  return true;
}
