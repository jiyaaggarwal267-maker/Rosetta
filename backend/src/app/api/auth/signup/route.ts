import { randomBytes } from "node:crypto";
import { hashPassword, issueToken, publicUser, userIdFor } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { acceptance } from "@/lib/legal";
import { requireTerms, signupSchema } from "@/lib/profile";
import { clientIp, limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import type { Org, StoredUser } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * POST /api/auth/signup → 201 { token, user, org }
 * Creates a workspace with its first person (a CMO or a manager) at the top.
 * Everyone else joins through an invite from their lead.
 */
export const POST = route(async (req) => {
  limit(`signup:${clientIp(req)}`, 10, 60 * 60_000);
  const { password, orgName, acceptTerms, marketingOptIn, ...profile } = await readJson(req, signupSchema);
  const missing = requireTerms(acceptTerms);
  if (missing) throw new ApiError("terms_required", missing);
  const id = userIdFor(profile.email);
  await assertEmailFree(id);
  const passwordHash = await hashPassword(password);
  // Checked again after the slow hash: two signups with one email would otherwise both create a workspace.
  await assertEmailFree(id);
  // Each workspace gets its own share of the AI quota, so one address can't open many a day.
  limit(`signup-day:${clientIp(req)}`, 3, 24 * 60 * 60_000);
  const now = new Date().toISOString();
  const org: Org = {
    id: `o_${randomBytes(6).toString("hex")}`,
    name: orgName,
    ownerId: id,
    repos: [],
    webhookSecret: randomBytes(20).toString("hex"),
    createdAt: now,
  };
  const user: StoredUser = {
    ...profile,
    id,
    orgId: org.id,
    status: "active",
    ...acceptance(marketingOptIn),
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };
  await store.set("orgs", org.id, org);
  await store.set("users", id, user);
  return json({ token: issueToken(user), user: publicUser(user), org: { id: org.id, name: org.name } }, 201);
});

async function assertEmailFree(id: string) {
  const existing = await store.get<StoredUser>("users", id);
  if (!existing) return;
  // Added by a lead but not joined yet. Signing up must not take the account over
  // without proof of the email, so point them at the invite (Forgot password sends it again).
  if (existing.status === "invited") {
    throw new ApiError(
      "conflict",
      "This email has been invited to a workspace. Use the link in your invite email, or use Forgot password to get it sent again.",
    );
  }
  throw new ApiError("conflict", "An account with this email already exists. Log in instead.");
}
