import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { userIdFor } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { mailConfigured, sendInvite, sendPasswordReset } from "@/lib/mail";
import { isSamplePerson } from "@/lib/org";
import { emailSchema, inviteExpired } from "@/lib/profile";
import { RESET_TTL_MS, resetId, type Reset } from "@/lib/resets";
import { clientIp, limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import type { Org, StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * POST /api/auth/forgot { email } → always { sent: true }
 * The same answer whether or not the account exists, so nobody can probe
 * which emails are registered. Someone invited but not joined yet gets their
 * invite again instead of a reset link.
 */
export const POST = route(async (req) => {
  if (!mailConfigured()) throw new ApiError("unavailable", "Email isn't set up on this server yet.");
  const { email } = await readJson(req, z.object({ email: emailSchema }));
  limit(`forgot:${email}`, 3, 15 * 60_000);
  limit(`forgot-ip:${clientIp(req)}`, 10, 15 * 60_000);
  const user = await store.get<StoredUser>("users", userIdFor(email));

  if (user && user.status === "active" && user.passwordHash) {
    const token = randomBytes(32).toString("hex");
    const now = Date.now();
    const id = resetId(token);
    await store.set("resets", id, { id, userId: user.id, expiresAt: now + RESET_TTL_MS, createdAt: now } satisfies Reset);
    after(() => sendPasswordReset({ to: user.email, name: user.name, token }));
  } else if (user && user.status === "invited" && user.inviteCode && !isSamplePerson(user)) {
    // Added by a lead but not joined yet: send the invite again, so whoever owns the
    // email can claim the account (joining sets the password and asks for the Terms).
    const code = user.inviteCode;
    const [org, inviter, invite] = await Promise.all([
      store.get<Org>("orgs", user.orgId),
      user.managerId ? store.get<StoredUser>("users", user.managerId) : null,
      store.get<{ userId: string; orgId: string; createdAt?: string }>("invites", code),
    ]);
    if (org && invite) {
      // Invites expire. Only an expired one restarts its clock when sent again, so
      // asking over and over can't keep a live invite open forever.
      if (inviteExpired(invite)) await store.set("invites", code, { ...invite, createdAt: new Date().toISOString() });
      after(() => sendInvite({ to: user.email, name: user.name, inviter: inviter?.name ?? org.name, orgName: org.name, role: user.role, code }));
    }
  }
  return json({ sent: true });
});
