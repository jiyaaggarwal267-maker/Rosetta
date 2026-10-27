"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { isTechnical, roleLabel, ROLES } from "@/lib/roles";
import type { Member, Role, TeamView } from "@/lib/types";
import { firstName } from "@/lib/utils";
import { Button } from "./button";
import { Field, inputClass } from "./form";
import { CloseIcon } from "./icons";

type Props = {
  team: TeamView;
  member: Member | null;
  onClose: () => void;
  onChanged: () => void;
};

/** Everyone below `id`, so nobody can report to their own report. */
function below(id: string, members: Member[]) {
  const out = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const m of members) {
      if (m.managerId === cur && !out.has(m.id)) {
        out.add(m.id);
        queue.push(m.id);
      }
    }
  }
  return out;
}

/** The workspace owner edits someone's role and reporting line, or removes them. */
export function ManageMember({ team, member, onClose, onChanged }: Props) {
  const [role, setRole] = useState<Role>("engineer");
  const [managerId, setManagerId] = useState("");
  const [title, setTitle] = useState("");
  const [github, setGithub] = useState("");
  const [teamName, setTeamName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!member) return;
    setRole(member.role);
    setManagerId(member.managerId ?? team.me.id);
    setTitle(member.title ?? "");
    setGithub(member.githubLogin ?? "");
    setTeamName(member.role === "manager" ? (member.team?.name ?? "") : "");
    setConfirming(false);
    setError(null);
  }, [member, team.me.id]);

  const roles = ROLES.filter((r) => team.canAdd.includes(r.key) || r.key === member?.role);
  const reports = member ? team.members.filter((m) => m.managerId === member.id) : [];
  const heir = member ? (team.members.find((m) => m.id === member.managerId)?.name ?? "you") : "you";

  // Who they can report to: you (the owner) or any manager outside their own team.
  const leads = useMemo(() => {
    if (!member) return [];
    const blocked = below(member.id, team.members);
    return [
      { id: team.me.id, label: `You (${roleLabel(team.me.role)})` },
      ...team.members
        .filter((m) => m.role === "manager" && m.id !== member.id && !blocked.has(m.id))
        .map((m) => ({ id: m.id, label: `${m.name}${m.team ? ` · ${m.team.name}` : ""}` })),
    ];
  }, [member, team]);

  if (!member) return null;
  const stepsDown = member.role === "manager" && role !== "manager" && reports.length > 0;

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateMember(member.id, {
        title: title.trim(),
        githubLogin: isTechnical(role) || role === "manager" ? github.trim() : "",
        ...(role === "manager" ? { teamName: teamName.trim() } : {}),
        ...(role !== member.role ? { role } : {}),
        ...(managerId !== (member.managerId ?? team.me.id) ? { managerId } : {}),
      });
      toast(`${firstName(member.name)} updated.`);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof api.ApiError && err.detail ? err.detail.replace(/^✖ /gm, "") : "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async () => {
    setRemoving(true);
    try {
      await api.removeMember(member.id);
      toast(`${member.name} was removed from the workspace.`);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof api.ApiError && err.detail ? err.detail : "Couldn't remove them. Try again.");
      setRemoving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 z-50 bg-abyss/50" />
        <Dialog.Popup className="dialog-popup fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[min(34rem,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-surface-1 p-6 shadow-elev-3 outline-none sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="t-heading text-fg-1">Manage {member.name}</Dialog.Title>
              <Dialog.Description className="mt-1 t-small text-fg-2">
                {member.email ?? ""}
                {member.status === "invited" && " · invite not accepted yet"}
              </Dialog.Description>
            </div>
            <Dialog.Close className="press -mt-1 -mr-2 grid size-10 place-items-center rounded-sm text-fg-2 hover:bg-surface-2" aria-label="Close">
              <CloseIcon />
            </Dialog.Close>
          </div>

          <form onSubmit={onSave} className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="t-small font-medium text-fg-1">Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
              <span className="t-small text-fg-3">
                Their role is also how Rosetta explains things to them: {ROLES.find((r) => r.key === role)?.description.toLowerCase()}
              </span>
            </label>

            {stepsDown && (
              <p className="rounded-sm bg-[color-mix(in_srgb,var(--risk-medium)_8%,transparent)] tone-pill px-3 py-2 t-small text-fg-1">
                {firstName(member.name)} leads {reports.length} {reports.length === 1 ? "person" : "people"}. They&rsquo;ll report to{" "}
                {heir} instead.
              </p>
            )}

            <label className="grid gap-2">
              <span className="t-small font-medium text-fg-1">Reports to</span>
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className={inputClass}>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>

            <Field label="Job title" name="manage-title" optional value={title} onChange={(e) => setTitle(e.target.value)} />
            {(isTechnical(role) || role === "manager") && (
              <Field
                label="GitHub username"
                name="manage-github"
                optional
                value={github}
                onChange={(e) => setGithub(e.target.value)}
                readOnly={member.githubVerified}
                hint={member.githubVerified ? "Verified on GitHub by them, so only they can change it." : undefined}
                autoCapitalize="off"
                spellCheck={false}
              />
            )}
            {role === "manager" && (
              <Field label="Team name" name="manage-team" optional placeholder="Payments" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            )}

            {error && (
              <p role="alert" className="t-small font-medium whitespace-pre-line text-danger">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Dialog.Close className="press inline-flex h-10 items-center rounded-sm px-4 t-small font-medium text-(--ghost-fg) hover:bg-surface-2">
                Cancel
              </Dialog.Close>
              <Button type="submit" variant="primary" loading={saving}>
                Save changes
              </Button>
            </div>
          </form>

          {/* Removing is separate and needs a second, explicit step. */}
          <div className="mt-8 rounded-sm p-4 shadow-[0_0_0_1px_color-mix(in_srgb,var(--risk-high)_40%,transparent)]">
            <h3 className="t-small font-semibold text-fg-1">Remove from workspace</h3>
            <p className="mt-1 t-small text-fg-2">
              They lose access straight away.
              {reports.length > 0 && ` Their ${reports.length} ${reports.length === 1 ? "report moves" : "reports move"} to ${heir}.`} Their
              explained changes stay with the team.
            </p>
            {confirming ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="t-small font-medium text-fg-1">Remove {firstName(member.name)}?</span>
                <Button
                  onClick={onRemove}
                  loading={removing}
                  className="bg-(--risk-high)! text-(--bg)! enabled:hover:opacity-90"
                >
                  Yes, remove
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
              </div>
            ) : (
              <Button className="mt-3" onClick={() => setConfirming(true)}>
                Remove {firstName(member.name)}
              </Button>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
