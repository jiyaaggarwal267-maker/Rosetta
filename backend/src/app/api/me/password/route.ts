import { z } from "zod";
import { checkPassword, hashPassword, issueToken, nextSessionVersion, requireUser, type VersionedUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { passwordSchema } from "@/lib/profile";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import type { Reset } from "@/lib/resets";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const body = z.object({
  current: z.string().min(1).max(200),
  next: passwordSchema,
});

/**
 * POST /api/me/password { current, next } → { changed, token }: change your own
 * password. Every other session is logged out; the returned token replaces this one.
 */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  limit(`password:${me.id}`, 8, 15 * 60_000);
  const { current, next } = await readJson(req, body);
  const user = await store.get<VersionedUser>("users", me.id);
  if (!user || !(await checkPassword(current, user.passwordHash ?? ""))) {
    throw new ApiError("invalid_credentials", "Your current password isn't right.");
  }
  if (current === next) throw new ApiError("bad_request", "Pick a password you haven't used here.");
  const passwordHash = await hashPassword(next);
  // Re-read after the slow hash so a concurrent profile edit isn't lost.
  const latest = (await store.get<VersionedUser>("users", user.id)) ?? user;
  const updated: VersionedUser = { ...latest, passwordHash, sessionVersion: nextSessionVersion(latest), updatedAt: new Date().toISOString() };
  await store.set("users", user.id, updated);
  // A reset link sent for the old password shouldn't still work.
  const pending = await store.list<Reset>("resets", "userId", user.id);
  await Promise.all(pending.flatMap((r) => (r.id ? [store.remove("resets", r.id)] : [])));
  return json({ changed: true, token: issueToken(updated) });
});
