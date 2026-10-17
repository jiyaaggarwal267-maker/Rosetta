import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, route } from "@/lib/http";
import { heirOf, moveReports, removeMember } from "@/lib/account";
import { CAN_ADD, descendants, orgMembers, personOf, requireOrg } from "@/lib/org";
import { roleSchema } from "@/lib/profile";
import { store } from "@/lib/store";
import type { Org, StoredCard, StoredUser, User } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().max(80).optional(),
  githubLogin: z
    .union([z.literal(""), z.string().trim().regex(/^[A-Za-z0-9-]{1,39}$/, "That isn't a GitHub username.")])
    .optional(),
  teamName: z.string().trim().max(80).optional(),
  // Owner only:
  role: roleSchema.optional(),
  managerId: z.string().optional(),
});

/**
 * PATCH /api/team/members/:id
 * A lead fixes someone's title, GitHub username or team name. The workspace
 * owner can also change their role and who they report to.
 */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const org = await requireOrg(me);
  const users = await orgMembers(org.id);
  const member = users.find((u) => u.id === id);
  if (!member) throw new ApiError("not_found");
  const owner = org.ownerId === me.id;
  const manages = owner || me.role === "cmo" || descendants(me.id, users).some((u) => u.id === id);
  if (!manages) throw new ApiError("forbidden", "You can only edit people on your team.");

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = patchSchema.parse(raw);
  const sent = <K extends keyof typeof parsed>(k: K) => k in raw && parsed[k] !== undefined;
  const now = new Date().toISOString();
  const next: StoredUser = { ...member, updatedAt: now };

  for (const k of ["title", "githubLogin", "teamName"] as const) {
    if (k in raw) next[k] = parsed[k] || undefined;
  }

  if (sent("role") || sent("managerId")) {
    if (!owner) throw new ApiError("forbidden", "Only the workspace owner can change roles or reporting lines.");
    if (id === org.ownerId) throw new ApiError("forbidden", "The owner stays at the top of the workspace.");
  }

  if (sent("role") && parsed.role !== member.role) {
    const role = parsed.role!;
    if (!CAN_ADD[me.role].includes(role)) throw new ApiError("forbidden", `Someone can't be made a ${role} here.`);
    next.role = role;
    if (role !== "manager") {
      // A manager who steps down hands their team to the person above them.
      next.teamName = undefined;
      await moveReports(member, heirOf(member, org), users, now);
    }
  }

  if (sent("managerId") && parsed.managerId !== member.managerId) {
    const target = users.find((u) => u.id === parsed.managerId);
    const valid =
      target &&
      target.id !== id &&
      (target.id === org.ownerId || target.role === "manager") &&
      !descendants(id, users).some((u) => u.id === target.id);
    if (!valid) throw new ApiError("bad_request", "They can only report to the owner or a manager outside their own team.");
    next.managerId = target!.id;
  }

  await store.set("users", id, next);
  const after = await orgMembers(org.id);
  return json({ member: personOf(next, after) });
});

/**
 * DELETE /api/team/members/:id: the owner removes someone from the workspace.
 * Their reports move up, and their changes stay with the team.
 */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const org = await requireOrg(me);
  if (org.ownerId !== me.id) throw new ApiError("forbidden", "Only the workspace owner can remove people.");
  if (id === me.id) throw new ApiError("forbidden", "The owner can't remove themselves.");

  const users = await orgMembers(org.id);
  const member = users.find((u) => u.id === id);
  if (!member) throw new ApiError("not_found");
  await removeMember(org, member, users);
  return json({ removed: id });
});
