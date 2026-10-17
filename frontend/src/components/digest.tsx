"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isLead } from "@/lib/roles";
import { useSession } from "@/lib/session";
import * as api from "@/lib/api";
import type { Digest } from "@/lib/types";
import { firstName, timeAgo } from "@/lib/utils";
import { Page } from "./app-shell";
import { Button } from "./button";
import { StatTile } from "./feed";
import { Avatar, PersonLine } from "./person";
import { RiskBadge } from "./risk-badge";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** The week on one page: what shipped, what needs a look, who did what. Printable. */
export function DigestView() {
  const { user } = useSession();
  const [week, setWeek] = useState(0);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let current = true;
    setDigest(null);
    api
      .getDigest(week)
      .then((d) => current && (setDigest(d), setError(false)))
      .catch(() => current && setError(true));
    return () => {
      current = false;
    };
  }, [week]);

  return (
    <Page
      title="This week"
      lead={digest ? `${fmt(digest.range.from)} to ${fmt(digest.range.to)}${digest.org.name ? ` · ${digest.org.name}` : ""}` : "Everything that changed, on one page."}
      actions={
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button onClick={() => setWeek((w) => Math.min(12, w + 1))} aria-label="Previous week">
            Earlier
          </Button>
          <Button onClick={() => setWeek((w) => Math.max(0, w - 1))} disabled={week === 0} aria-label="Next week">
            Later
          </Button>
          <Button variant="primary" onClick={() => window.print()} disabled={!digest}>
            Save as PDF
          </Button>
        </div>
      }
    >
      {error ? (
        <p className="t-body text-fg-2">The digest can&rsquo;t load right now. Try again in a minute.</p>
      ) : !digest ? (
        <p className="t-body text-fg-3" role="status">
          Putting the week together…
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          <p className="max-w-(--w-read) t-heading text-pretty text-fg-1">{digest.headline}</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Changes" value={digest.stats.changes} />
            <StatTile label="Reviewed" value={digest.stats.reviewed} />
            <StatTile label="Medium or high risk" value={digest.stats.risky} tone="attention" />
            <StatTile label="Questions asked" value={digest.stats.questions} />
          </div>

          {digest.attention.length > 0 && (
            <section aria-labelledby="attention-heading" className="grid gap-3">
              <h2 id="attention-heading" className="t-heading text-fg-1">
                Needs your attention
              </h2>
              <ul className="grid grid-cols-1 gap-3">
                {digest.attention.map((c) => (
                  <li key={`a-${c.id}`} className="rounded-md bg-surface-1 p-5 shadow-elev-1 break-inside-avoid">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <Link href={`/app/c/${c.id}`} className="t-body font-semibold text-fg-1 hover:underline">
                        {c.title}
                      </Link>
                      <RiskBadge risk={c.risk} />
                    </div>
                    <p className="mt-1 t-small text-(--risk-medium)">{c.reason}</p>
                    <p className="mt-2 t-small text-fg-2">{c.summary}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-1 items-start gap-8 card:grid-cols-12">
            <section aria-labelledby="shipped-heading" className="grid min-w-0 gap-3 card:col-span-8">
              <h2 id="shipped-heading" className="t-heading text-fg-1">
                What changed
              </h2>
              {digest.highlights.length === 0 ? (
                <p className="rounded-md p-8 text-center t-body text-fg-2 shadow-ring">No changes this week.</p>
              ) : (
                <ol className="grid grid-cols-1 gap-3">
                  {digest.highlights.map((c) => (
                    <li key={c.id} className="rounded-md bg-surface-1 p-5 shadow-elev-1 break-inside-avoid">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <Link href={`/app/c/${c.id}`} className="t-body font-semibold text-fg-1 hover:underline">
                          {c.title}
                        </Link>
                        <RiskBadge risk={c.risk} />
                      </div>
                      <p className="mt-1 t-small text-fg-3">
                        <PersonLine person={c.author} fallback={c.authorName} className="text-fg-3" /> · {timeAgo(c.committedAt)} ·{" "}
                        {c.status === "approved" ? `Reviewed by ${firstName(c.authorName)}` : "Not reviewed yet"}
                      </p>
                      <p className="mt-3 t-body text-fg-1">{c.summary}</p>
                      <p className="mt-1 t-small text-fg-2">{c.impact}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <aside className="grid min-w-0 gap-6 card:col-span-4">
              <section className="rounded-md bg-surface-1 p-6 shadow-elev-1 break-inside-avoid">
                <h2 className="t-heading text-fg-1">Who shipped what</h2>
                {digest.people.length === 0 ? (
                  <p className="mt-3 t-small text-fg-2">Nobody pushed changes this week.</p>
                ) : (
                  <ul className="mt-4 grid gap-3">
                    {digest.people.map((p) => (
                      <li key={p.person.id} className="flex items-center gap-3">
                        <Avatar name={p.person.name} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate t-small font-semibold text-fg-1">{p.person.name}</p>
                          <p className="t-micro text-fg-3">
                            {p.changes} change{p.changes === 1 ? "" : "s"} · {p.reviewed} reviewed
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {digest.waiting.length > 0 && (
                <section className="rounded-md bg-surface-1 p-6 shadow-elev-1 break-inside-avoid">
                  <h2 className="t-heading text-fg-1">Still waiting for an answer</h2>
                  <ul className="mt-4 grid gap-2">
                    {digest.waiting.map((t) => (
                      <li key={t.id}>
                        <Link href={`/app/questions/${t.id}`} className="t-small font-medium text-fg-1 hover:underline">
                          {t.subject}
                        </Link>
                        <p className="t-micro text-fg-3">
                          {t.to.name} · asked {timeAgo(t.since)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          </div>

          {user && isLead(user.role) && week === 0 && <WeeklyReport />}
        </div>
      )}
    </Page>
  );
}

/**
 * The Monday email to the workspace owner: one engineer's week, every change
 * with its flowchart, written for the owner. Preview it here, then send it.
 */
function WeeklyReport() {
  const [options, setOptions] = useState<api.ReportOptions | null>(null);
  const [engineer, setEngineer] = useState("");
  const [sample, setSample] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [height, setHeight] = useState(600);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    api
      .getReportOptions()
      .then((o) => {
        setOptions(o);
        setEngineer(o.engineers.find((e) => e.changes > 0)?.id ?? o.engineers[0]?.id ?? "");
        setSample(o.demo);
      })
      .catch(() => {});
  }, []);

  if (!options || !options.engineers.length || !options.owner) return null;
  const chosen = options.engineers.find((e) => e.id === engineer);

  const run = async (send: boolean) => {
    setBusy(send ? "send" : "preview");
    try {
      const r = await api.weeklyReport({ engineerId: engineer, sample, send });
      setPreview({ subject: r.subject, html: r.html });
      if (send) toast(r.sent ? `Sent to ${r.to}.` : options.email ? `Couldn't email ${r.to}. Their address may be a sample one.` : "Email isn't set up on the server, so here's the preview.");
    } catch (e) {
      toast(e instanceof api.ApiError && e.detail ? e.detail : "The report couldn't be made. Try again in a minute.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="report-heading" className="rounded-md bg-surface-1 p-6 shadow-elev-1 print:hidden">
      <h2 id="report-heading" className="t-heading text-fg-1">
        Weekly report email
      </h2>
      <p className="mt-1 max-w-(--w-read) t-small text-fg-2">
        Every Monday, {options.owner.isMe ? "you get" : `${options.owner.name} gets`} one email per week: what each engineer shipped, every change
        with its flowchart and a worked example, written for {options.owner.isMe ? "you" : "them"}.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="grid gap-1">
          <span className="t-micro text-fg-3">Engineer</span>
          <select
            value={engineer}
            onChange={(e) => {
              setEngineer(e.target.value);
              setPreview(null);
            }}
            className="h-10 rounded-sm bg-surface-2 px-3 t-small text-fg-1 shadow-ring outline-none focus-visible:shadow-[0_0_0_2px_var(--focus)]"
          >
            {options.engineers.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.changes} this week
              </option>
            ))}
            {options.engineers.length > 1 && <option value="all">Everyone</option>}
          </select>
        </label>
        <label className="mt-5 inline-flex cursor-pointer items-center gap-2 t-small text-fg-1">
          <input
            type="checkbox"
            checked={sample}
            onChange={(e) => {
              setSample(e.target.checked);
              setPreview(null);
            }}
            className="size-4 accent-(--btn-primary-bg)"
          />
          Sample week for demos
        </label>
        <div className="mt-5 flex gap-2">
          <Button onClick={() => run(false)} loading={busy === "preview"} disabled={!sample && chosen?.changes === 0 && engineer !== "all"}>
            Preview
          </Button>
          <Button variant="primary" onClick={() => run(true)} loading={busy === "send"} disabled={!sample && chosen?.changes === 0 && engineer !== "all"}>
            Send to {options.owner.isMe ? "me" : options.owner.name.split(" ")[0]}
          </Button>
        </div>
      </div>
      {!sample && chosen?.changes === 0 && engineer !== "all" && (
        <p className="mt-3 t-small text-fg-3">{chosen.name.split(" ")[0]} has no changes in the last 7 days. Turn on the sample week to see a full report.</p>
      )}
      {preview && (
        <div className="mt-6 overflow-hidden rounded-md shadow-ring">
          <p className="border-b border-(--ring) bg-surface-2 px-4 py-2 t-small text-fg-2">
            <span className="text-fg-3">Subject:</span> <span className="font-medium text-fg-1">{preview.subject}</span>
          </p>
          <iframe
            ref={frame}
            title="Weekly report preview"
            srcDoc={preview.html}
            sandbox="allow-same-origin allow-popups"
            onLoad={() => setHeight(Math.min(6000, (frame.current?.contentDocument?.documentElement.scrollHeight ?? 600) + 16))}
            style={{ height }}
            className="block w-full bg-white"
          />
        </div>
      )}
    </section>
  );
}
