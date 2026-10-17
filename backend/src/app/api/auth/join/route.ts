import { hashPassword, issueToken, publicUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { acceptance } from "@/lib/legal";
import { joinSchema, requireTerms } from "@/lib/profile";
import { clientIp, limit } from "@/lib/ratelimit";
import { notifications } from "@/lib/notify";
import { store } from "@/lib/store";
import type { StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Invite = { userId: string; orgId: string };

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
  const now = new Date().toISOString();
  const active: StoredUser = {
    ...user,
    ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined)),
    status: "active",
    ...acceptance(marketingOptIn),
    passwordHash: await hashPassword(password),
    inviteCode: undefined,
    updatedAt: now,
  };
  await store.set("users", user.id, active);
  await store.remove("invites", code.toUpperCase());
  if (active.managerId) await notifications.joined({ orgId: active.orgId, to: active.managerId, name: active.name });
  return json({ token: issueToken(user.id), user: publicUser(active) });
});
