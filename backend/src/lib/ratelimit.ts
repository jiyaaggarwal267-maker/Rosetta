import { ApiError } from "./http";

/**
 * A small in-memory sliding window: enough to stop password guessing on one
 * server. (Several servers would need a shared store such as Redis. On Vercel
 * each instance counts on its own, so the caps hold per instance only.)
 */

const hits = new Map<string, number[]>();

/**
 * The caller's address as the host saw it. The left of X-Forwarded-For is
 * whatever the client sent, so it's never trusted: on Vercel the platform's
 * own headers are used, elsewhere the right-most hop (added by our proxy).
 * Self-hosting without a reverse proxy that appends to X-Forwarded-For lets
 * a client choose that hop too, so put one (nginx, Caddy) in front.
 * IPv6 addresses count per /64 network: one machine usually has a whole /64,
 * so rotating addresses inside it doesn't buy more tries.
 */
export function clientIp(req: Request) {
  const header = (name: string) => req.headers.get(name)?.trim() || "";
  if (process.env.VERCEL) {
    const ip = header("x-vercel-forwarded-for").split(",")[0]?.trim() || header("x-real-ip");
    if (ip) return network(ip);
  }
  const hops = header("x-forwarded-for").split(",").map((h) => h.trim()).filter(Boolean);
  return network(hops.at(-1) || header("x-real-ip") || "local");
}

/** An IPv6 address's /64 prefix; IPv4 (and IPv4-mapped IPv6) as is. */
function network(ip: string) {
  if (!ip.includes(":") || ip.includes(".")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
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
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < (k.startsWith("seen:") ? SEEN_MS : windowMs))) hits.delete(k);
  }
}

/** Forget failures after a successful login. */
export const clear = (key: string) => hits.delete(key);

/** How long `mark` remembers something. */
const SEEN_MS = 30 * 24 * 3_600_000;

/** Notes that something happened (a successful login from an address), for `seen`. */
export const mark = (key: string) => hits.set(`seen:${key}`, [Date.now()]);

/** Whether `mark(key)` ran within the last 30 days (on this server). */
export const seen = (key: string) => (hits.get(`seen:${key}`) ?? []).some((t) => Date.now() - t < SEEN_MS);
