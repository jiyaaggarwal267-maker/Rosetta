import { requireUser } from "@/lib/auth";
import { GitHubAppError, listInstallationRepos } from "@/lib/github-app";
import { ApiError, json, preflight, route } from "@/lib/http";
import { isLead, requireOrg } from "@/lib/org";
import { limit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/github/repos → { connected, account, repos: [{ fullName, private, defaultBranch, watched, branches }] }
 * The repos the workspace's GitHub App installation can read, to pick which
 * to watch (the owner saves the choice with PATCH /api/org { repos, branches }).
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  if (!isLead(me.role) && org.ownerId !== me.id) throw new ApiError("forbidden", "Only a CMO or manager can see the connected repositories.");
  if (!org.githubInstallationId) return json({ connected: false, account: null, repos: [] });
  limit(`github-repos:${me.id}`, 30, 60_000);
  let repos;
  try {
    repos = await listInstallationRepos(org.githubInstallationId);
  } catch (error) {
    if (error instanceof GitHubAppError) {
      throw new ApiError("unavailable", "GitHub didn't list the repositories. If the App was uninstalled, connect it again.");
    }
    throw error;
  }
  return json({
    connected: true,
    account: org.githubAccount ?? null,
    repos: repos
      .map((r) => ({ ...r, watched: org.repos.includes(r.fullName), branches: org.branches?.[r.fullName] ?? [] }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  });
});
