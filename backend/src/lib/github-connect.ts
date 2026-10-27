import { env } from "./env";
import { forgetInstallation } from "./github";
import { dropInstallationToken, getInstallation, GitHubAppError } from "./github-app";
import { requeueUnassigned } from "./jobs";
import { orgMembers } from "./org";
import { store } from "./store";
import type { Org, StoredUser } from "./types";

/**
 * Connecting a workspace to its GitHub App installation, and a person to
 * their GitHub account. Both are browser round trips through github.com, so
 * they end in a redirect back to the app with `?github=…` rather than JSON.
 */

/** Why connecting or linking didn't work, as the `reason` query param the frontend reads. */
export type GithubFailure = "state" | "owner" | "installation" | "suspended" | "taken" | "verify" | "denied" | "github" | "not_configured";

export class GithubFlowError extends Error {
  constructor(public reason: GithubFailure) {
    super(reason);
  }
}

/** A redirect into the frontend. Built by hand: Response.redirect's headers can't take CORS headers. */
export const backTo = (path: string, params: Record<string, string>) =>
  new Response(null, { status: 302, headers: { Location: `${env.appUrl}${path}?${new URLSearchParams(params)}`, "Cache-Control": "no-store" } });

export const failed = (path: string, error: unknown) => {
  const reason: GithubFailure = error instanceof GithubFlowError ? error.reason : "github";
  if (!(error instanceof GithubFlowError)) console.warn("[rosetta] GitHub connect failed:", error instanceof Error ? error.message : error);
  return backTo(path, { github: "error", reason });
};

export const orgsForInstallation = (installationId: string) => store.list<Org>("orgs", "githubInstallationId", installationId);

/**
 * Saves the installation on the workspace, after checking that it's one of
 * this App's installations, not suspended, not already another workspace's,
 * and that the person is still the workspace owner.
 */
export async function connectInstallation(orgId: string, userId: string, installationId: string) {
  const org = await store.get<Org>("orgs", orgId);
  if (!org || org.ownerId !== userId) throw new GithubFlowError("owner");
  let installation;
  try {
    installation = await getInstallation(installationId);
  } catch (error) {
    if (error instanceof GitHubAppError && (error.status === 404 || error.status === 403)) throw new GithubFlowError("installation");
    throw error;
  }
  if (installation.suspended_at) throw new GithubFlowError("suspended");
  const others = (await orgsForInstallation(installationId)).filter((o) => o.id !== orgId);
  if (others.length) throw new GithubFlowError("taken");
  const latest = (await store.get<Org>("orgs", orgId)) ?? org;
  await store.set<Org>("orgs", orgId, {
    ...latest,
    githubInstallationId: installationId,
    githubAccount: installation.account?.login ?? latest.githubAccount,
    githubConnectedAt: new Date().toISOString(),
  });
  forgetInstallation(orgId);
  return installation;
}

/** Drops the workspace's link to its installation. Watched repos stay (public ones keep syncing with GITHUB_TOKEN). */
export async function disconnectInstallation(orgId: string) {
  const org = await store.get<Org>("orgs", orgId);
  if (!org?.githubInstallationId) return;
  const next: Org = { ...org };
  dropInstallationToken(org.githubInstallationId);
  delete next.githubInstallationId;
  delete next.githubAccount;
  delete next.githubConnectedAt;
  await store.set("orgs", orgId, next);
  forgetInstallation(orgId);
}

/**
 * Saves a GitHub account proven by logging in on GitHub. A verified account
 * wins over a username someone else only typed in (theirs is cleared); one
 * already verified by someone else in the workspace is refused. Commits by
 * that account waiting as "unassigned" go back in the queue for this person.
 */
export async function linkAccount(userId: string, gh: { login: string; id: number }) {
  const user = await store.get<StoredUser>("users", userId);
  if (!user || user.status !== "active") throw new GithubFlowError("state");
  const login = gh.login.toLowerCase();
  const members = await orgMembers(user.orgId);
  const others = members.filter((u) => u.id !== user.id);
  if (others.some((u) => u.githubVerified && (u.githubId === gh.id || u.githubLogin?.toLowerCase() === login))) {
    throw new GithubFlowError("taken");
  }
  const now = new Date().toISOString();
  for (const u of others) {
    if (u.githubLogin?.toLowerCase() !== login) continue;
    const latest = await store.get<StoredUser>("users", u.id);
    if (!latest) continue;
    const cleared: StoredUser = { ...latest, updatedAt: now };
    delete cleared.githubLogin;
    await store.set("users", u.id, cleared);
  }
  const next: StoredUser = { ...user, githubLogin: gh.login, githubId: gh.id, githubVerified: true, updatedAt: now };
  await store.set("users", user.id, next);
  const requeued = await requeueUnassigned(user.orgId, [login, user.email.toLowerCase()], user.id);
  return { user: next, requeued };
}
