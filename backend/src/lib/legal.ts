/**
 * The versions of the Terms and Privacy Policy a user accepts at signup or
 * join. Keep in step with POLICY_VERSION in frontend/src/lib/legal.ts: when
 * either document changes materially, bump both.
 */
export const TERMS_VERSION = process.env.TERMS_VERSION || "2026-10-18";
export const PRIVACY_VERSION = process.env.PRIVACY_VERSION || "2026-10-18";

/** Stamped on a user when they accept. */
export const acceptance = (marketingOptIn: boolean) => ({
  termsAcceptedAt: new Date().toISOString(),
  termsVersion: TERMS_VERSION,
  privacyVersion: PRIVACY_VERSION,
  marketingOptIn,
});
