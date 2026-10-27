import { requireUser } from "@/lib/auth";
import { json, preflight, route } from "@/lib/http";
import { CAN_ADD, canMessage, descendants, orgMembers, personOf, requireOrg, visibleAuthorIds } from "@/lib/org";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/team → the workspace as this person sees it: who they manage,
 * who they can message, and (for the owner) the webhook settings.
 * Clients only see the people they can message and the team whose work they read.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  const users = await orgMembers(org.id);
  const managed = new Set(descendants(me.id, users).map((u) => u.id));
  const isOwner = org.ownerId === me.id;
  const followed = me.role === "client" ? visibleAuthorIds(me, users) : null;

  const members = users
    .filter((u) => u.id !== me.id)
    .filter((u) => !followed || canMessage(me, u, users) || (followed.has(u.id) && u.role !== "client"))
    .map((u) => {
      const manages = me.role === "cmo" || managed.has(u.id);
      return {
        ...personOf(u, users),
        email: manages ? u.email : undefined,
        reports: users.filter((x) => x.managerId === u.id).length,
        manages,
        canMessage: canMessage(me, u, users),
        inviteCode: manages && u.status === "invited" ? u.inviteCode : undefined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return json({
    me: personOf(me, users),
    canAdd: CAN_ADD[me.role],
    isOwner,
    members,
    org: {
      id: org.id,
      name: org.name,
      ownerId: org.ownerId,
      repos: org.repos,
      lastSyncAt: org.lastSyncAt ?? null,
      branches: org.branches ?? {},
      // The GitHub App connection; GET /api/github/status has the details.
      github: { connected: Boolean(org.githubInstallationId), account: org.githubAccount ?? null },
      // Only the owner changes the watched repos, so only they need the webhook secret.
      ...(isOwner ? { webhookPath: `/api/webhooks/github?org=${org.id}`, webhookSecret: org.webhookSecret } : {}),
    },
  });
});
