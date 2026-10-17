import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, route } from "@/lib/http";
import { isLead, requireOrg } from "@/lib/org";
import { store } from "@/lib/store";
import type { Org } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const REPO = /^[\w.-]+\/[\w.-]+$/;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  repos: z
    .array(
      z
        .string()
        .trim()
        .transform((r) => r.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$|\/$/g, ""))
        .refine((r) => REPO.test(r), "Use owner/repo, e.g. code-crunchers/rosetta-demo."),
    )
    .max(20)
    .optional(),
});

/** PATCH /api/org { name?, repos? }: leads choose which repos Rosetta watches. */
export const PATCH = route(async (req) => {
  const me = await requireUser(req);
  if (!isLead(me.role)) throw new ApiError("forbidden", "Only a CMO or manager can change workspace settings.");
  const org = await requireOrg(me);
  const patch = patchSchema.parse(await req.json().catch(() => ({})));
  if (patch.name && org.ownerId !== me.id) throw new ApiError("forbidden", "Only the person who created the workspace can rename it.");
  const next: Org = {
    ...org,
    ...(patch.name ? { name: patch.name } : {}),
    ...(patch.repos ? { repos: [...new Set(patch.repos.map((r) => r.toLowerCase()))] } : {}),
  };
  await store.set("orgs", org.id, next);
  return json({ org: { id: next.id, name: next.name, repos: next.repos } });
});
