import { after } from "next/server";
import { signatureOk } from "@/lib/github-app";
import { orgMembers } from "@/lib/org";
import { commentWork, queuePush, type CommentPayload, type PushPayload } from "@/lib/push";
import { kickJobs } from "@/lib/qstash";
import { store } from "@/lib/store";
import type { Org } from "@/lib/types";

export const dynamic = "force-dynamic";
// Explaining, checking and one rewrite can take a couple of minutes (the Vercel Hobby maximum is 300 s).
export const maxDuration = 300;

/**
 * POST /api/webhooks/github?org=<id>
 * The older, per-workspace webhook: add this URL to a repo's GitHub webhooks
 * (content type: application/json, secret from the Team page, events: pushes
 * and comments). The GitHub App (/api/webhooks/github-app) replaces it; both
 * feed the same queue, so a push is explained once whichever sends it.
 */
export async function POST(req: Request) {
  const orgId = new URL(req.url).searchParams.get("org") ?? "";
  const org = await store.get<Org>("orgs", orgId);
  const raw = await req.text();
  if (!org || !signatureOk(org.webhookSecret, raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  if (event === "ping") return new Response("pong");

  let payload: PushPayload & CommentPayload;
  try {
    payload = JSON.parse(raw) ?? {};
  } catch {
    return Response.json({ code: "bad_request", message: "The payload isn't JSON." }, { status: 400 });
  }
  if (!payload.repository?.full_name) return new Response("Ignored", { status: 202 });
  const users = await orgMembers(org.id);

  if (event === "push") {
    // Every commit is queued (none dropped), then explained after GitHub has its answer.
    const out = await queuePush(org, users, payload, "webhook", false);
    if (out.queued) await kickJobs(org.id, new URL(req.url).origin);
    return new Response(`Queued ${out.queued}`, { status: 202 });
  }

  if (event === "commit_comment" || event === "issue_comment" || event === "pull_request_review_comment") {
    const work = commentWork(org, users, payload);
    if (!work) return new Response("Ignored", { status: 202 });
    after(() => work().catch(() => {}));
    return new Response("Queued", { status: 202 });
  }

  return new Response("Ignored", { status: 202 });
}
