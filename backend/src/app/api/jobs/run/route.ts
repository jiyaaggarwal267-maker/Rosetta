import { timingSafeEqual } from "node:crypto";
import { ApiError, json, route } from "@/lib/http";
import { drainJobs, pruneJobs } from "@/lib/jobs";
import { qstashSignatureOk } from "@/lib/qstash";

export const dynamic = "force-dynamic";
// Explaining, checking and one rewrite can take a couple of minutes (the Vercel Hobby maximum is 300 s).
export const maxDuration = 300;

/** Vercel's cron (and anyone holding CRON_SECRET) sends `Authorization: Bearer $CRON_SECRET`. */
const cronAuthorized = (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

/**
 * POST /api/jobs/run { orgId? } → what the run did.
 * Runs the explain queue: called by QStash after a push (Upstash-Signature
 * checked), or by hand with the cron secret.
 */
export const POST = route(async (req) => {
  const raw = await req.text();
  if (!qstashSignatureOk(req.headers.get("upstash-signature"), raw) && !cronAuthorized(req)) throw new ApiError("unauthorized");
  let orgId: string | undefined;
  try {
    const body = raw ? (JSON.parse(raw) as { orgId?: unknown }) : {};
    if (typeof body.orgId === "string" && body.orgId.length <= 80) orgId = body.orgId;
  } catch {
    throw new ApiError("bad_request", "Body must be JSON.");
  }
  return json(await drainJobs(orgId));
});

/**
 * GET /api/jobs/run: the daily cron in vercel.json. Runs every workspace's
 * queue (anything a missed run left behind) and forgets month-old finished jobs.
 */
export const GET = route(async (req) => {
  if (!cronAuthorized(req)) throw new ApiError("unauthorized");
  const result = await drainJobs();
  return json({ ...result, pruned: await pruneJobs() });
});
