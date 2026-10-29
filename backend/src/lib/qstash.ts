import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { env } from "./env";
import { drainJobs } from "./jobs";

/**
 * Upstash QStash, optional. When QSTASH_TOKEN is set, a push publishes one
 * message to POST /api/jobs/run, so the queue runs in a function call of its
 * own (with QStash's retries) rather than in the tail of the webhook request.
 * Without it, the webhook runs the queue itself with after().
 */

export const qstashConfigured = () => Boolean(env.qstashToken);

/** Asks QStash to call /api/jobs/run for a workspace. False when it couldn't, so the caller runs the queue itself. */
async function publish(orgId: string, origin: string) {
  const target = `${env.publicApiUrl || origin}/api/jobs/run`;
  try {
    const res = await fetch(`${env.qstashUrl}/v2/publish/${target}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.qstashToken}`,
        "Content-Type": "application/json",
        "Upstash-Retries": "2",
        // Many pushes in a few seconds need one run, not one each.
        "Upstash-Deduplication-Id": `drain-${orgId}-${Math.floor(Date.now() / 10_000)}`,
      },
      body: JSON.stringify({ orgId }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`QStash responded ${res.status}`);
    return true;
  } catch (error) {
    console.warn("[rosetta] QStash publish failed; running the queue here:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Starts the queue for a workspace after a request has answered: through
 * QStash when it's set up, otherwise in this function after the response.
 * Call it while handling a request (after() needs one).
 */
export async function kickJobs(orgId: string, origin: string) {
  if (qstashConfigured() && (await publish(orgId, origin))) return "qstash";
  after(() => drainJobs(orgId).then(() => undefined, (error) => console.warn("[rosetta] queue run failed:", error)));
  return "after";
}

/**
 * Checks the Upstash-Signature header: a JWT (HS256) signed with the current
 * or the next signing key, from Upstash, not expired, for this route, whose
 * `body` claim is the SHA-256 of the body we received.
 */
export function qstashSignatureOk(signature: string | null, body: string) {
  const keys = [env.qstashCurrentSigningKey, env.qstashNextSigningKey].filter(Boolean);
  if (!signature || !keys.length) return false;
  const [header, payload, sig, extra] = signature.split(".");
  if (!header || !payload || !sig || extra !== undefined) return false;
  const given = Buffer.from(sig);
  const signedBy = keys.some((key) => {
    const expected = Buffer.from(createHmac("sha256", key).update(`${header}.${payload}`).digest("base64url"));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!signedBy) return false;
  try {
    const head = JSON.parse(Buffer.from(header, "base64url").toString()) as { alg?: string };
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { iss?: string; sub?: string; exp?: number; nbf?: number; body?: string };
    const nowSec = Math.floor(Date.now() / 1000);
    if (head.alg !== "HS256" || claims.iss !== "Upstash") return false;
    if (typeof claims.exp !== "number" || claims.exp < nowSec - 5) return false;
    if (typeof claims.nbf === "number" && claims.nbf > nowSec + 5) return false;
    if (!claims.sub?.replace(/\?.*$/, "").endsWith("/api/jobs/run")) return false;
    // Upstash may or may not pad the base64; compare without it.
    const digest = createHash("sha256").update(body).digest("base64url").replace(/=+$/, "");
    return (claims.body ?? "").replace(/=+$/, "") === digest;
  } catch {
    return false;
  }
}
