"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Member } from "@/lib/types";
import { Button } from "./button";
import { inputClass } from "./form";

const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null);

/** Your consent record, product emails, and a copy of your data. */
export function YourData() {
  const { user, updateProfile } = useSession();
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Flips at once; goes back if saving fails.
  const [marketing, setMarketingState] = useState(Boolean(user?.marketingOptIn));
  useEffect(() => setMarketingState(Boolean(user?.marketingOptIn)), [user?.marketingOptIn]);
  if (!user) return null;

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await api.exportMyData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rosetta-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("The download didn't work. Try again in a minute.");
    } finally {
      setDownloading(false);
    }
  };

  const setMarketing = async (on: boolean) => {
    setMarketingState(on);
    setSaving(true);
    try {
      await updateProfile({ marketingOptIn: on });
      toast(on ? "You'll get product update emails." : "No more product update emails.");
    } catch {
      setMarketingState(!on);
      toast("That didn't save. Try again in a minute.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="data-heading" className="mt-6 grid max-w-[40rem] gap-5 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
      <h2 id="data-heading" className="t-heading text-fg-1">
        Your data
      </h2>
      <p className="t-small text-fg-2">
        {user.termsAcceptedAt
          ? `You accepted the Terms and Privacy Policy (version ${user.termsVersion}) on ${date(user.termsAcceptedAt)}.`
          : "This is a sample account, so no terms were accepted."}{" "}
        <Link href="/privacy" className="font-medium text-fg-1 underline underline-offset-4">
          Privacy Policy
        </Link>{" "}
        ·{" "}
        <Link href="/data" className="font-medium text-fg-1 underline underline-offset-4">
          What we collect
        </Link>
      </p>
      <label className="flex cursor-pointer items-start gap-3 t-small text-fg-1">
        <input
          type="checkbox"
          checked={marketing}
          aria-busy={saving || undefined}
          onChange={(e) => setMarketing(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-(--btn-primary-bg)"
        />
        <span>
          Email me product updates
          <span className="block t-micro text-fg-3">Emails about your work (invites, questions, the weekly report) don&rsquo;t depend on this.</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={download} loading={downloading}>
          Download my data
        </Button>
        <span className="t-micro text-fg-3">Your profile, comments, questions, replies and notifications, as a JSON file.</span>
      </div>
    </section>
  );
}

/**
 * Delete my account. People who own the workspace first hand it over, or
 * delete the whole workspace. Exactly what happens is in the Privacy Policy.
 */
export function DeleteAccount() {
  const { user, org, logout } = useSession();
  const ids = { confirm: useId(), heir: useId(), whole: useId() };
  const [confirm, setConfirm] = useState("");
  const [whole, setWhole] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Member[]>([]);
  const [heir, setHeir] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!user || !org) return;
    const owner = org.ownerId === user.id;
    setIsOwner(owner);
    if (owner) {
      api
        .getTeam()
        .then((t) => {
          const options = t.members.filter((m) => (m.role === "cmo" || m.role === "manager") && m.status === "active");
          setLeads(options);
          setHeir(options[0]?.id ?? "");
        })
        .catch(() => {});
    }
  }, [user, org]);

  if (!user) return null;
  const typed = confirm.trim().toLowerCase() === user.email.toLowerCase();

  const handOver = async () => {
    if (!heir) return;
    setBusy(true);
    try {
      await api.transferOwnership(heir);
      setIsOwner(false);
      toast(`${leads.find((l) => l.id === heir)?.name ?? "They"} now own the workspace. You can delete your account.`);
    } catch (e) {
      toast(e instanceof api.ApiError && e.detail ? e.detail : "That didn't work. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: FormEvent) => {
    e.preventDefault();
    if (!typed) {
      setError(`Type your email, ${user.email}, to confirm.`);
      document.getElementById(ids.confirm)?.focus();
      return;
    }
    if (isOwner && !whole) {
      setError("You own this workspace. Hand it over above, or tick the box to delete the whole workspace.");
      document.getElementById(ids.whole)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(confirm.trim(), isOwner && whole);
      // A full navigation, so the signed-in shell doesn't bounce to the login page first.
      logout();
      window.location.assign("/?deleted=1");
    } catch (err) {
      setError(err instanceof api.ApiError && err.detail ? err.detail : "That didn't work. Try again in a minute.");
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="delete-heading" className="mt-6 grid max-w-[40rem] gap-5 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
      <h2 id="delete-heading" className="t-heading text-fg-1">
        Delete my account
      </h2>
      <ul className="grid list-disc gap-1 pl-5 t-small text-fg-2">
        <li>Your account, notifications and personal notes are deleted.</li>
        <li>Your comments and messages stay for your team, shown as &ldquo;Former member&rdquo;.</li>
        <li>People who report to you will report to your manager.</li>
      </ul>

      {isOwner && (
        <div className="grid gap-3 rounded-sm bg-surface-2 p-4">
          <p className="t-small font-medium text-fg-1">You own {org?.name ?? "this workspace"}.</p>
          {leads.length > 0 ? (
            <div className="grid gap-2">
              <label htmlFor={ids.heir} className="t-small text-fg-1">
                Hand it to
              </label>
              <div className="flex flex-wrap gap-2">
                <select id={ids.heir} value={heir} onChange={(e) => setHeir(e.target.value)} className={`${inputClass} max-w-64`}>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} · {l.role === "cmo" ? "CMO" : "Manager"}
                    </option>
                  ))}
                </select>
                <Button onClick={handOver} loading={busy && !confirm} className="h-11!">
                  Hand over the workspace
                </Button>
              </div>
            </div>
          ) : (
            <p className="t-small text-fg-2">There&rsquo;s no other CMO or manager who has joined, so it can&rsquo;t be handed over yet.</p>
          )}
          <label className="flex cursor-pointer items-start gap-3 t-small text-fg-1">
            <input
              id={ids.whole}
              type="checkbox"
              checked={whole}
              onChange={(e) => setWhole(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 cursor-pointer accent-(--risk-high)"
            />
            <span>Or delete the whole workspace: every member&rsquo;s account, every change, comment and question. This can&rsquo;t be undone.</span>
          </label>
        </div>
      )}

      <form onSubmit={remove} noValidate className="grid gap-3">
        <label htmlFor={ids.confirm} className="t-small font-medium text-fg-1">
          Type your email to confirm <span className="font-normal text-fg-3">(required)</span>
        </label>
        <input
          id={ids.confirm}
          type="email"
          autoComplete="off"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setError(null);
          }}
          placeholder={user.email}
          aria-invalid={error && !typed ? true : undefined}
          aria-describedby={error ? `${ids.confirm}-error` : undefined}
          className={inputClass}
        />
        {error && (
          <p id={`${ids.confirm}-error`} role="alert" className="t-small font-medium text-fg-1">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy && Boolean(confirm)} className="justify-self-start bg-(--risk-high)! text-canvas!">
          {isOwner && whole ? "Delete my account and the workspace" : "Delete my account"}
        </Button>
      </form>
    </section>
  );
}
