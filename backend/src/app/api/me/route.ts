import { z } from "zod";
import { deleteWorkspace, removeMember } from "@/lib/account";
import { publicUser, requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { orgMembers } from "@/lib/org";
import { meSchema } from "@/lib/profile";
import { store } from "@/lib/store";
import type { Org, StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** GET /api/me → { user, org } */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const org = await store.get<Org>("orgs", user.orgId);
  return json({ user, org: org ? { id: org.id, name: org.name, ownerId: org.ownerId } : null });
});

/** PATCH /api/me → { user }. Role and email can't change here. */
export const PATCH = route(async (req) => {
  const { id } = await requireUser(req);
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = meSchema.parse(raw);
  // Only the fields the request actually sent.
  const patch = Object.fromEntries(Object.entries(parsed).filter(([key]) => key in raw));
  const stored = await store.get<StoredUser>("users", id);
  if (!stored) throw new ApiError("unauthorized");
  const next: StoredUser = { ...stored, ...patch, updatedAt: new Date().toISOString() };
  await store.set("users", id, next);
  return json({ user: publicUser(next) });
});

/**
 * DELETE /api/me { confirm: "<your email>", deleteWorkspace? }
 * Deletes your account. Your comments and messages stay for your team as
 * "Former member". The owner must hand the workspace over first, or delete
 * the whole workspace (every member's account and all its data) with
 * deleteWorkspace: true.
 */
export const DELETE = route(async (req) => {
  const me = await requireUser(req);
  const body = await readJson(req, z.object({ confirm: z.string().trim().toLowerCase(), deleteWorkspace: z.boolean().default(false) }));
  if (body.confirm !== me.email.toLowerCase()) throw new ApiError("bad_request", "Type your email exactly to confirm.");
  const org = await store.get<Org>("orgs", me.orgId);
  const users = await orgMembers(me.orgId);
  const stored = users.find((u) => u.id === me.id);
  if (!org || !stored) throw new ApiError("unauthorized");

  if (org.ownerId === me.id) {
    if (!body.deleteWorkspace) {
      throw new ApiError(
        "conflict",
        users.length > 1
          ? "You own this workspace. Hand it to another CMO or manager first, or delete the whole workspace."
          : "You own this workspace. Deleting your account deletes the workspace too; confirm that to continue.",
      );
    }
    await deleteWorkspace(org);
    return json({ deleted: me.id, workspaceDeleted: true });
  }
  await removeMember(org, stored, users);
  return json({ deleted: me.id, workspaceDeleted: false });
});
