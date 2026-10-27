import { hashPassword, issueToken, publicUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { acceptance } from "@/lib/legal";
import { inviteExpired, joinSchema, requireTerms } from "@/lib/profile";
import { clientIp, limit } from "@/lib/ratelimit";
import { notifications } from "@/lib/notify";
import { assertGithubLoginFree, orgMembers } from "@/lib/org";
import { store } from "@/lib/store";
import type { StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Invite = { userId: string; orgId: string; createdAt?: string };

/** POST /api/auth/join { code, password, …profile } → { token, user } */
export const POST = route(async (req) => {
  limit(`join:${clientIp(req)}`, 20, 15 * 60_000);
  const { code, password, acceptTerms, marketingOptIn, ...profile } = await readJson(req, joinSchema);
  const missing = requireTerms(acceptTerms);
  if (missing) throw new ApiError("terms_required", missing);
  const invite = await store.get<Invite>("invites", code.toUpperCase());
  const user = invite && (await store.get<StoredUser>("users", invite.userId));
  if (!invite || !user || user.status !== "invited") {
    throw new ApiError("not_found", "That invite code isn't valid. Ask your manager for a new one.");
  }
  if (inviteExpired(invite)) throw new ApiError("not_found", "That invite has expired. Ask your manager for a new one.");
  if (profile.githubLogin && profile.githubLogin.toLowerCase() !== user.githubLogin?.toLowerCase()) {
    assertGithubLoginFree(profile.githubLogin, await orgMembers(user.orgId), user.id);
  }
  const passwordHash = await hashPassword(password);
  // Hashing is slow: build on the latest record, and stop if it was joined or removed meanwhile.
  const latest = await store.get<StoredUser>("users", user.id);
  if (!latest || latest.status !== "invited") {
    throw new ApiError("not_found", "That invite code isn't valid. Ask your manager for a new one.");
  }
  const now = new Date().toISOString();
  const active: StoredUser = {
    ...latest,
    ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined)),
    status: "active",
    ...acceptance(marketingOptIn),
    passwordHash,
    inviteCode: undefined,
    updatedAt: now,
  };
  await store.set("users", latest.id, active);
  await store.remove("invites", code.toUpperCase());
  if (active.managerId) await notifications.joined({ orgId: active.orgId, to: active.managerId, name: active.name });
  return json({ token: issueToken(active), user: publicUser(active) });
});
