"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { roleLabel } from "@/lib/roles";
import { useSession } from "@/lib/session";
import type { CommentView, Feed, Member, Person, TicketSummary, User } from "@/lib/types";
import { cn, firstName, timeAgo } from "@/lib/utils";
import { Page } from "./app-shell";
import { Button, buttonStyles } from "./button";
import { ComposeQuestion } from "./compose-question";
import { ExplainBox } from "./explain-box";
import { FeedList, FeedTools, FilterChips, LoadMore, NO_TOOLS, personChip, StatTile, type ToolsValue } from "./feed";
import { Avatar, PersonLine } from "./person";

/** Each role lands somewhere different. */
export function RoleHome() {
  const { user } = useSession();
  if (!user) return null;
  if (user.role === "cmo") return <LeadHome user={user} />;
  if (user.role === "manager") return <LeadHome user={user} />;
  if (user.role === "client") return <ClientHome user={user} />;
  return <EngineerHome user={user} />;
}

function useData(filters: { author?: string | null; team?: string | null; status?: string | null } & Partial<ToolsValue>) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const key = JSON.stringify(filters);
  const params = useCallback(() => {
    const f = JSON.parse(key) as Record<string, string | null | undefined>;
    return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || undefined])) as api.FeedFilters;
  }, [key]);
  const load = useCallback(() => {
    let current = true;
    api
      .getFeed(params())
      .then((data) => {
        if (!current) return;
        setFeed(data);
        setError(false);
      })
      .catch(() => current && setError(true));
    return () => {
      current = false;
    };
  }, [params]);
  useEffect(load, [load]);
  const loadMore = useCallback(async () => {
    if (!feed?.page.more) return;
    setLoadingMore(true);
    try {
      const next = await api.getFeed({ ...params(), offset: String(feed.items.length) });
      setFeed((f) => (f ? { ...next, items: [...f.items, ...next.items.filter((i) => !f.items.some((x) => x.id === i.id))] } : next));
    } catch {
      toast("Couldn't load more. Try again in a minute.");
    } finally {
      setLoadingMore(false);
    }
  }, [feed, params]);
  return { feed, error, reload: load, loadMore, loadingMore };
}

/** Search box state with a short pause, so typing doesn't fire a request per key. */
function useTools() {
  const [tools, setTools] = useState<ToolsValue>(NO_TOOLS);
  const [query, setQuery] = useState(NO_TOOLS);
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(tools), tools.q === query.q ? 0 : 300);
    return () => window.clearTimeout(t);
  }, [tools, query.q]);
  return { tools, setTools, query };
}

function useMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    api.getTeam().then((t) => setMembers(t.members)).catch(() => {});
  }, []);
  return members;
}

function Loading() {
  return (
    <p className="t-body text-fg-3" role="status">
      Loading…
    </p>
  );
}

