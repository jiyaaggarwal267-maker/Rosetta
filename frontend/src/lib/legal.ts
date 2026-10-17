/**
 * Business and legal details shown on the legal pages, the footer and
 * /contact. Every value in [square brackets] is a placeholder the team must
 * fill in before launch. Nothing here is made up on purpose: if you don't
 * know a value yet, leave the placeholder.
 *
 * POLICY_VERSION must match TERMS_VERSION / PRIVACY_VERSION in
 * backend/src/lib/legal.ts. Bump all of them when a policy changes
 * materially: the consent banner then asks again.
 */

export const LEGAL_ENTITY = "[Legal entity name]";
export const PRODUCT_NAME = "Rosetta";
export const ADDRESS = "[Registered address]";
export const CONTACT_EMAIL = "[Contact email]";
export const GRIEVANCE_OFFICER = { name: "[Grievance Officer name]", email: "[Grievance Officer email]" };
export const JURISDICTION_CITY = "[City]";
export const EFFECTIVE_DATE = "[Effective date]";
export const POLICY_VERSION = "2026-10-18";
/** How long a grievance may take to resolve. Confirm against the current DPDP Rules before launch. */
export const GRIEVANCE_RESPONSE = "[Response time, e.g. acknowledged within 24 hours, resolved within 15 days]";
/** Refund window for paid plans, once they exist. */
export const REFUND_WINDOW = "[X days]";
export const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/code-crunchers/rosetta";

/** The legal pages, in footer order. */
export const LEGAL_PAGES = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/cookies", label: "Cookies" },
  { href: "/refunds", label: "Refunds" },
  { href: "/data", label: "Your data" },
  { href: "/contact", label: "Contact" },
  { href: "/licenses", label: "Licences" },
] as const;

/** True while a value is still a placeholder, so pages can flag it. */
export const isPlaceholder = (value: string) => /^\[.*\]$/.test(value);
