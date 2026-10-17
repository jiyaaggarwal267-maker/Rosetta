import { store } from "./store";

/**
 * Counts AI calls per day (India time), so leads can see how much of the
 * free quota is left and the app can skip a provider that's used up.
 */

export type Provider = "gemini" | "fallback";

export type DayUsage = {
  date: string;
  gemini: { ok: number; failed: number };
  fallback: { ok: number; failed: number };
  /** Calls per task, e.g. { explain: 4, translate: 9 }. */
  tasks: Record<string, number>;
  /** Set when a provider answered 429 today: skip it until tomorrow. */
  exhausted?: Partial<Record<Provider, boolean>>;
};

export const DAILY_LIMIT: Record<Provider, number> = {
  gemini: Number(process.env.GEMINI_DAILY_LIMIT || 20),
  fallback: Number(process.env.FALLBACK_DAILY_LIMIT || 1000),
};

/** YYYY-MM-DD in India time, when free quotas roll over for us in practice. */
export const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

const empty = (date: string): DayUsage => ({
  date,
  gemini: { ok: 0, failed: 0 },
  fallback: { ok: 0, failed: 0 },
  tasks: {},
});

// Writes are serialised per process so concurrent calls don't lose counts.
let queue: Promise<unknown> = Promise.resolve();

export function getUsage(date = today()) {
  return store.get<DayUsage>("usage", date).then((u) => u ?? empty(date)).catch(() => empty(date));
}

export function recordAi(provider: Provider, task: string, outcome: "ok" | "failed" | "exhausted") {
  queue = queue
    .then(async () => {
      const date = today();
      const u = await getUsage(date);
      u[provider][outcome === "ok" ? "ok" : "failed"]++;
      u.tasks[task] = (u.tasks[task] ?? 0) + 1;
      if (outcome === "exhausted") u.exhausted = { ...u.exhausted, [provider]: true };
      await store.set("usage", date, u);
    })
    .catch(() => {});
  return queue;
}

/** True when today's count says this provider has nothing left. */
export async function spent(provider: Provider) {
  const u = await getUsage();
  return Boolean(u.exhausted?.[provider]) || u[provider].ok + u[provider].failed >= DAILY_LIMIT[provider];
}
