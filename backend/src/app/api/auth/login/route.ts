import { z } from "zod";
import { checkPassword, issueToken, publicUser, userIdFor } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { emailSchema } from "@/lib/profile";
import { clear, clientIp, limit, mark, seen } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import type { StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const body = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.").max(200) });

/** POST /api/auth/login { email, password } → { token, user } */
export const POST = route(async (req) => {
  const { email, password } = await readJson(req, body);
  // 8 tries per account from one address per 15 minutes, 30 per address: enough
  // for typos, not for guessing. The per-account cap across all addresses is
  // much higher, so a stranger can't lock the real person out with 8 bad tries,
  // and it doesn't apply where this person logged in before: guessing from many
  // addresses slows down, but the owner's own devices still get in.
  const ip = clientIp(req);
  const accountKey = `login:${email}:${ip}`;
  limit(accountKey, 8, 15 * 60_000);
  limit(`login-ip:${ip}`, 30, 15 * 60_000);
  if (!seen(accountKey)) limit(`login-all:${email}`, 50, 15 * 60_000);
  const user = await store.get<StoredUser>("users", userIdFor(email));
  // Same answer (and about the same time: checkPassword hashes anyway) for an
  // unknown email, an invited account and a wrong password.
  const ok = await checkPassword(password, user?.passwordHash ?? "");
  if (!user || !ok || user.status !== "active") {
    throw new ApiError("invalid_credentials", "That email and password don't match.");
  }
  clear(accountKey);
  mark(accountKey);
  return json({ token: issueToken(user), user: publicUser(user) });
});
