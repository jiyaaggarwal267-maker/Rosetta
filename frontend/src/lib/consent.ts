import { POLICY_VERSION } from "./legal";

/**
 * Browser storage consent. Rosetta only uses essential storage today (your
 * login, your theme, the demo's "already played" flag), so nothing optional
 * runs. Anything optional added later (analytics, embeds) must check
 * hasConsent() before it loads.
 */

export type ConsentCategory = "essential" | "analytics" | "embeds";
export type ConsentChoice = { version: string; decidedAt: string; analytics: boolean; embeds: boolean };

const KEY = "rosetta:consent";
const OPEN_EVENT = "rosetta:consent-open";
const CHANGE_EVENT = "rosetta:consent-change";

export function readConsent(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const choice = JSON.parse(raw) as ConsentChoice;
    // A new policy version asks again.
    return choice.version === POLICY_VERSION ? choice : null;
  } catch {
    return null;
  }
}

export function saveConsent(choice: { analytics: boolean; embeds: boolean }) {
  const value: ConsentChoice = { version: POLICY_VERSION, decidedAt: new Date().toISOString(), ...choice };
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the choice holds for this visit only.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
  return value;
}

/** Essential storage is always allowed; everything else needs a recorded "yes" for this policy version. */
export function hasConsent(category: ConsentCategory) {
  if (category === "essential") return true;
  return readConsent()?.[category] === true;
}

/** The footer's "Storage settings" link reopens the panel. */
export const openConsentSettings = () => window.dispatchEvent(new Event(OPEN_EVENT));
export const onConsentOpen = (fn: () => void) => {
  window.addEventListener(OPEN_EVENT, fn);
  return () => window.removeEventListener(OPEN_EVENT, fn);
};
export const onConsentChange = (fn: () => void) => {
  window.addEventListener(CHANGE_EVENT, fn);
  return () => window.removeEventListener(CHANGE_EVENT, fn);
};
