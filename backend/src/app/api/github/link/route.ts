import { publicUser, requireUser, sealState } from "@/lib/auth";
import { authorizeUrl, oauthConfigured } from "@/lib/github-app";
import { ApiError, json, preflight, route } from "@/lib/http";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import type { StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/github/link → { url }: GitHub's login page for "Link your GitHub
 * account". GitHub comes back to /api/github/link/callback, which saves the
 * proven username and ends at APP_URL/app/profile?github=linked.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  if (!oauthConfigured()) throw new ApiError("unavailable", "Linking GitHub accounts isn't set up on this server yet.");
  limit(`github-link:${me.id}`, 20, 60 * 60_000);
  return json({ url: authorizeUrl(sealState("link", { u: me.id }, 15 * 60_000)) });
});

/**
 * DELETE /api/github/link → { user }: forgets that the GitHub account was
 * proven. The username stays, as if typed in, until they change it.
 */
export const DELETE = route(async (req) => {
  const me = await requireUser(req);
  const stored = await store.get<StoredUser>("users", me.id);
  if (!stored) throw new ApiError("unauthorized");
  const next: StoredUser = { ...stored, updatedAt: new Date().toISOString() };
  delete next.githubId;
  delete next.githubVerified;
  await store.set("users", me.id, next);
  return json({ user: publicUser(next) });
});
