import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { requeueUnassigned } from "@/lib/jobs";
import { assignableBy, isLead, orgMembers, requireOrg } from "@/lib/org";
import { kickJobs } from "@/lib/qstash";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import type { Org } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const OPTIONS = preflight;

const schema = z
  .object({
    login: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,39}(\[bot\])?$/, "That isn't a GitHub username.").optional(),
    email: z.string().trim().toLowerCase().pipe(z.email("That isn't an email address.").max(200)).optional(),
    userId: z.string().min(1).max(80),
  })
  .strict()
  .refine((b) => Boolean(b.login) !== Boolean(b.email), "Send a GitHub username or an email, not both.");

/**
 * POST /api/github/unassigned/assign { login | email, userId } → { key, userId, requeued }
 * Says whose commits these are. Remembered for the workspace (later pushes
 * by that username or email go to them too) and their waiting commits are explained now.
 */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  if (!isLead(me.role)) throw new ApiError("forbidden", "Only a CMO or manager can assign GitHub commits.");
  limit(`github-assign:${me.id}`, 60, 60 * 60_000);
  const body = await readJson(req, schema);
  const org = await requireOrg(me);
  const users = await orgMembers(org.id);
  const target = assignableBy(me, users).find((u) => u.id === body.userId);
  if (!target) throw new ApiError("forbidden", "You can only assign commits to people on your team.");
  const key = (body.login ?? body.email)!;
  // A username someone already uses always matches them first, so an alias for it would never apply.
  const holder = body.login ? users.find((u) => u.githubLogin?.toLowerCase() === key) : undefined;
  if (holder && holder.id !== target.id) throw new ApiError("conflict", `${holder.name} already uses the GitHub username ${key}.`);

  const latest = (await store.get<Org>("orgs", org.id)) ?? org;
  await store.set<Org>("orgs", org.id, { ...latest, githubAliases: { ...latest.githubAliases, [key]: target.id } });
  const requeued = await requeueUnassigned(org.id, [key], target.id);
  if (requeued) await kickJobs(org.id, new URL(req.url).origin);
  return json({ key, userId: target.id, requeued });
});
