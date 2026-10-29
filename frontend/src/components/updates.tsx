"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { langFor } from "@/lib/lang";
import { canOpen } from "@/lib/roles";
import { useSession } from "@/lib/session";
import type { CommentView, Feed, FeedItem } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { LoadError, NotForRole, Page } from "./app-shell";
import { FeedCard, FilterChips, LoadMore, personChip } from "./feed";
import { GitHubIcon } from "./icons";
import { Avatar, PersonLine } from "./person";

type Entry = { kind: "change"; at: string; item: FeedItem } | { kind: "comment"; at: string; item: CommentView };

const PAGE = 50;
const change = (item: FeedItem): Entry => ({ kind: "change", at: item.committedAt, item });
const comment = (item: CommentView): Entry => ({ kind: "comment", at: item.createdAt, item });
const sortEntries = (all: Entry[]) => all.sort((a, b) => b.at.localeCompare(a.at));

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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<Feed["page"] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped whenever the filters reload the list, so a "Show more" for the old filters is dropped.
  const generation = useRef(0);
  const allowed = user ? canOpen(user.role, "/app/updates") : false;
  const who = { author: author ?? undefined, team: team ?? undefined };

  useEffect(() => {
    if (!allowed) return;
    api.getFeed().then((f) => setFilters({ people: f.people, teams: f.teams })).catch(() => {});
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    generation.current++;
    setLoadingMore(false);
    setEntries(null);
    setFailed(false);
    const who = { author: author ?? undefined, team: team ?? undefined };
    Promise.all([api.getFeed({ ...who, limit: String(PAGE) }), api.getComments(who)])
      .then(([feed, comments]) => {
        if (!current) return;
        setPage(feed.page);
        setEntries(sortEntries([...feed.items.map(change), ...comments.items.map(comment)]));
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [author, team, allowed, attempt]);

  // Older changes, a page at a time. Comments already arrive in full (newest 100).
  const loadMore = async () => {
    if (!page?.more || !entries) return;
    const asked = generation.current;
    setLoadingMore(true);
    try {
      const shown = entries.filter((e) => e.kind === "change").length;
      const next = await api.getFeed({ ...who, limit: String(PAGE), offset: String(shown) });
      if (asked !== generation.current) return;
      setPage(next.page);
      setEntries((all) => {
        const have = new Set((all ?? []).filter((e) => e.kind === "change").map((e) => e.item.id));
        return sortEntries([...(all ?? []), ...next.items.filter((i) => !have.has(i.id)).map(change)]);
      });
    } catch {
      if (asked === generation.current) toast("Couldn't load more. Try again in a minute.");
    } finally {
      if (asked === generation.current) setLoadingMore(false);
    }
  };

  if (user && !allowed) return <NotForRole title="Engineer updates" />;

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
        {failed ? (
          <LoadError message="Updates can't load right now." onRetry={() => setAttempt((n) => n + 1)} />
        ) : !entries ? (
          <p className="t-body text-fg-3" role="status">
            Loading…
          </p>
        ) : visible.length === 0 && (show === "comments" || !page?.more) ? (
          <div className="rounded-md p-8 shadow-ring">
            <p className="t-body font-medium text-fg-1">No updates here yet.</p>
            <p className="mt-1 t-small text-fg-2">
              {show === "comments"
                ? "Engineers' comments on their changes, and their GitHub comments in watched repositories, appear here."
                : "Changes your engineers push, and their comments on them, appear here as soon as they're explained."}
            </p>
          </div>
        ) : (
          <div className="grid max-w-[52rem] gap-4">
            <ul className="grid grid-cols-1 gap-3">
              {visible.map((e) =>
                e.kind === "change" ? <FeedCard key={`c-${e.item.id}`} item={e.item} /> : <CommentEntry key={`m-${e.item.id}`} c={e.item} />,
              )}
            </ul>
            {page && show !== "comments" && (
              <LoadMore page={page} shown={entries.filter((e) => e.kind === "change").length} loading={loadingMore} onMore={loadMore} />
            )}
          </div>
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
