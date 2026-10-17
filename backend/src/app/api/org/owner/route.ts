import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { isLead, orgMembers, requireOrg } from "@/lib/org";
import { store } from "@/lib/store";
import type { Org } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** POST /api/org/owner { userId }: the owner hands the workspace to another CMO or manager. */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  if (org.ownerId !== me.id) throw new ApiError("forbidden", "Only the workspace owner can hand it over.");
  const { userId } = await readJson(req, z.object({ userId: z.string().min(1) }));
  const next = (await orgMembers(org.id)).find((u) => u.id === userId);
  if (!next || next.id === me.id) throw new ApiError("not_found");
  if (!isLead(next.role) || next.status !== "active") {
    throw new ApiError("bad_request", "Hand the workspace to a CMO or manager who has joined.");
  }
  await store.set<Org>("orgs", org.id, { ...org, ownerId: next.id });
  return json({ ownerId: next.id });
});
