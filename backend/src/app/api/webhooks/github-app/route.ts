import { after } from "next/server";
import { env } from "@/lib/env";
import { forgetInstallation } from "@/lib/github";
import { dropInstallationToken, signatureOk } from "@/lib/github-app";
import { disconnectInstallation, orgsForInstallation } from "@/lib/github-connect";
import { orgMembers } from "@/lib/org";
import { commentWork, queuePush, type CommentPayload, type PushOutcome, type PushPayload } from "@/lib/push";
import { kickJobs } from "@/lib/qstash";
import { clientIp, limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import type { Org } from "@/lib/types";

export const dynamic = "force-dynamic";
// When there's no QStash, the queue runs here after GitHub has its answer (the Vercel Hobby maximum is 300 s).
export const maxDuration = 300;

type AppPayload = PushPayload &
  CommentPayload & {
    action?: string;
    installation?: { id?: number };
    repositories_removed?: { full_name?: string }[];
  };

const text = (body: string, status: number) => new Response(body, { status });

/** Notes on the workspace that GitHub reached it, for the status panel. Re-read so nothing else is overwritten. */
async function touch(orgId: string, event: string) {
  const latest = await store.get<Org>("orgs", orgId);
  if (latest) await store.set<Org>("orgs", orgId, { ...latest, lastWebhookAt: new Date().toISOString(), lastWebhookEvent: event });
}

/**
 * POST /api/webhooks/github-app
 * The one webhook of the Rosetta GitHub App, for every workspace. Signed with
 * GITHUB_APP_WEBHOOK_SECRET; the installation id says which workspace.
 *  - push: every commit to a watched repo and branch is queued (202 at once),
 *    then the queue runs: through QStash when set up, else after this response.
 *  - installation deleted or suspended: the workspace is disconnected.
 *  - installation_repositories removed: those repos stop being watched.
 *  - commit, issue and review comments by members become Rosetta comments.
 */
export async function POST(req: Request) {
  try {
    limit(`github-app-hook:${clientIp(req)}`, 600, 60_000);
  } catch {
    return text("Too many requests", 429);
  }
  if (!env.githubAppWebhookSecret) return text("The GitHub App isn't set up on this server.", 503);
  const raw = await req.text();
  if (!signatureOk(env.githubAppWebhookSecret, raw, req.headers.get("x-hub-signature-256"))) return text("Invalid signature", 401);

  const event = req.headers.get("x-github-event") ?? "";
  if (event === "ping") return text("pong", 200);

  let payload: AppPayload;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    payload = parsed as AppPayload;
  } catch {
    return Response.json({ code: "bad_request", message: "The payload isn't JSON." }, { status: 400 });
  }
  const installationId = payload.installation?.id;
  if (!installationId || !Number.isSafeInteger(installationId)) return text("Ignored", 202);
  const id = String(installationId);
  const orgs = await orgsForInstallation(id);

  if (event === "installation") {
    if (payload.action === "deleted" || payload.action === "suspend") {
      dropInstallationToken(id);
      for (const org of orgs) {
        await disconnectInstallation(org.id);
        await touch(org.id, `installation.${payload.action}`);
      }
      return text("Disconnected", 202);
    }
    for (const org of orgs) await touch(org.id, `installation.${payload.action ?? ""}`);
    return text("Ignored", 202);
  }

  if (!orgs.length) return text("No workspace uses this installation", 202);

  if (event === "installation_repositories") {
    const removed = new Set((payload.repositories_removed ?? []).map((r) => r.full_name?.toLowerCase()).filter(Boolean));
    for (const org of orgs) {
      const latest = await store.get<Org>("orgs", org.id);
      if (!latest) continue;
      const branches = Object.fromEntries(Object.entries(latest.branches ?? {}).filter(([repo]) => !removed.has(repo)));
      await store.set<Org>("orgs", org.id, {
        ...latest,
        repos: latest.repos.filter((r) => !removed.has(r)),
        branches,
        lastWebhookAt: new Date().toISOString(),
        lastWebhookEvent: `installation_repositories.${payload.action ?? ""}`,
      });
      forgetInstallation(org.id);
    }
    return text("Updated", 202);
  }

  if (event === "push") {
    const outcomes: PushOutcome[] = [];
    for (const org of orgs) {
      await touch(org.id, "push");
      const fresh = (await store.get<Org>("orgs", org.id)) ?? org;
      const out = await queuePush(fresh, await orgMembers(org.id), payload, "push");
      if (out.queued) await kickJobs(org.id, new URL(req.url).origin);
      outcomes.push(out);
    }
    const total = (k: "queued" | "duplicates" | "unassigned" | "skipped") => outcomes.reduce((n, o) => n + o[k], 0);
    return Response.json(
      { queued: total("queued"), duplicates: total("duplicates"), unassigned: total("unassigned"), skipped: total("skipped"), ignored: outcomes.find((o) => o.ignored)?.ignored ?? null },
      { status: 202 },
    );
  }

  if (event === "commit_comment" || event === "issue_comment" || event === "pull_request_review_comment") {
    for (const org of orgs) {
      await touch(org.id, event);
      if (!org.repos.includes(payload.repository?.full_name?.toLowerCase() ?? "")) continue;
      const work = commentWork(org, await orgMembers(org.id), payload);
      if (work) after(() => work().catch(() => {}));
    }
    return text("Queued", 202);
  }

  return text("Ignored", 202);
}
