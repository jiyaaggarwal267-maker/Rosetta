import { z } from "zod";
import { hashPassword, issueToken, nextSessionVersion, publicUser, type VersionedUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { passwordSchema } from "@/lib/profile";
import { store } from "@/lib/store";
import type { StoredUser } from "@/lib/types";
import { resetId, type Reset } from "@/lib/resets";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const body = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "That reset link isn't valid."),
  password: passwordSchema,
});

/** POST /api/auth/reset { token, password } → { token, user }: sets the new password and logs in. */
export const POST = route(async (req) => {
  const { token, password } = await readJson(req, body);
  const id = resetId(token);
  const reset = await store.get<Reset>("resets", id);
  if (!reset || reset.expiresAt < Date.now()) {
    if (reset) await store.remove("resets", id);
    throw new ApiError("not_found", "This reset link has expired. Ask for a new one.");
  }
  const user = await store.get<StoredUser>("users", reset.userId);
  if (!user) throw new ApiError("not_found", "This account no longer exists.");
  // Someone invited but not joined yet sets their password by accepting the invite.
  if (user.status !== "active") {
    await store.remove("resets", id);
    throw new ApiError("not_found", "Accept your invite first: use the link in your invite email.");
  }

  const passwordHash = await hashPassword(password);
  // Re-read after the slow hash so a concurrent profile edit isn't lost.
  const latest = (await store.get<VersionedUser>("users", user.id)) ?? user;
  // A new session version logs out every device that had the old password.
  const next: VersionedUser = { ...latest, passwordHash, sessionVersion: nextSessionVersion(latest), updatedAt: new Date().toISOString() };
  await store.set("users", user.id, next);
  // One use only, and any other link sent before this one stops working too.
  const pending = await store.list<Reset>("resets", "userId", user.id);
  const ids = new Set([id, ...pending.flatMap((r) => (r.id ? [r.id] : []))]);
  await Promise.all([...ids].map((r) => store.remove("resets", r)));
  return json({ token: issueToken(next), user: publicUser(next) });
});
