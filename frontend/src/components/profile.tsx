"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, changePassword } from "@/lib/api";
import { FOCUS_OPTIONS, isTechnical, roleNoun } from "@/lib/roles";
import { useSession } from "@/lib/session";
import type { Focus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Page } from "./app-shell";
import { Button } from "./button";
import { Field } from "./form";
import { DeleteAccount, YourData } from "./privacy-settings";

/** Your name and preferences. Your role is set by whoever added you. */
export function Profile() {
  const { user, org, updateProfile } = useSession();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [github, setGithub] = useState("");
  const [teamName, setTeamName] = useState("");
  const [focus, setFocus] = useState<Focus[]>([]);
  const [language, setLanguage] = useState<"en" | "hinglish">("en");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setTitle(user.title ?? "");
    setGithub(user.githubLogin ?? "");
    setTeamName(user.teamName ?? "");
    setFocus(user.focus);
    setLanguage(user.language);
  }, [user]);

  if (!user) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        name: name.trim(),
        title: title.trim(),
        githubLogin: github.trim(),
        ...(user.role === "manager" ? { teamName: teamName.trim() } : {}),
        focus,
        language,
      });
      toast("Profile saved.");
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? err.detail.replace(/^✖ /gm, "") : "That didn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Profile and preferences" lead={`You read Rosetta as ${roleNoun(user.role)}${org ? ` at ${org.name}` : ""}. Your role is set by whoever added you.`}>
      <form onSubmit={onSubmit} className="grid max-w-[40rem] gap-6 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
        <Field label="Name" name="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Email" name="email" type="email" autoComplete="email" value={user.email} readOnly hint="Your email is your login." />
        <Field label="Job title" name="title" optional autoComplete="organization-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        {user.role === "manager" && <Field label="Team name" name="teamName" optional value={teamName} onChange={(e) => setTeamName(e.target.value)} />}
        {(isTechnical(user.role) || user.role === "manager") && (
          <Field
            label="GitHub username"
            name="githubLogin"
            optional
            value={github}
            onChange={(e) => setGithub(e.target.value)}
            hint="Your commits and comments are matched to you by this."
            autoCapitalize="off"
            spellCheck={false}
          />
        )}
        <fieldset>
          <legend className="t-small font-medium text-fg-1">What do you care about most?</legend>
          <p className="mt-1 t-small text-fg-3">Shapes the &ldquo;For you&rdquo; note on every change.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {FOCUS_OPTIONS.map((o) => (
              <label
                key={o.key}
                className="press inline-flex h-10 cursor-pointer items-center rounded-full bg-surface-2 px-4 t-small font-medium text-fg-2 shadow-ring has-[:checked]:bg-(--btn-primary-bg) has-[:checked]:text-(--btn-primary-fg) has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={focus.includes(o.key)}
                  onChange={() => setFocus((f) => (f.includes(o.key) ? f.filter((x) => x !== o.key) : [...f, o.key]))}
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="t-small font-medium text-fg-1">Language for your notes and messages</legend>
          <div className="mt-3 inline-grid grid-cols-2 rounded-sm bg-surface-2 p-1 shadow-ring">
            {(["en", "hinglish"] as const).map((l) => (
              <label
                key={l}
                className={cn(
                  "press grid h-9 cursor-pointer place-items-center rounded-full px-5 t-small font-medium text-fg-2",
                  "has-[:checked]:bg-surface-1 has-[:checked]:text-fg-1 has-[:checked]:shadow-elev-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                )}
              >
                <input type="radio" name="language" className="sr-only" checked={language === l} onChange={() => setLanguage(l)} />
                {l === "en" ? "English" : "Hinglish"}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="t-small font-medium whitespace-pre-line text-fg-1">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={saving} className="justify-self-start">
          Save profile
        </Button>
      </form>
      <ChangePassword />
      <YourData />
      <DeleteAccount />
    </Page>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError("Use at least 8 characters.");
    setSaving(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      toast("Password changed.");
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? err.detail.replace(/^✖ /gm, "") : "That didn't save. Try again in a minute.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 grid max-w-[40rem] gap-6 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8" aria-labelledby="password-heading">
      <h2 id="password-heading" className="t-heading text-fg-1">
        Password
      </h2>
      <Field label="Current password" name="current-password" required type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <Field label="New password" name="new-password" required type="password" autoComplete="new-password" hint="At least 8 characters." value={next} onChange={(e) => setNext(e.target.value)} />
      {error && (
        <p role="alert" className="t-small font-medium text-fg-1">
          {error}
        </p>
      )}
      <Button type="submit" loading={saving} disabled={!current || !next} className="justify-self-start">
        Change password
      </Button>
    </form>
  );
}
