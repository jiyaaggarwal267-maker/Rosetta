"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { errorText } from "@/lib/errors";
import { goTo, parseBranches } from "@/lib/github-app";
import { roleLabel } from "@/lib/roles";
import type { GithubRepos, GithubStatus, TeamView, Unassigned, UnassignedGroup } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { Button, buttonStyles } from "./button";
import { inputClass } from "./form";

const MAX_BRANCHES = 10;
const POLL_MS = 30_000;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/** A small tick: this person proved their GitHub account by logging in to GitHub. */
export function VerifiedMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center text-(--risk-low)", className)} title="Verified on GitHub">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.5 2.5 2.5 4.5-5" />
      </svg>
      <span className="sr-only">Verified on GitHub</span>
    </span>
  );
}

/**
 * GitHub's connection and queue, for leads. Polls every 30 s while the tab
 * is visible (poll: true), and again whenever the tab comes back.
 */
export function useGithubStatus(enabled: boolean, poll = false) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(() => {
    api
      .getGithubStatus()
      .then((s) => {
        setStatus(s);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    if (!enabled) return;
    reload();
    if (!poll) return;
    const visible = () => document.visibilityState === "visible";
    const timer = window.setInterval(() => visible() && reload(), POLL_MS);
    const onVisible = () => visible() && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, poll, reload]);
  return { status, failed, reload };
}

/* ------------------------------------------------------------------ */
/* Connect                                                             */
/* ------------------------------------------------------------------ */

/** The owner sends the browser to GitHub to install Rosetta's app. */
export function ConnectGithubButton({ label = "Connect GitHub", className }: { label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      goTo((await api.githubInstallUrl()).url);
    } catch (e) {
      setBusy(false);
      if (e instanceof api.ApiError && e.code === "forbidden") setError("Only the workspace owner can connect GitHub.");
      else if (e instanceof api.ApiError && e.code === "unavailable")
        setError(e.detail ?? "Connecting GitHub isn't set up for Rosetta yet. Ask whoever runs Rosetta for your company.");
      else setError(errorText(e, "Couldn't reach GitHub right now. Try again in a minute."));
    }
  };
  return (
    <div className={cn("grid justify-items-start gap-2", className)}>
      <Button variant="primary" loading={busy} onClick={start} aria-describedby={error ? errorId : undefined}>
        {label}
      </Button>
      {error && (
        <p id={errorId} role="alert" className="t-small font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Not connected yet: the owner connects; everyone else is told who can. */
export function ConnectGithub({ isOwner }: { isOwner: boolean }) {
  return (
    <section aria-labelledby="github-heading" className="rounded-md bg-surface-1 p-6 shadow-elev-1">
      <h2 id="github-heading" className="t-heading text-fg-1">
        GitHub
      </h2>
      <p className="mt-1 t-small text-fg-2">
        Connect your company&rsquo;s GitHub once. After that, every push to the repositories you choose, private ones included, is explained
        and sent to the right manager automatically. Nobody has to paste a link.
      </p>
      {isOwner ? (
        <ConnectGithubButton className="mt-4" />
      ) : (
        <p className="mt-4 t-small text-fg-3">Your workspace owner connects GitHub. Ask them to do it from this page.</p>
      )}
    </section>
  );
}

/** Disconnecting only stops Rosetta listening; the app stays installed on GitHub. */
function DisconnectGithub({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const disconnect = async () => {
    setBusy(true);
    try {
      await api.disconnectGithub();
      setOpen(false);
      toast("GitHub disconnected.");
      onDone();
    } catch (e) {
      toast(errorText(e, "That didn't disconnect. Try again in a minute."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={buttonStyles({ variant: "ghost" })}>Disconnect</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 z-50 bg-abyss/50" />
        <Dialog.Popup className="dialog-popup fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface-1 p-6 shadow-elev-3 outline-none sm:p-8">
          <Dialog.Title className="t-heading text-fg-1">Disconnect GitHub?</Dialog.Title>
          <Dialog.Description className="mt-2 t-small text-fg-2">
            New pushes stop reaching Rosetta, and it can no longer read your private repositories. Changes already explained stay. This only
            disconnects it in Rosetta: the app stays installed on GitHub until you remove it there.
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="press h-10 rounded-sm px-4 t-small font-medium text-fg-2 hover:bg-surface-2 hover:text-fg-1">Cancel</Dialog.Close>
            <Button variant="primary" loading={busy} onClick={disconnect} className="bg-(--risk-high)! text-canvas!">
              Disconnect GitHub
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Connected: which repositories, which branches                       */
/* ------------------------------------------------------------------ */

export function GithubConnected({
  team,
  status,
  onChanged,
}: {
  team: TeamView;
  status: GithubStatus;
  /** Reload the team and the status. */
  onChanged: () => void;
}) {
  const owner = team.isOwner;
  const account = status.account ?? team.org.github.account;
  const [syncing, setSyncing] = useState(false);
  const [reposKey, setReposKey] = useState(0);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.syncNow();
      toast(
        r.commits || r.comments
          ? `Queued ${r.commits} new ${r.commits === 1 ? "change" : "changes"}${r.comments ? ` and found ${r.comments} ${r.comments === 1 ? "comment" : "comments"}` : ""}.`
          : "Everything is up to date.",
      );
      onChanged();
    } catch (e) {
      toast(errorText(e, "Couldn't check GitHub right now. Try again in a minute."));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section aria-labelledby="github-heading" className="rounded-md bg-surface-1 p-6 shadow-elev-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="github-heading" className="t-heading text-fg-1">
          GitHub
        </h2>
        <span className="inline-flex h-6 items-center rounded-xs bg-[color-mix(in_srgb,var(--risk-low)_10%,transparent)] tone-pill px-2 t-micro font-medium text-(--risk-low)">
          Connected
        </span>
      </div>
      <p className="mt-1 t-small text-fg-2">
        {account ? (
          <>
            Connected to <span className="font-medium text-fg-1">{account}</span>
          </>
        ) : (
          "Connected"
        )}
        {status.connectedAt && ` since ${day(status.connectedAt)}`}. Every push to a watched repository is explained and sent to the right
        manager.
      </p>
      {owner && (
        <div className="mt-4 flex flex-wrap gap-2">
          {status.manageUrl && (
            <a href={status.manageUrl} target="_blank" rel="noreferrer" className={buttonStyles()}>
              Manage on GitHub
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <DisconnectGithub onDone={onChanged} />
        </div>
      )}

      <RepoPicker
        key={reposKey}
        owner={owner}
        watchedBefore={team.org.repos}
        onSaved={onChanged}
        onRefresh={() => setReposKey((k) => k + 1)}
      />

      {team.org.repos.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={sync} loading={syncing}>
            Check GitHub now
          </Button>
          <span className="t-small text-fg-3">{team.org.lastSyncAt ? `Last checked ${timeAgo(team.org.lastSyncAt)}` : "Not checked yet"}</span>
        </div>
      )}
    </section>
  );
}

function RepoPicker({
  owner,
  watchedBefore,
  onSaved,
  onRefresh,
}: {
  owner: boolean;
  watchedBefore: string[];
  onSaved: () => void;
  onRefresh: () => void;
}) {
  const [data, setData] = useState<GithubRepos | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [branches, setBranches] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { filter: useId(), error: useId() };

  const load = useCallback(() => {
    setLoadError(null);
    api
      .getGithubRepos()
      .then((d) => {
        setData(d);
        setPicked(Object.fromEntries(d.repos.map((r) => [r.fullName, r.watched])));
        setBranches(Object.fromEntries(d.repos.map((r) => [r.fullName, r.branches.join(", ")])));
      })
      .catch((e) => setLoadError(errorText(e, "Couldn't get your repositories from GitHub. Try again in a minute.")));
  }, []);
  useEffect(load, [load]);

  const repos = useMemo(() => data?.repos ?? [], [data]);
  // Watched before through the older setup, but the GitHub app can't see them.
  const missing = useMemo(() => {
    const seen = new Set(repos.map((r) => r.fullName.toLowerCase()));
    return watchedBefore.filter((r) => !seen.has(r.toLowerCase()));
  }, [repos, watchedBefore]);
  const tooMany = repos.filter((r) => picked[r.fullName] && parseBranches(branches[r.fullName] ?? "").length > MAX_BRANCHES).map((r) => r.fullName);
  // Repositories the app can't see are dropped on save, so that alone is a change.
  const dirty =
    missing.length > 0 ||
    repos.some(
          (r) =>
            Boolean(picked[r.fullName]) !== r.watched ||
        (picked[r.fullName] && parseBranches(branches[r.fullName] ?? "").join(",") !== r.branches.join(",")),
    );

  if (loadError)
    return (
      <div className="mt-5 grid justify-items-start gap-3">
        <p role="alert" className="t-small font-medium text-danger">
          {loadError}
        </p>
        <Button onClick={load}>Try again</Button>
      </div>
    );
  if (!data)
    return (
      <p className="mt-5 t-small text-fg-3" role="status">
        Loading repositories…
      </p>
    );

  if (!owner) {
    const watched = repos.filter((r) => r.watched);
    return (
      <div className="mt-5">
        <h3 className="t-small font-medium text-fg-1">Watched repositories</h3>
        {watched.length === 0 ? (
          <p className="mt-2 t-small text-fg-3">None yet. The workspace owner chooses which repositories to watch.</p>
        ) : (
          <ul className="mt-2 grid gap-1">
            {watched.map((r) => (
              <li key={r.fullName} className="grid gap-0.5 rounded-sm bg-surface-2 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono t-small text-fg-1">{r.fullName}</span>
                  {r.private && <PrivateTag />}
                </span>
                <span className="t-micro text-fg-3">{branchLine(r.defaultBranch, r.branches)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const shown = filter ? repos.filter((r) => r.fullName.includes(filter.trim().toLowerCase())) : repos;

  const save = async () => {
    if (tooMany.length) {
      setError(`Use ${MAX_BRANCHES} branches or fewer for ${tooMany.join(", ")}.`);
      return;
    }
    const chosen = repos.filter((r) => picked[r.fullName]).map((r) => r.fullName);
    setSaving(true);
    setError(null);
    try {
      await api.updateOrg({
        repos: chosen,
        branches: Object.fromEntries(chosen.map((r) => [r, parseBranches(branches[r] ?? "")])),
      });
      toast(chosen.length ? `Saved. Rosetta watches ${chosen.length} ${chosen.length === 1 ? "repository" : "repositories"}.` : "Saved. No repositories are watched.");
      onSaved();
      load();
    } catch (e) {
      setError(errorText(e, "That didn't save. Try again in a minute."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="t-small font-medium text-fg-1">Repositories to watch</h3>
        <button type="button" onClick={onRefresh} className="t-small text-fg-3 underline underline-offset-4 hover:text-fg-1">
          Refresh list
        </button>
      </div>
      {repos.length === 0 ? (
        <p className="t-small text-fg-2">
          Rosetta can&rsquo;t see any repositories yet. Use Manage on GitHub to give it access to the ones you want, then refresh this list.
        </p>
      ) : (
        <>
          <p className="t-small text-fg-3">
            Pushes to the main branch are explained. Add other branches if you want those too. Don&rsquo;t see a repository? Add it with
            Manage on GitHub, then refresh this list.
          </p>
          {repos.length > 8 && (
            <div className="grid gap-1">
              <label htmlFor={ids.filter} className="t-micro text-fg-3">
                Find a repository
              </label>
              <input
                id={ids.filter}
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className={cn(inputClass, "h-9 font-mono t-small")}
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
          )}
          <ul className="grid gap-1">
            {shown.map((r) => (
              <RepoRow
                key={r.fullName}
                repo={r}
                checked={Boolean(picked[r.fullName])}
                onCheck={(on) => setPicked((p) => ({ ...p, [r.fullName]: on }))}
                branches={branches[r.fullName] ?? ""}
                onBranches={(v) => setBranches((b) => ({ ...b, [r.fullName]: v }))}
                invalid={tooMany.includes(r.fullName)}
              />
            ))}
            {shown.length === 0 && <li className="t-small text-fg-3">No repository matches &ldquo;{filter}&rdquo;.</li>}
          </ul>
        </>
      )}
      {missing.length > 0 && (
        <p className="rounded-sm border border-(--risk-medium) px-3 py-2 t-small text-fg-1">
          Rosetta&rsquo;s GitHub app can&rsquo;t see{" "}
          <span className="font-mono">{missing.join(", ")}</span>, which {missing.length === 1 ? "was" : "were"} watched before. Saving stops
          watching {missing.length === 1 ? "it" : "them"}. To keep {missing.length === 1 ? "it" : "them"}, add {missing.length === 1 ? "it" : "them"}{" "}
          with Manage on GitHub first.
        </p>
      )}
      {error && (
        <p id={ids.error} role="alert" className="t-small font-medium whitespace-pre-line text-danger">
          {error}
        </p>
      )}
      {(repos.length > 0 || missing.length > 0) && (
        <Button variant="primary" loading={saving} disabled={!dirty} onClick={save} className="justify-self-start" aria-describedby={error ? ids.error : undefined}>
          Save repositories
        </Button>
      )}
    </div>
  );
}

const branchLine = (main: string, extra: string[]) => (extra.length ? `${main} and ${extra.join(", ")}` : `${main} only`);

function PrivateTag() {
  return <span className="inline-flex h-5 shrink-0 items-center rounded-xs bg-surface-1 px-1.5 t-micro font-medium text-fg-2 shadow-ring">Private</span>;
}

function RepoRow({
  repo,
  checked,
  onCheck,
  branches,
  onBranches,
  invalid,
}: {
  repo: GithubRepos["repos"][number];
  checked: boolean;
  onCheck: (on: boolean) => void;
  branches: string;
  onBranches: (value: string) => void;
  invalid: boolean;
}) {
  const ids = { check: useId(), branches: useId(), hint: useId() };
  return (
    <li className="grid gap-2 rounded-sm bg-surface-2 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <input
          id={ids.check}
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          className="size-5 shrink-0 cursor-pointer accent-(--btn-primary-bg)"
        />
        <label htmlFor={ids.check} className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate font-mono t-small text-fg-1">{repo.fullName}</span>
          {repo.private && <PrivateTag />}
          <span className="t-micro text-fg-3">Main branch: {repo.defaultBranch}</span>
        </label>
      </div>
      {checked && (
        <div className="grid gap-1 pl-8">
          <label htmlFor={ids.branches} className="t-micro text-fg-2">
            Other branches <span className="text-fg-3">(optional, separated by commas)</span>
          </label>
          <input
            id={ids.branches}
            value={branches}
            onChange={(e) => onBranches(e.target.value)}
            placeholder="staging, release"
            aria-invalid={invalid || undefined}
            aria-describedby={ids.hint}
            className={cn(inputClass, "h-9 font-mono t-small")}
            autoCapitalize="off"
            spellCheck={false}
          />
          <span id={ids.hint} className={cn("t-micro", invalid ? "font-medium text-danger" : "text-fg-3")}>
            {invalid ? `Use ${MAX_BRANCHES} branches or fewer.` : `Leave empty to explain ${repo.defaultBranch} only.`}
          </span>
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Status: is GitHub talking to us, and how is the queue doing         */
/* ------------------------------------------------------------------ */

export function GithubStatusPanel({ status }: { status: GithubStatus }) {
  const q = status.queue;
  const tiles = [
    { label: "Waiting", value: q.queued },
    { label: "Explaining now", value: q.running },
    { label: "Didn't work", value: q.failed, attention: true },
    { label: "Not matched to anyone", value: q.unassigned, attention: true },
  ];
  return (
    <section aria-labelledby="github-status-heading" className="rounded-md bg-surface-1 p-6 shadow-elev-1">
      <h2 id="github-status-heading" className="t-heading text-fg-1">
        Pushes from GitHub
      </h2>
      <dl className="mt-3 grid gap-1 t-small">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-fg-2">Last heard from GitHub</dt>
          <dd className="text-fg-1">{status.lastWebhookAt ? <time dateTime={status.lastWebhookAt}>{timeAgo(status.lastWebhookAt)}</time> : "Nothing yet"}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-fg-2">Last checked</dt>
          <dd className="text-fg-1">{status.lastSyncAt ? <time dateTime={status.lastSyncAt}>{timeAgo(status.lastSyncAt)}</time> : "Not yet"}</dd>
        </div>
      </dl>
      <ul className="mt-4 grid grid-cols-2 gap-2" aria-label="Changes being explained">
        {tiles.map((t) => (
          <li key={t.label} className="rounded-sm bg-surface-2 px-3 py-2">
            <span className="block t-micro text-fg-2">{t.label}</span>
            <span className={cn("block font-display text-xl font-semibold tabular-nums", t.attention && t.value > 0 ? "text-(--risk-medium)" : "text-fg-1")}>
              {t.value}
            </span>
          </li>
        ))}
      </ul>
      {status.failures.length > 0 && (
        <div className="mt-5">
          <h3 className="t-small font-medium text-fg-1">Recent problems</h3>
          <ul className="mt-2 grid gap-2">
            {status.failures.map((f) => (
              <li key={f.id} className="grid gap-0.5 rounded-sm bg-surface-2 px-3 py-2">
                <span className="truncate t-small font-medium text-fg-1">{f.subject || "Untitled change"}</span>
                <span className="truncate font-mono t-micro text-fg-3">
                  {f.repo} · {f.sha}
                </span>
                {f.error && <span className="t-small text-danger">{f.error}</span>}
                <span className="t-micro text-fg-3">
                  Tried {f.tries} {f.tries === 1 ? "time" : "times"} · {timeAgo(f.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Unmatched pushes: say who wrote them                                */
/* ------------------------------------------------------------------ */

export function UnassignedPanel({ onAssigned }: { onAssigned?: () => void }) {
  const [data, setData] = useState<Unassigned | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    api
      .getUnassigned()
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  return (
    <section aria-labelledby="unassigned-heading" className="rounded-md bg-surface-1 p-6 shadow-elev-1">
      <h2 id="unassigned-heading" className="t-heading text-fg-1">
        Pushes nobody is matched to
      </h2>
      <p className="mt-1 t-small text-fg-2">Say who wrote them. Rosetta explains them and remembers for next time.</p>
      {failed && !data ? (
        <div className="mt-4 grid justify-items-start gap-3">
          <p role="alert" className="t-small font-medium text-danger">
            These can&rsquo;t load right now.
          </p>
          <Button onClick={load}>Try again</Button>
        </div>
      ) : !data ? (
        <p className="mt-4 t-small text-fg-3" role="status">
          Loading…
        </p>
      ) : data.groups.length === 0 ? (
        <p className="mt-4 t-small text-fg-3">Every push is matched to someone on your team.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {data.groups.map((g) => (
            <UnassignedRow
              key={g.key}
              group={g}
              people={data.people}
              onDone={() => {
                load();
                onAssigned?.();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function UnassignedRow({ group, people, onDone }: { group: UnassignedGroup; people: Unassigned["people"]; onDone: () => void }) {
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { select: useId(), error: useId() };
  const who = group.login ? `@${group.login}` : (group.email ?? group.names[0] ?? "Someone");

  const assign = async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.assignUnassigned(group.login ? { login: group.login, userId } : { email: group.email ?? "", userId });
      const name = people.find((p) => p.id === userId)?.name ?? "them";
      toast(
        r.requeued
          ? `Matched to ${name}. ${r.requeued} ${r.requeued === 1 ? "change is" : "changes are"} being explained now.`
          : `Matched to ${name}. Their next pushes will be explained.`,
      );
      onDone();
    } catch (e) {
      const code = e instanceof api.ApiError ? e.code : null;
      if (code === "forbidden") setError("You can't match pushes to that person. Choose someone on your team.");
      else if (code === "conflict") setError(errorText(e, "That GitHub username already belongs to someone else on your team."));
      else if (code === "bad_request") setError(errorText(e, "Choose who wrote these first."));
      else setError(errorText(e, "That didn't save. Try again in a minute."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="grid gap-2 rounded-sm bg-surface-2 p-3">
      <div className="min-w-0">
        <p className="truncate t-small font-semibold text-fg-1">
          <span className={group.login ? "font-mono" : undefined}>{who}</span>
        </p>
        {group.names.length > 0 && <p className="truncate t-micro text-fg-3">Signed as {group.names.join(", ")}</p>}
        <p className="t-micro text-fg-2">
          {group.commits} {group.commits === 1 ? "push" : "pushes"} in <span className="font-mono">{group.repos.join(", ")}</span> · latest{" "}
          {timeAgo(group.latestAt)}
        </p>
      </div>
      {group.recent.length > 0 && (
        <ul className="grid gap-0.5">
          {group.recent.map((c) => (
            <li key={`${c.repo}@${c.sha}`} className="flex min-w-0 gap-2 t-micro">
              <span className="shrink-0 font-mono text-fg-3">{c.sha}</span>
              <span className="truncate text-fg-1">{c.subject || "Untitled change"}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 basis-40 gap-1">
          <label htmlFor={ids.select} className="t-micro text-fg-2">
            This is…
          </label>
          <select
            id={ids.select}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className={cn(inputClass, "h-9 t-small")}
            aria-describedby={error ? ids.error : undefined}
          >
            <option value="">Choose a person</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {roleLabel(p.role)}
                {p.githubLogin ? ` · @${p.githubLogin}` : ""}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={assign} loading={busy} disabled={!userId} className="h-9!">
          Match
        </Button>
      </div>
      {error && (
        <p id={ids.error} role="alert" className="t-small font-medium text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
