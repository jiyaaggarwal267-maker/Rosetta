import { z } from "zod";
import { checkPassword, hashPassword, requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import type { StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const body = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(8, "Use at least 8 characters.").max(200),
});

/** POST /api/me/password { current, next }: change your own password. */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  limit(`password:${me.id}`, 8, 15 * 60_000);
  const { current, next } = await readJson(req, body);
  const user = await store.get<StoredUser>("users", me.id);
  if (!user || !(await checkPassword(current, user.passwordHash ?? ""))) {
    throw new ApiError("invalid_credentials", "Your current password isn't right.");
  }
  if (current === next) throw new ApiError("bad_request", "Pick a password you haven't used here.");
  await store.set<StoredUser>("users", user.id, { ...user, passwordHash: await hashPassword(next), updatedAt: new Date().toISOString() });
  return json({ changed: true });
});