function Unavailable() {
  return (
    <div className="rounded-md p-8 shadow-ring">
      <p className="t-body font-medium text-fg-1">Rosetta can&rsquo;t reach its server right now.</p>
      <p className="mt-1 t-small text-fg-2">Check that the backend is running, then reload the page.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Engineer, senior dev, intern: my work                               */
/* ------------------------------------------------------------------ */

function EngineerHome({ user }: { user: User }) {
  const [status, setStatus] = useState<string | null>(null);
  const { tools, setTools, query } = useTools();
  const { feed, error, reload, loadMore, loadingMore } = useData({ status, ...query });
  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);

  useEffect(() => {
    api.getTickets().then((t) => setTickets(t.received.filter((x) => x.status !== "closed"))).catch(() => setTickets([]));
  }, []);

  const waiting = tickets?.filter((t) => t.status === "open") ?? [];

  return (
    <Page
      title={`Hi ${firstName(user.name)}`}
      lead="Your changes, explained. Check each one so your manager reads it right, and answer the questions that come back."
    >
      {error ? (
        <Unavailable />
      ) : !feed ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 items-start gap-8 card:grid-cols-12">
          <div className="grid min-w-0 grid-cols-1 gap-6 card:col-span-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile label="Your changes" value={feed.stats.total} />
              <StatTile label="Waiting for your review" value={feed.stats.notReviewed} tone="attention" />
              <StatTile label="Questions for you" value={waiting.length} tone="attention" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="t-heading text-fg-1">Your changes</h2>
              <FilterChips
                label="Show"
                options={[
                  { id: "draft", label: "Not reviewed" },
                  { id: "approved", label: "Reviewed" },
                ]}
                value={status}
                onChange={setStatus}
                render={(o) => o.label}
              />
            </div>
            <FeedTools value={tools} onChange={setTools} repos={feed.repos} />
            <FeedList
              items={feed.items}
              showAuthor={false}
              filtered={tools !== NO_TOOLS}
              onDeleted={() => reload()}
              empty={
                <>
                  <p className="t-body font-medium text-fg-1">No changes yet.</p>
                  <p className="mt-1 t-small text-fg-2">
                    {feed.sync.repos
                      ? "Commits you push to your team's repositories show up here automatically."
                      : "Paste a commit link on the right, or ask your manager to connect your repositories."}
                  </p>
                </>
              }
            />
            <LoadMore page={feed.page} shown={feed.items.length} loading={loadingMore} onMore={loadMore} />
          </div>

          <aside className="grid min-w-0 grid-cols-1 gap-6 card:col-span-4">
            <section className="rounded-md bg-surface-1 p-6 shadow-elev-1">
              <h2 className="t-heading text-fg-1">Questions for you</h2>
              {!tickets ? (
                <p className="mt-3 t-small text-fg-3">Loading…</p>
              ) : tickets.length === 0 ? (
                <p className="mt-3 t-small text-fg-2">Nothing waiting. Questions from your manager land here.</p>
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-2">
                  {tickets.slice(0, 5).map((t) => (
                    <TicketRow key={t.id} ticket={t} />
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-md bg-surface-1 p-6 shadow-elev-1">
              <h2 className="t-heading text-fg-1">Explain a commit</h2>
              <p className="mt-1 mb-4 t-small text-fg-2">Paste a public commit or pull request you have permission to share.</p>
              <ExplainBox samples />
            </section>
          </aside>
        </div>
      )}
    </Page>
  );
}

function TicketRow({ ticket }: { ticket: TicketSummary }) {
  return (
    <li>
      <Link href={`/app/questions/${ticket.id}`} className="press -mx-2 flex gap-3 rounded-sm p-2 hover:bg-surface-2">
        <Avatar name={ticket.other?.name ?? "?"} size={28} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 t-small font-semibold text-fg-1">
            <span className="truncate">{ticket.subject}</span>
            {ticket.unread && <span className="size-2 shrink-0 rounded-full bg-steel" aria-label="Unread" />}
          </span>
          <span className="block truncate t-small text-fg-2">{ticket.preview}</span>
        </span>
      </Link>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Manager and CMO: the team, or the whole organisation                */
/* ------------------------------------------------------------------ */

function LeadHome({ user }: { user: User }) {
  const cmo = user.role === "cmo";
  const [author, setAuthor] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const { tools, setTools, query } = useTools();
  const { feed, error, reload, loadMore, loadingMore } = useData({ author, team, ...query });
  const members = useMembers();
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [asking, setAsking] = useState<{ open: boolean; toId?: string }>({ open: false });
  const [seeding, setSeeding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.getComments({ team: team ?? undefined, author: author ?? undefined }).then((c) => setComments(c.items.slice(0, 4))).catch(() => setComments([]));
  }, [team, author]);

  const messageable = useMemo(() => members.filter((m) => m.canMessage && m.status === "active"), [members]);
  const people = useMemo(
    () => (feed?.people ?? []).filter((p) => !team || p.team?.id === team || p.id === team),
    [feed, team],
  );

  // Per-team numbers for the CMO overview, from the unfiltered feed.
  const [allItems, setAllItems] = useState<Feed["items"]>([]);
  useEffect(() => {
    if (cmo && !author && !team && feed) setAllItems(feed.items);
  }, [cmo, author, team, feed]);

  const seed = async () => {
    setSeeding(true);
    try {
      const result = await api.seedDemo();
      toast(`Sample team added. They log in with the password "${result.password}".`, {
        description: result.logins.map((l) => `${l.name}: ${l.email}`).join("\n"),
        duration: 12_000,
      });
      window.location.reload();
    } catch (e) {
      toast(e instanceof api.ApiError && e.detail ? e.detail : "Couldn't add the sample team.");
      setSeeding(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.syncNow();
      toast(r.commits || r.comments ? `Found ${r.commits} new changes and ${r.comments} comments.` : "Everything is up to date.");
      reload();
    } catch (e) {
      toast(e instanceof api.ApiError && e.detail ? e.detail : "Sync didn't work. Check the repositories on the team page.");
    } finally {
      setSyncing(false);
    }
  };

  const teamName = feed?.myTeam?.name;
  const empty = feed && feed.stats.total === 0 && !author && !team;

  return (
    <Page
      title={cmo ? "Overview" : (teamName ?? "Your team")}
      lead={
        cmo
          ? "What every team shipped, explained for a CMO: customers, campaigns and risk."
          : "Everything your engineers shipped, explained for a manager. No code, no chasing."
      }
      actions={
        <>
          {feed?.sync.repos ? (
            <Button onClick={sync} loading={syncing}>
              Check GitHub now
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => setAsking({ open: true })} disabled={!messageable.length}>
            {cmo ? "Ask a question" : "Ask your team"}
          </Button>
        </>
      }
    >
      {error ? (
        <Unavailable />
      ) : !feed ? (
        <Loading />
      ) : empty ? (
        <div className="grid gap-4 rounded-md bg-surface-1 p-8 shadow-elev-1">
          <h2 className="t-heading text-fg-1">{members.length ? "No changes yet" : "Add your team"}</h2>
          <p className="max-w-[40rem] t-body text-fg-2">
            {members.length
              ? "Connect your GitHub repositories on the team page. Every commit your engineers push will be explained here automatically."
              : `Invite your ${cmo ? "managers and engineers" : "engineers and interns"}, then connect your GitHub repositories. Or look around with a sample team first.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/app/team" className={buttonStyles({ variant: "primary" })}>
              {members.length ? "Connect repositories" : "Add people"}
            </Link>
            <Button onClick={seed} loading={seeding}>
              Add a sample team
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Changes this week" value={feed.stats.thisWeek} />
            <StatTile label="Not reviewed by the engineer" value={feed.stats.notReviewed} tone="attention" />
            <StatTile label="Need a closer look" value={feed.stats.highRisk} hint="Medium or high risk" tone="attention" />
            <StatTile label="Open questions" value={feed.stats.openQuestions} />
          </div>

          {cmo && feed.teams.length > 0 && (
            <section aria-label="Teams">
              <h2 className="t-heading text-fg-1">Teams</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {feed.teams.map((t) => {
                  const items = allItems.filter((i) => i.author?.team?.id === t.id);
                  const active = team === t.id;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setTeam(active ? null : t.id);
                          setAuthor(null);
                        }}
                        className={cn(
                          "press w-full rounded-md bg-surface-1 p-5 text-left shadow-elev-1",
                          active && "shadow-[0_0_0_2px_var(--color-steel)]",
                        )}
                      >
                        <span className="block t-body font-semibold text-fg-1">{t.name}</span>
                        <span className="block t-small text-fg-3">Led by {t.lead}</span>
                        <span className="mt-3 block t-small text-fg-2">
                          {items.length} {items.length === 1 ? "change" : "changes"} ·{" "}
                          {items.filter((i) => i.status === "draft").length} not reviewed
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-1 items-start gap-8 card:grid-cols-12">
            <section className="grid min-w-0 grid-cols-1 gap-4 card:col-span-8" aria-label="Changes">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="t-heading text-fg-1">{author ? `Changes by ${people.find((p) => p.id === author)?.name ?? ""}` : "Latest changes"}</h2>
              </div>
              <FilterChips label={cmo ? "Person" : "Engineer"} options={people} value={author} onChange={setAuthor} render={personChip} />
              <FeedTools value={tools} onChange={setTools} repos={feed.repos} />
              <FeedList items={feed.items} filtered={tools !== NO_TOOLS} empty={<p className="t-body text-fg-2">Nothing here yet.</p>} />
              <LoadMore page={feed.page} shown={feed.items.length} loading={loadingMore} onMore={loadMore} />
            </section>

            <aside className="grid min-w-0 grid-cols-1 gap-6 card:col-span-4">
              <section className="rounded-md bg-surface-1 p-6 shadow-elev-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="t-heading text-fg-1">From your engineers</h2>
                  <Link href="/app/updates" className="t-small font-medium text-fg-2 underline underline-offset-4 hover:text-fg-1">
                    All updates
                  </Link>
                </div>
                {!comments ? (
                  <p className="mt-3 t-small text-fg-3">Loading…</p>
                ) : comments.length === 0 ? (
                  <p className="mt-3 t-small text-fg-2">No comments yet. Engineers&rsquo; notes on their changes appear here.</p>
                ) : (
                  <ul className="mt-4 grid gap-4">
                    {comments.map((c) => (
                      <li key={c.id} className="grid gap-1">
                        <PersonLine person={c.author} className="t-small text-fg-3" />
                        <p className="t-small text-fg-1">{c.text}</p>
                        {c.card && (
                          <Link href={`/app/c/${c.card.id}`} className="t-micro text-fg-3 hover:text-fg-1">
                            On &ldquo;{c.card.title}&rdquo; · {timeAgo(c.createdAt)}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-md bg-surface-1 p-6 shadow-elev-1">
                <h2 className="t-heading text-fg-1">Check in with someone</h2>
                <p className="mt-1 t-small text-fg-2">Ask anyone on your team what they&rsquo;re working on, even if they haven&rsquo;t posted anything.</p>
                <ul className="mt-4 grid gap-1">
                  {messageable.slice(0, 6).map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setAsking({ open: true, toId: m.id })}
                        className="press -mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-sm p-2 text-left hover:bg-surface-2"
                      >
                        <Avatar name={m.name} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate t-small font-medium text-fg-1">{m.name}</span>
                          <span className="block truncate t-micro text-fg-3">{m.title || roleLabel(m.role)}</span>
                        </span>
                        <span className="t-micro text-fg-2">Ask</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>
        </div>
      )}

      <ComposeQuestion
        open={asking.open}
        onOpenChange={(open) => setAsking((a) => ({ ...a, open }))}
        people={messageable as Person[]}
        toId={asking.toId}
        subject={asking.toId ? "Quick check-in" : ""}
        text={asking.toId ? "Are you working on anything I should know about this week?" : ""}
      />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Client: reviewed work, in business terms                            */
/* ------------------------------------------------------------------ */

function ClientHome({ user }: { user: User }) {
  const { feed, error } = useData({});
  const members = useMembers();
  const [asking, setAsking] = useState(false);
  const messageable = members.filter((m) => m.canMessage && m.status === "active");
  return (
    <Page
      title={`Updates for ${firstName(user.name)}`}
      lead="Work your team has finished and reviewed, explained in business terms."
      actions={
        messageable.length ? (
          <Button variant="primary" onClick={() => setAsking(true)}>
            Ask a question
          </Button>
        ) : null
      }
    >
      {error ? (
        <Unavailable />
      ) : !feed ? (
        <Loading />
      ) : (
        <FeedList items={feed.items} empty={<p className="t-body text-fg-2">No reviewed updates yet.</p>} />
      )}
      <ComposeQuestion open={asking} onOpenChange={setAsking} people={messageable} />
    </Page>
  );
}
