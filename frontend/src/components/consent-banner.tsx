"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { onConsentOpen, openConsentSettings, readConsent, saveConsent } from "@/lib/consent";
import { cn } from "@/lib/utils";
import { Button } from "./button";

const CATEGORIES = [
  { key: "essential", label: "Essential", body: "Your login, your theme and this choice. The site can't work without them.", locked: true },
  { key: "analytics", label: "Analytics", body: "How the site is used, to improve it. Rosetta has none today; this stays off unless you turn it on.", locked: false },
  { key: "embeds", label: "Embedded content", body: "Videos or widgets from other sites. Rosetta has none today; this stays off unless you turn it on.", locked: false },
] as const;

/**
 * The storage notice. Equal-weight "Accept all" and "Essential only", a
 * "Choose" panel with nothing optional pre-ticked, and no silent dismissal:
 * Esc does nothing until a choice is made. Shown again when the policy
 * version changes. The footer's "Storage settings" reopens it.
 */
export function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [prefs, setPrefs] = useState({ analytics: false, embeds: false });
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const saved = readConsent();
    if (!saved) setOpen(true);
    else setPrefs({ analytics: saved.analytics, embeds: saved.embeds });
    return onConsentOpen(() => {
      const current = readConsent();
      if (current) setPrefs({ analytics: current.analytics, embeds: current.embeds });
      setChoosing(true);
      setOpen(true);
    });
  }, []);

  // Move focus in on first show, but never away from a field someone is typing in.
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    if (!active || active === document.body) ref.current?.focus({ preventScroll: true });
  }, [open, choosing]);

  if (!open) return null;

  const decide = (choice: { analytics: boolean; embeds: boolean }) => {
    saveConsent(choice);
    setPrefs(choice);
    setOpen(false);
    setChoosing(false);
  };

  return (
    <div
      ref={ref}
      role="region"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed outline-none inset-x-0 bottom-0 z-[60] px-(--gutter) pb-[max(env(safe-area-inset-bottom),16px)] print:hidden"
    >
      <div className="glass mx-auto max-w-(--w-app) rounded-lg p-5 shadow-elev-3 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[40rem]">
            <h2 id={titleId} className="t-body font-semibold text-fg-1">
              Your browser storage
            </h2>
            <p className="mt-1 t-small text-fg-2">
              Rosetta stores only what it needs to work: your login, your theme and this choice. No cookies, analytics or ads.{" "}
              <Link href="/cookies" className="font-medium text-fg-1 underline underline-offset-4">
                Cookie Policy
              </Link>
            </p>
          </div>
          {!choosing && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => decide({ analytics: true, embeds: true })}>Accept all</Button>
              <Button onClick={() => decide({ analytics: false, embeds: false })}>Essential only</Button>
              <button type="button" onClick={() => setChoosing(true)} className="press inline-flex h-10 items-center rounded-sm px-3 t-small font-medium text-fg-1 underline underline-offset-4 pointer-coarse:h-11">
                Choose
              </button>
            </div>
          )}
        </div>

        {choosing && (
          <form
            className="mt-4 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              decide(prefs);
            }}
          >
            <fieldset className="grid gap-2">
              <legend className="sr-only">Storage categories</legend>
              {CATEGORIES.map((c) => {
                const checked = c.locked ? true : prefs[c.key as "analytics" | "embeds"];
                return (
                  <label key={c.key} className={cn("flex items-start justify-between gap-4 rounded-sm bg-surface-1 p-3 shadow-ring", !c.locked && "cursor-pointer")}>
                    <span>
                      <span className="block t-small font-semibold text-fg-1">
                        {c.label}
                        {c.locked && <span className="font-normal text-fg-3"> (always on)</span>}
                      </span>
                      <span className="block t-micro text-fg-3">{c.body}</span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={checked}
                      disabled={c.locked}
                      aria-checked={checked}
                      onChange={(e) => setPrefs((p) => ({ ...p, [c.key]: e.target.checked }))}
                      className="mt-1 size-5 shrink-0 cursor-pointer accent-(--btn-primary-bg) disabled:cursor-not-allowed"
                    />
                  </label>
                );
              })}
            </fieldset>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" onClick={() => decide({ analytics: false, embeds: false })}>
                Essential only
              </Button>
              <Button type="submit" variant="primary">
                Save my choice
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** For the Cookie Policy page: reopens the same panel. */
export function StorageSettingsButton() {
  return (
    <p className="mt-4">
      <Button onClick={openConsentSettings}>Open storage settings</Button>
    </p>
  );
}
