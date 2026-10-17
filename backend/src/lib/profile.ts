import { z } from "zod";

const ROLES = ["engineer", "senior", "intern", "manager", "client", "cmo"] as const;

const name = z.string().trim().min(1, "Enter a name.").max(80);
const email = z.email("Enter an email like you@company.com.").trim().toLowerCase().max(200);
const password = z.string().min(8, "Use at least 8 characters.").max(200);
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
});
