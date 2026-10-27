import { requireUser, sealState } from "@/lib/auth";
import { env } from "@/lib/env";
import { appConfigured, installUrl } from "@/lib/github-app";
import { ApiError, json, preflight, route } from "@/lib/http";
import { requireOrg } from "@/lib/org";
import { limit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** How long the owner has to finish installing on GitHub. */
const STATE_TTL_MS = 60 * 60_000;

/**
 * GET /api/github/install → { url }: where the workspace owner installs the
 * Rosetta GitHub App and picks repos. The frontend sends the browser there;
 * GitHub comes back to /api/github/callback with the signed `state`.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  if (org.ownerId !== me.id) throw new ApiError("forbidden", "Only the workspace owner can connect GitHub.");
  if (!appConfigured() || !env.githubAppSlug) throw new ApiError("unavailable", "The GitHub App isn't set up on this server yet.");
  limit(`github-install:${me.id}`, 20, 60 * 60_000);
  return json({ url: installUrl(sealState("install", { o: org.id, u: me.id }, STATE_TTL_MS)) });
});
