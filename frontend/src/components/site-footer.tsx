"use client";

import Link from "next/link";
import { openConsentSettings } from "@/lib/consent";
import { CONTACT_EMAIL, LEGAL_ENTITY, LEGAL_PAGES, SOURCE_URL } from "@/lib/legal";
import { cn } from "@/lib/utils";

/** Legal links, business details and storage settings, on every page. */
export function SiteFooter({ className }: { className?: string }) {
  const link = "rounded-xs transition-[color] duration-150 hover:text-fg-1";
  return (
    <footer className={cn("mx-auto max-w-(--w-app) px-(--gutter) pt-8 pb-12 t-small text-fg-3 print:hidden", className)}>
      <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2">
        {LEGAL_PAGES.map((p) => (
          <Link key={p.href} href={p.href} className={link}>
            {p.label}
          </Link>
        ))}
        <button type="button" onClick={openConsentSettings} className={cn(link, "cursor-pointer underline-offset-4")}>
          Storage settings
        </button>
      </nav>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p>
          © {new Date().getFullYear()} {LEGAL_ENTITY} ·{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
            {CONTACT_EMAIL}
          </a>
        </p>
        <p className="flex flex-wrap gap-x-4">
          <span>Built for Devlympics 2026</span>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer" className={link}>
            Source code<span className="sr-only"> (opens GitHub in a new tab)</span>
          </a>
        </p>
      </div>
    </footer>
  );
}
