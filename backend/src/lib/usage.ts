import { store } from "./store";

/**
 * Counts AI calls per day, so leads can see how much of the free quota is
 * left and the app can skip a provider that's used up.
 *
 * Two counters: one for the whole server (the provider's real quota, shared
 * by every workspace) and one per workspace. A workspace may use at most its
 * fair share of each provider's daily limit, so one team (or one stranger who
 * signed up) can't use up the quota for everyone else.
 */

export type Provider = "gemini" | "fallback";

/** `failed` counts calls the provider billed but we couldn't use; `errors` never reached it (or were refused) and don't count. */
type Counts = { ok: number; failed: number; errors?: number };

export type DayUsage = {
  date: string;
  gemini: Counts;
  fallback: Counts;
  /** Calls per task, e.g. { explain: 4, translate: 9 }. */
  tasks: Record<string, number>;
  /** The same, per provider: each provider's counter keeps its own day, so they can't be mixed. */
  tasksBy?: Partial<Record<Provider, Record<string, number>>>;
  /** Set when a provider answered 429 today: skip it until tomorrow. */
  exhausted?: Partial<Record<Provider, boolean>>;
};

export const DAILY_LIMIT: Record<Provider, number> = {
  gemini: Number(process.env.GEMINI_DAILY_LIMIT || 20),
  fallback: Number(process.env.FALLBACK_DAILY_LIMIT || 1000),
};

/** The share of each provider's daily limit one workspace may use (0 to 1). */
const ORG_SHARE = Math.min(1, Math.max(0, Number(process.env.AI_ORG_DAILY_SHARE || 0.25))) || 0.25;

export const ORG_DAILY_LIMIT: Record<Provider, number> = {
  gemini: Math.max(1, Math.floor(DAILY_LIMIT.gemini * ORG_SHARE)),
  fallback: Math.max(1, Math.floor(DAILY_LIMIT.fallback * ORG_SHARE)),
};

/** YYYY-MM-DD in a time zone. */
const dateIn = (timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** YYYY-MM-DD in India time, when the fallback's free quota rolls over for us in practice. */
export const today = () => dateIn("Asia/Kolkata");

/** Gemini's free quota resets at midnight Pacific time, so its counter does too. */
export const dayFor = (provider: Provider) => (provider === "gemini" ? dateIn("America/Los_Angeles") : today());

const empty = (date: string): DayUsage => ({
  date,
  gemini: { ok: 0, failed: 0 },
  fallback: { ok: 0, failed: 0 },
  tasks: {},
});

/** Global counters keep their old ids (the date); a workspace's are `<date>_org_<orgId>`. */
const docId = (date: string, orgId?: string) => (orgId ? `${date}_org_${orgId}` : date);

// Writes are serialised per process so concurrent calls don't lose counts.
let queue: Promise<unknown> = Promise.resolve();

export function getUsage(date = today(), orgId?: string) {
  const id = docId(date, orgId);
  return store
    .get<DayUsage>("usage", id)
    .then((u) => (u ? { ...u, date } : empty(date)))
    .catch(() => empty(date));
}

/**
 * "ok" and "failed" (the provider answered, or may have, but the answer was
 * unusable) count toward the limit; "error" (refused, unreachable, rate
 * limited) doesn't; "exhausted" switches the provider off for the day.
 */
export function recordAi(provider: Provider, task: string, outcome: "ok" | "failed" | "error" | "exhausted", orgId?: string) {
  queue = queue
    .then(async () => {
      const date = dayFor(provider);
      for (const id of orgId ? [undefined, orgId] : [undefined]) {
        const u = await getUsage(date, id);
        const c = u[provider];
        if (outcome === "ok") c.ok++;
        else if (outcome === "failed") c.failed++;
        else c.errors = (c.errors ?? 0) + 1;
        // Calls per task match the used count: errors don't count there either.
        if (outcome === "ok" || outcome === "failed") {
          u.tasks[task] = (u.tasks[task] ?? 0) + 1;
          const by = (u.tasksBy ??= {})[provider] ??= {};
          by[task] = (by[task] ?? 0) + 1;
        }
        // Only the provider's own daily 429 marks it used up, and that's for everyone.
        if (outcome === "exhausted" && !id) u.exhausted = { ...u.exhausted, [provider]: true };
        await store.set("usage", docId(date, id), { ...u, ...(id ? { orgId: id } : {}) });
      }
    })
    .catch(() => {});
  return queue;
}

const used = (u: DayUsage, p: Provider) => u[p].ok + u[p].failed;

/** True when the provider has nothing left today, for everyone. */
export async function sharedSpent(provider: Provider) {
  const u = await getUsage(dayFor(provider));
  return Boolean(u.exhausted?.[provider]) || used(u, provider) >= DAILY_LIMIT[provider];
}

/** True when today's count says this provider has nothing left, overall or for this workspace. */
export async function spent(provider: Provider, orgId?: string) {
  if (await sharedSpent(provider)) return true;
  if (!orgId) return false;
  return used(await getUsage(dayFor(provider), orgId), provider) >= ORG_DAILY_LIMIT[provider];
}
