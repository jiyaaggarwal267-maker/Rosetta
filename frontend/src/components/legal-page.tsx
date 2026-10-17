import Link from "next/link";
import type { ReactNode } from "react";
import { EFFECTIVE_DATE, LEGAL_PAGES, POLICY_VERSION } from "@/lib/legal";
import { cn } from "@/lib/utils";
import { AccountNav } from "./account-nav";
import { Nav } from "./nav";
import { SiteFooter } from "./site-footer";
import { ThemeToggle } from "./theme-toggle";

/**
 * The frame for every legal page: a list of all of them, the title and date,
 * an "In plain words" summary, the full text, and the not-legal-advice note.
 * Solid surfaces only (no glass on reading surfaces), reading width.
 */
export function LegalPage({
  current,
  title,
  plain,
  children,
  dated = true,
}: {
  current: (typeof LEGAL_PAGES)[number]["href"];
  title: string;
  /** 3 to 5 sentences, the way Rosetta explains things to a non-technical reader. */
  plain: ReactNode;
  children: ReactNode;
  dated?: boolean;
}) {
  return (
    <>
      <Nav>
        <AccountNav />
        <ThemeToggle />
      </Nav>
      <div className="mx-auto grid max-w-(--w-app) gap-10 px-(--gutter) pt-10 pb-16 md:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="Legal pages" className="md:sticky md:top-[calc(var(--nav-h)+24px)] md:self-start">
          <p className="t-micro font-semibold tracking-wide text-fg-3 uppercase">Legal</p>
          <ul className="mt-3 flex flex-wrap gap-2 md:grid md:gap-1">
            {LEGAL_PAGES.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  aria-current={p.href === current ? "page" : undefined}
                  className={cn(
                    "press inline-flex min-h-11 items-center rounded-sm px-3 t-small md:min-h-9",
                    p.href === current ? "bg-surface-1 font-medium text-fg-1 shadow-elev-1" : "text-fg-2 hover:bg-surface-2 hover:text-fg-1",
                  )}
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" className="min-w-0">
          <article className="max-w-(--w-read)">
            <h1 className="t-title text-balance text-fg-1">{title}</h1>
            {dated && (
              <p className="mt-3 t-small text-fg-3">
                Last updated {EFFECTIVE_DATE} · Version {POLICY_VERSION}
              </p>
            )}
            <section aria-labelledby="plain-heading" className="mt-8 rounded-md bg-surface-1 p-6 shadow-elev-1">
              <h2 id="plain-heading" className="t-heading text-fg-1">
                In plain words
              </h2>
              <div className="mt-2 grid gap-2 t-body text-fg-2">{plain}</div>
            </section>
            <div className="legal mt-10">{children}</div>
            <p className="mt-12 rounded-md p-4 t-small text-fg-2 shadow-ring">
              This document is a starting template and is not legal advice. Have it reviewed by a qualified lawyer before launch.
            </p>
          </article>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}

/** A plain table for legal pages; scrolls sideways inside itself on small screens. */
export function LegalTable({ head, rows, caption }: { head: string[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="my-6 overflow-x-auto rounded-md shadow-ring" tabIndex={0} role="region" aria-label={caption ?? head.join(", ")}>
      <table className="w-full min-w-[36rem] border-collapse text-left t-small">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-surface-2 text-fg-1">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2.5 align-bottom font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-fg-2">
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-(--ring) align-top">
              {r.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-3 py-2.5 font-medium text-fg-1">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className="px-3 py-2.5">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
