import { z } from "zod";

const ROLES = ["engineer", "senior", "intern", "manager", "client", "cmo"] as const;

/** Zero-width and bidi-control characters: invisible, or they flip how the text around them reads. */
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

const name = z
  .string()
  .transform((v) => v.replace(INVISIBLE, "").trim())
  .pipe(z.string().min(1, "Enter a name.").max(80));
/** Trimmed before the format check, so a pasted " you@company.com " still works. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter an email like you@company.com.").max(200));
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(200)
  .refine((v) => v.trim().length > 0, "A password can't be only spaces.");
const email = emailSchema;
const password = passwordSchema;
const optionalText = z.string().trim().max(80).optional();
const githubLogin = z
  .union([z.literal(""), z.string().trim().regex(/^[A-Za-z0-9-]{1,39}$/, "That isn't a GitHub username.")])
  .optional()
  .transform((v) => v || undefined);
const focus = z.array(z.enum(["timelines", "cost", "risk", "how-it-works", "user-impact"])).max(5);
const language = z.enum(["en", "hinglish"]);

export const roleSchema = z.enum(ROLES);

/** Required tick for the Terms and Privacy Policy, optional tick for product emails. */
const consent = {
  acceptTerms: z.boolean().optional(),
  marketingOptIn: z.boolean().default(false),
};

/** Signup and join refuse to continue without the Terms ticked. */
export function requireTerms(acceptTerms: boolean | undefined) {
  if (acceptTerms !== true) {
    return "Tick the box to agree to the Terms and confirm you've read the Privacy Policy.";
  }
  return null;
}

/** Creating a workspace: only the person at the top (a CMO or a manager) signs up directly. */
export const signupSchema = z.object({
  name,
  email,
  password,
  role: z.enum(["cmo", "manager"]),
  orgName: z.string().trim().min(1, "Name your workspace.").max(80),
  teamName: optionalText,
  title: optionalText,
  githubLogin,
  focus: focus.default([]),
  language: language.default("en"),
  ...consent,
});

/** A lead adding someone under them. */
export const memberSchema = z.object({
  name,
  email,
  role: roleSchema,
  title: optionalText,
  githubLogin,
  teamName: optionalText,
  managerId: z.string().optional(),
});

/** Invite codes stop working two weeks after they're made. Older invites saved without a date never expire. */
export const INVITE_TTL_MS = 14 * 24 * 3_600_000;
export const inviteExpired = (invite: { createdAt?: string }) =>
  Boolean(invite.createdAt) && Date.now() - Date.parse(invite.createdAt!) > INVITE_TTL_MS;

/** Accepting an invite. */
export const joinSchema = z.object({
  code: z.string().trim().min(4).max(40),
  password,
  name: name.optional(),
  title: optionalText,
  githubLogin,
  focus: focus.optional(),
  language: language.optional(),
  ...consent,
});

/** What people may change about themselves. Their role is set by whoever added them. */
export const meSchema = z.object({
  name: name.optional(),
  title: optionalText,
  githubLogin,
  teamName: optionalText,
  focus: focus.optional(),
  language: language.optional(),
  marketingOptIn: z.boolean().optional(),
  /** Emails about pushes by people you manage. The bell always shows them. */
  notifyEmailOnPush: z.boolean().optional(),
});
