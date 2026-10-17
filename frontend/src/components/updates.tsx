"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { langFor } from "@/lib/lang";
import { useSession } from "@/lib/session";
import type { CommentView, Feed, FeedItem } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { Page } from "./app-shell";
import { FeedCard, FilterChips, personChip } from "./feed";
import { GitHubIcon } from "./icons";
import { Avatar, PersonLine } from "./person";

type Entry = { kind: "change"; at: string; item: FeedItem } | { kind: "comment"; at: string; item: CommentView };

const SHOW = [
  { id: "changes", label: "Changes" },
  { id: "comments", label: "Comments" },
];

/**
 * Everything engineers do, for leads: the changes they push and what they
 * wrote about them (here and on GitHub), newest first, each rewritten for
 * the reader. Filter by engineer, by team (CMO), or by kind.
 */
export function Updates() {
  const { user } = useSession();
  const [author, setAuthor] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [show, setShow] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [filters, setFilters] = useState<Pick<Feed, "people" | "teams"> | null>(null);

  useEffect(() => {
    api.getFeed().then((f) => setFilters({ people: f.people, teams: f.teams })).catch(() => {});
  }, []);

  useEffect(() => {
    let current = true;
    setEntries(null);
    const who = { author: author ?? undefined, team: team ?? undefined };
    Promise.all([
      api.getFeed({ ...who, limit: "50" }).catch(() => null),
      api.getComments(who).catch(() => null),
    ]).then(([feed, comments]) => {
      if (!current) return;
      const all: Entry[] = [
        ...(feed?.items ?? []).map((item) => ({ kind: "change" as const, at: item.committedAt, item })),
        ...(comments?.items ?? []).map((item) => ({ kind: "comment" as const, at: item.createdAt, item })),
      ];
      setEntries(all.sort((a, b) => b.at.localeCompare(a.at)));
    });
    return () => {
      current = false;
    };
  }, [author, team]);

  const people = (filters?.people ?? []).filter((p) => !team || p.team?.id === team);
  const visible = (entries ?? []).filter((e) => !show || (show === "changes" ? e.kind === "change" : e.kind === "comment"));
  const reader = user?.role === "cmo" ? "a CMO" : "a manager";

  return (
    <Page title="Engineer updates" lead={`Every change your engineers push, and what they wrote about it here and on GitHub, explained for ${reader}.`}>
      <div className="grid gap-3">
        {user?.role === "cmo" && filters && (
          <FilterChips
            label="Team"
            options={filters.teams}
            value={team}
            onChange={(id) => {
              setTeam(id);
              setAuthor(null);
            }}
            render={(t) => t.name}
          />
        )}
        {filters && <FilterChips label="Engineer" options={people} value={author} onChange={setAuthor} render={personChip} />}
        <FilterChips label="Show" options={SHOW} value={show} onChange={setShow} render={(o) => o.label} />
      </div>

      <div className="mt-8">
        {!entries ? (
          <p className="t-body text-fg-3" role="status">
            Loading…
          </p>
        ) : visible.length === 0 ? (
          <div className="rounded-md p-8 shadow-ring">
            <p className="t-body font-medium text-fg-1">No updates here yet.</p>
            <p className="mt-1 t-small text-fg-2">
              {show === "comments"
                ? "Engineers' comments on their changes, and their GitHub comments in watched repositories, appear here."
                : "Changes your engineers push, and their comments on them, appear here as soon as they're explained."}
            </p>
          </div>
        ) : (
          <ul className="grid max-w-[52rem] grid-cols-1 gap-3">
            {visible.map((e) =>
              e.kind === "change" ? <FeedCard key={`c-${e.item.id}`} item={e.item} /> : <CommentEntry key={`m-${e.item.id}`} c={e.item} />,
            )}
          </ul>
        )}
      </div>
    </Page>
  );
}

function CommentEntry({ c }: { c: CommentView }) {
  const { user } = useSession();
  const [showOriginal, setShowOriginal] = useState(false);
  return (
    <li className="flex gap-4 rounded-md bg-surface-1 p-5 shadow-elev-1">
      <Avatar name={c.author?.name ?? "Former member"} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 t-small text-fg-3">
          <PersonLine person={c.author} className="text-fg-3" />
          <span aria-hidden>·</span>
          <span>commented {timeAgo(c.createdAt)}</span>
          {c.source === "github" && (
            <a href={c.githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg-1">
              <GitHubIcon size={12} /> on GitHub
            </a>
          )}
        </p>
        <p className="mt-2 t-body text-fg-1" lang={langFor(user?.language, c.translated && !showOriginal)}>
          {showOriginal ? c.original : c.text}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 t-micro text-fg-3">
          {c.card && (
            <Link href={`/app/c/${c.card.id}`} className="hover:text-fg-1">
              On &ldquo;{c.card.title}&rdquo;
            </Link>
          )}
          {c.translated && (
            <button type="button" onClick={() => setShowOriginal((v) => !v)} className="underline underline-offset-4 hover:text-fg-1">
              {showOriginal ? "Show it for me" : "Show what they wrote"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
