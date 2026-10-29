import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { appConfigured, oauthConfigured } from "@/lib/github-app";
import { ApiError, json, preflight, route } from "@/lib/http";
import type { Job, JobStatus } from "@/lib/jobs";
import { isLead, requireOrg } from "@/lib/org";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/github/status: is GitHub connected, what's watched, when GitHub
 * last sent something, and how the explain queue is doing (with the last
 * failures, in words). For leads. Never includes tokens or secrets.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  if (!isLead(me.role) && org.ownerId !== me.id) throw new ApiError("forbidden", "Only a CMO or manager can see the GitHub status.");
  const jobs = await store.list<Job>("jobs", "orgId", org.id);
  const queue: Record<JobStatus, number> = { queued: 0, running: 0, done: 0, failed: 0, skipped: 0, unassigned: 0 };
  for (const j of jobs) queue[j.status] = (queue[j.status] ?? 0) + 1;
  const failures = jobs
    .filter((j) => j.status === "failed")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10)
    .map((j) => ({ id: j.id, repo: j.repo, sha: j.sha.slice(0, 7), subject: j.subject ?? "", error: j.lastError ?? "", tries: j.tries, at: j.updatedAt }));

  return json({
    app: {
      /** The server has a GitHub App, so "Connect GitHub" can work. */
      configured: appConfigured() && Boolean(env.githubAppSlug),
      /** "Link your GitHub account" can work. */
      linkAccounts: oauthConfigured(),
    },
    connected: Boolean(org.githubInstallationId),
    account: org.githubAccount ?? null,
    connectedAt: org.githubConnectedAt ?? null,
    /** Where the owner adds repos to (or removes) the installation on GitHub. */
    manageUrl: env.githubAppSlug ? `${env.githubWebUrl}/apps/${env.githubAppSlug}/installations/new` : null,
    repos: org.repos,
    branches: org.branches ?? {},
    lastWebhookAt: org.lastWebhookAt ?? null,
    lastWebhookEvent: org.lastWebhookEvent ?? null,
    lastSyncAt: org.lastSyncAt ?? null,
    queue,
    failures,
  });
});
