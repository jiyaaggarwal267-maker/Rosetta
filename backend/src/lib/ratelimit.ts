import { ApiError } from "./http";

/**
 * A small in-memory sliding window: enough to stop password guessing on one
 * server. (Several servers would need a shared store such as Redis.)
 */

const hits = new Map<string, number[]>();

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Throws 429 once `key` has been used `max` times within `windowMs`. */
export function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    const wait = Math.ceil((windowMs - (now - recent[0])) / 60_000);
    throw new ApiError("rate_limited", `Too many attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}.`);
  }
  recent.push(now);
  hits.set(key, recent);
  // Keep the map small.
  if (hits.size > 5_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}

/** Forget failures after a successful login. */
export const clear = (key: string) => hits.delete(key);
