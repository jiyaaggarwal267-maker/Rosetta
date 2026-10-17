"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { isLead, roleLabel, ROLES } from "@/lib/roles";
import { useSession } from "@/lib/session";
import type { AiUsage, Member, Role, TeamView } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { Page } from "./app-shell";
import { Button } from "./button";
import { ComposeQuestion } from "./compose-question";
import { ManageMember } from "./manage-member";
import { Field, inputClass } from "./form";
import { Avatar, SampleTag } from "./person";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000").replace(/\/$/, "");

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied.`);
  } catch {
    toast(text);
  }
};

/** Leads manage their people and the repositories Rosetta watches. */
export function Team() {
  const { user } = useSession();
  const [team, setTeam] = useState<TeamView | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [managing, setManaging] = useState<Member | null>(null);
  const load = () => api.getTeam().then(setTeam).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  if (!user || !team) return <Page title="Team">{<p className="t-body text-fg-3">Loading…</p>}</Page>;
  const cmo = user.role === "cmo";
  const lead = isLead(user.role);

  // Group people under the manager they report to.
  const managers = [team.me, ...team.members.filter((m) => m.role === "manager")];
  const groups = managers
    .map((m) => ({ lead: m, people: team.members.filter((x) => x.managerId === m.id && x.role !== "manager") }))
    .filter((g) => g.people.length || g.lead.id !== team.me.id || !cmo);

  return (
    <Page
      title={cmo ? "Organisation" : "My team"}
      lead={cmo ? "Add managers, see every team, and connect the repositories Rosetta watches." : "Add your engineers, interns and clients. Their pushes reach you automatically."}
    >
      <div className="grid grid-cols-1 items-start gap-8 card:grid-cols-12">
        <div className="grid min-w-0 grid-cols-1 gap-6 card:col-span-7">
          {groups.map((g) => (
            <section key={g.lead.id} className="rounded-md bg-surface-1 p-6 shadow-elev-1">
              <div className="flex items-center gap-3">
                <Avatar name={g.lead.name} lead />
                <div>
                  <h2 className="t-heading text-fg-1">{g.lead.team?.name ?? (g.lead.id === team.me.id ? "Reporting to you" : `${g.lead.name}'s team`)}</h2>
                  <p className="t-small text-fg-3">
                    {g.lead.id === team.me.id ? "You" : g.lead.name} · {roleLabel(g.lead.role)}
                  </p>
                </div>
                {team.isOwner && g.lead.id !== team.me.id && (
                  <Button variant="ghost" className="ml-auto h-8!" onClick={() => setManaging(g.lead as Member)}>
                    Manage
                  </Button>
                )}
              </div>
              {g.people.length === 0 ? (
                <p className="mt-4 t-small text-fg-2">Nobody here yet.</p>
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-1">
                  {g.people.map((m) => (
                    <MemberRow key={m.id} member={m} onAsk={() => setAsking(m.id)} onManage={team.isOwner ? () => setManaging(m) : undefined} />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <aside className="grid min-w-0 grid-cols-1 gap-6 card:col-span-5">
          {team.isOwner && <WorkspaceName />}
          {team.canAdd.length > 0 && <AddMember team={team} onAdded={load} />}
          {lead && <Repositories team={team} onSaved={load} />}
          {lead && <AiQuota />}
        </aside>
      </div>

      <ManageMember team={team} member={managing} onClose={() => setManaging(null)} onChanged={load} />

      <ComposeQuestion
        open={asking !== null}
        onOpenChange={(open) => !open && setAsking(null)}
        people={team.members.filter((m) => m.canMessage && m.status === "active")}
        toId={asking ?? undefined}
        subject="Quick check-in"
        text="Are you working on anything I should know about this week?"
      />
    </Page>
  );
}

function MemberRow({ member, onAsk, onManage }: { member: Member; onAsk: () => void; onManage?: () => void }) {
  const joinLink = typeof window !== "undefined" && member.inviteCode ? `${window.location.origin}/join?code=${member.inviteCode}` : "";
  return (
    <li className="-mx-2 flex min-w-0 flex-wrap items-center gap-3 rounded-sm p-2">
      <Avatar name={member.name} size={32} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 t-small font-semibold text-fg-1">
          <span className="truncate">{member.name}</span>
          {member.sample && <SampleTag />}
        </p>
        <p className="truncate t-micro text-fg-3">
          <span className="font-medium text-fg-2">{roleLabel(member.role)}</span>
          {member.title && member.title !== roleLabel(member.role) && ` · ${member.title}`}
          {member.githubLogin && <span className="font-mono"> · @{member.githubLogin}</span>}
          {member.email && ` · ${member.email}`}
        </p>
      </div>
      {member.status === "invited" ? (
        <div className="flex items-center gap-2">
          <span className="font-mono t-micro text-fg-2">{member.inviteCode}</span>
          {joinLink && (
            <Button className="h-8!" onClick={() => copy(joinLink, "Invite link")}>
              Copy invite
            </Button>
          )}
        </div>
      ) : (
        member.canMessage && (
          <Button variant="ghost" className="h-8!" onClick={onAsk}>
            Ask
          </Button>
        )
      )}
      {onManage && (
        <Button className="h-8!" onClick={onManage}>
          Manage
        </Button>
      )}
    </li>
  );
}

function AddMember({ team, onAdded }: { team: TeamView; onAdded: () => void }) {
  const roles = ROLES.filter((r) => team.canAdd.includes(r.key));
  const [role, setRole] = useState<Role>(roles.find((r) => r.key === "engineer")?.key ?? roles[0].key);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [github, setGithub] = useState("");
  const [teamName, setTeamName] = useState("");
  const managers = team.members.filter((m) => m.role === "manager" && m.manages);
  const [managerId, setManagerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ name: string; code: string; email: string; emailed: boolean } | null>(null);
  const technical = role === "engineer" || role === "senior" || role === "intern";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.addMember({
        name: name.trim(),
        email: email.trim(),
        role,
        title: title.trim() || undefined,
        githubLogin: technical ? github.trim() || undefined : undefined,
        teamName: role === "manager" ? teamName.trim() || undefined : undefined,
        managerId: role !== "manager" && managerId ? managerId : undefined,
      });
      setInvite({ name: r.member.name, code: r.inviteCode, email: email.trim(), emailed: r.emailed });
      setName("");
      setEmail("");
      setTitle("");
      setGithub("");
      setTeamName("");
      onAdded();
    } catch (err) {
      setError(err instanceof api.ApiError && err.detail ? err.detail.replace(/^✖ /gm, "") : "Couldn't add them. Check the details.");
    } finally {
      setBusy(false);
    }
  };

  const link = invite && typeof window !== "undefined" ? `${window.location.origin}/join?code=${invite.code}` : "";

  return (
    <section className="rounded-md bg-surface-1 p-6 shadow-elev-1">
      <h2 className="t-heading text-fg-1">Add someone</h2>
      <p className="mt-1 t-small text-fg-2">They get an invite code, set a password, and land in their own view.</p>

      {invite && (
        <div className="mt-4 rounded-sm bg-surface-2 p-4">
          <p className="t-small text-fg-1">
            Invite for {invite.name}: <span className="font-mono font-semibold">{invite.code}</span>
          </p>
          <p className="mt-1 t-small text-fg-2">
            {invite.emailed ? `We emailed the join link to ${invite.email}.` : "Share this link with them to join."}
          </p>
          <Button className="mt-3 h-8!" onClick={() => copy(link, "Invite link")}>
            Copy invite link
          </Button>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-5 grid gap-4">
        <label className="grid gap-2">
          <span className="t-small font-medium text-fg-1">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <span className="t-small text-fg-3">{ROLES.find((r) => r.key === role)?.description}</span>
        </label>
        <Field label="Name" name="member-name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} required />
        <Field label="Work email" name="member-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label="Job title" name="member-title" optional value={title} onChange={(e) => setTitle(e.target.value)} />
        {technical && (
          <Field
            label="GitHub username"
            name="member-github"
            optional
            value={github}
            onChange={(e) => setGithub(e.target.value)}
            hint="Their commits and comments are matched by this."
            autoCapitalize="off"
            spellCheck={false}
          />
        )}
        {role === "manager" && <Field label="Team name" name="member-team" optional placeholder="Payments" value={teamName} onChange={(e) => setTeamName(e.target.value)} />}
        {role !== "manager" && managers.length > 0 && (
          <label className="grid gap-2">
            <span className="t-small font-medium text-fg-1">Reports to</span>
            <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className={inputClass}>
              <option value="">You</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.team ? ` · ${m.team.name}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="t-small font-medium whitespace-pre-line text-fg-1">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={busy} className="justify-self-start">
          Add and create invite
        </Button>
      </form>
    </section>
  );
}

function Repositories({ team, onSaved }: { team: TeamView; onSaved: () => void }) {
  const [repo, setRepo] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const repos = team.org.repos;

  const save = async (next: string[]) => {
    setBusy(true);
    try {
      await api.updateOrg({ repos: next });
      setRepo("");
      onSaved();
    } catch (e) {
      toast(e instanceof api.ApiError && e.detail ? e.detail.replace(/^✖ /gm, "") : "Couldn't save that repository.");
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.syncNow();
      toast(r.commits || r.comments ? `Found ${r.commits} new changes and ${r.comments} comments.` : "Everything is up to date.");
      onSaved();
    } catch (e) {
      toast(e instanceof api.ApiError && e.detail ? e.detail : "Sync didn't work. Is GITHUB_TOKEN set on the server?");
    } finally {
      setSyncing(false);
    }
  };

  const webhook = team.org.webhookPath ? `${API_BASE}${team.org.webhookPath}` : "";

  return (
    <section className="rounded-md bg-surface-1 p-6 shadow-elev-1">
      <h2 className="t-heading text-fg-1">Repositories</h2>
      <p className="mt-1 t-small text-fg-2">
        Rosetta watches these. Every commit by someone on your team is explained and sent to their manager, with no links to paste.
      </p>

      <ul className="mt-4 grid grid-cols-1 gap-1">
        {repos.map((r) => (
          <li key={r} className="flex items-center justify-between gap-2 rounded-sm bg-surface-2 px-3 py-2">
            <span className="truncate font-mono t-small text-fg-1">{r}</span>
            <Button variant="ghost" className="h-8!" onClick={() => save(repos.filter((x) => x !== r))} disabled={busy}>
              Remove
            </Button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (repo.trim()) void save([...repos, repo.trim()]);
        }}
        className="mt-3 flex gap-2"
      >
        <label htmlFor="repo" className="sr-only">
          Repository
        </label>
        <input
          id="repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="owner/repo"
          className={cn(inputClass, "font-mono")}
          autoCapitalize="off"
          spellCheck={false}
        />
        <Button type="submit" loading={busy} className="h-11!">
          Watch
        </Button>
      </form>

      {repos.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={sync} loading={syncing}>
            Check GitHub now
          </Button>
          <span className="t-small text-fg-3">{team.org.lastSyncAt ? `Last checked ${timeAgo(team.org.lastSyncAt)}` : "Not checked yet"}</span>
        </div>
      )}

      {webhook && (
        <details className="mt-6 rounded-sm bg-surface-2 p-4">
          <summary className="cursor-pointer t-small font-medium text-fg-1">Get changes instantly with a GitHub webhook</summary>
          <ol className="mt-3 grid list-decimal gap-2 pl-5 t-small text-fg-2">
            <li>In the repository on GitHub, open Settings, then Webhooks, then Add webhook.</li>
            <li>
              Payload URL:{" "}
              <button type="button" className="font-mono break-all text-fg-1 underline underline-offset-4" onClick={() => copy(webhook, "Webhook URL")}>
                {webhook}
              </button>
            </li>
            <li>Content type: application/json.</li>
            <li>
              Secret:{" "}
              <button type="button" className="font-mono text-fg-1 underline underline-offset-4" onClick={() => copy(team.org.webhookSecret!, "Secret")}>
                copy secret
              </button>
            </li>
            <li>Events: pushes, commit comments, issue comments.</li>
          </ol>
          {/localhost|127\.0\.0\.1/.test(webhook) ? (
            <p className="mt-3 rounded-sm border border-(--risk-medium) px-3 py-2 t-small text-fg-1">
              This address is on your own computer, so GitHub can't reach it. Use the deployed server's address, or a tunnel such as
              ngrok, as the payload URL. Until then, use Check GitHub now.
            </p>
          ) : (
            <p className="mt-3 t-micro text-fg-3">The server must be reachable from GitHub (deployed, or through a tunnel).</p>
          )}
        </details>
      )}
    </section>
  );
}

const TASK_LABEL: Record<string, string> = {
  explain: "Explaining changes",
  judge: "Checking explanations",
  ask: "Answering Ask why",
  translate: "Rewriting messages",
  note: "Personal notes",
};

/** The owner names the workspace; everyone sees it next to the logo. */
function WorkspaceName() {
  const { org, renameWorkspace } = useSession();
  const [name, setName] = useState(org?.name ?? "");
  const [saving, setSaving] = useState(false);
  const changed = name.trim() && name.trim() !== org?.name;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!changed) return;
    setSaving(true);
    try {
      await renameWorkspace(name.trim());
      toast("Workspace renamed.");
    } catch (err) {
      toast(err instanceof api.ApiError && err.detail ? err.detail : "That didn't save. Try again in a minute.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-md bg-surface-1 p-6 shadow-elev-1">
      <h2 className="t-heading text-fg-1">Workspace</h2>
      <div className="flex gap-2">
        <label htmlFor="workspace-name" className="sr-only">
          Workspace name
        </label>
        <input id="workspace-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputClass} />
        <Button type="submit" loading={saving} disabled={!changed} className="h-11!">
          Rename
        </Button>
      </div>
    </form>
  );
}

/** Today's AI calls against the free daily limits, so leads aren't surprised. */
function AiQuota() {
  const [usage, setUsage] = useState<AiUsage | null>(null);
  useEffect(() => {
    api.getUsage().then(setUsage).catch(() => {});
  }, []);
  if (!usage) return null;
  const rows = [
    { name: "Explanations (Gemini)", u: usage.gemini },
    { name: "Everything else (Groq)", u: usage.fallback },
  ].filter((r) => r.u.configured);
  if (!rows.length) return null;
  const tasks = Object.entries(usage.tasks).sort((a, b) => b[1] - a[1]);

  return (
    <section className="rounded-md bg-surface-1 p-6 shadow-elev-1">
      <h2 className="t-heading text-fg-1">AI use today</h2>
      <p className="mt-1 t-small text-fg-2">Free daily limits. They reset at midnight, India time.</p>
      <ul className="mt-4 grid gap-4">
        {rows.map(({ name, u }) => {
          const pct = Math.min(100, Math.round((u.used / Math.max(1, u.limit)) * 100));
          const low = u.exhausted || u.left <= Math.ceil(u.limit * 0.15);
          return (
            <li key={name}>
              <div className="flex items-baseline justify-between gap-2 t-small">
                <span className="text-fg-1">{name}</span>
                <span className={cn("font-mono", low ? "text-(--risk-high)" : "text-fg-2")}>
                  {u.exhausted ? "Used up" : `${u.left} of ${u.limit} left`}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuenow={u.used} aria-valuemax={u.limit} aria-label={name}>
                <div className={cn("h-full rounded-full", low ? "bg-(--risk-high)" : "bg-fg-1")} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {tasks.length > 0 && (
        <p className="mt-4 t-micro text-fg-3">
          {tasks.map(([t, n]) => `${TASK_LABEL[t] ?? t}: ${n}`).join(" · ")}
        </p>
      )}
    </section>
  );
}
