import { requireUser } from "@/lib/auth";
import { disconnectInstallation } from "@/lib/github-connect";
import { ApiError, json, preflight, route } from "@/lib/http";
import { requireOrg } from "@/lib/org";
import { limit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * DELETE /api/github/installation → { connected: false }
 * The owner disconnects the GitHub App in Rosetta. The App stays installed on
 * GitHub until they uninstall it there; its events are ignored meanwhile.
 */
export const DELETE = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  if (org.ownerId !== me.id) throw new ApiError("forbidden", "Only the workspace owner can disconnect GitHub.");
  limit(`github-disconnect:${me.id}`, 20, 60 * 60_000);
  await disconnectInstallation(org.id);
  return json({ connected: false });
});
