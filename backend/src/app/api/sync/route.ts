import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, route } from "@/lib/http";
import { isLead, orgMembers, requireOrg } from "@/lib/org";
import { syncOrg } from "@/lib/sync";

export const dynamic = "force-dynamic";
// Explaining, checking and one rewrite can take a couple of minutes (the Vercel Hobby maximum is 300 s).
export const maxDuration = 300;
export const OPTIONS = preflight;

/** POST /api/sync: pull new commits and comments from the watched repos now. */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  if (!isLead(me.role)) throw new ApiError("forbidden", "Only a CMO or manager can sync.");
  const org = await requireOrg(me);
  if (!org.repos.length) throw new ApiError("bad_request", "Add a repository to watch first.");
  return json(await syncOrg(org, await orgMembers(org.id)));
});
