"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import * as api from "@/lib/api";
import { isTechnical, roleNoun } from "@/lib/roles";
import { useSession } from "@/lib/session";
import type { Role } from "@/lib/types";
import { Button } from "./button";
import { ConsentFields, focusFirstInvalid } from "./consent-fields";
import { Field } from "./form";

type Invite = Awaited<ReturnType<typeof api.getInvite>>;

/** Joining with the invite code a lead shared. */
export function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { join } = useSession();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [password, setPassword] = useState("");
  const [github, setGithub] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; terms?: string }>({});
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const lookup = async (value: string) => {
    if (value.trim().length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const found = await api.getInvite(value.trim());
      setInvite(found);
      setGithub(found.githubLogin ?? "");
    } catch {
      setInvite(null);
      setError("That invite code isn't valid. Ask your manager for a new one.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const initial = params.get("code");
    if (initial) void lookup(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!invite) return void lookup(code);
    const found: typeof fieldErrors = {};
    if (password.length < 8) found.password = "Use at least 8 characters for your password.";
    if (!terms) found.terms = "Tick the box to agree to the Terms and confirm you've read the Privacy Policy.";
    setFieldErrors(found);
    if (Object.keys(found).length) return focusFirstInvalid(formRef.current);
    setBusy(true);
    try {
      await join({ code: code.trim(), password, githubLogin: github.trim() || undefined, acceptTerms: terms, marketingOptIn: marketing });
      router.replace("/app");
    } catch (err) {
      setError(err instanceof api.ApiError && err.detail ? err.detail : "That didn't work. Try again.");
      setBusy(false);
    }
  };

  return (
    <main id="main" tabIndex={-1} className="mx-auto grid min-h-[calc(100svh-var(--nav-h))] max-w-(--w-app) place-items-center px-(--gutter) py-16">
      <div className="w-full max-w-[28rem]">
        <h1 className="t-title text-fg-1">Join your team</h1>
        <p className="mt-3 t-body text-fg-2">Enter the invite code your manager shared.</p>

        <form ref={formRef} noValidate onSubmit={onSubmit} className="mt-8 grid gap-5 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
          <Field
            label="Invite code"
            name="code"
            required
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setInvite(null);
            }}
            onBlur={() => !invite && lookup(code)}
            autoCapitalize="characters"
            spellCheck={false}
            className="[&_input]:font-mono [&_input]:tracking-[0.12em]"
          />

          {invite && (
            <>
              <div className="rounded-sm bg-surface-2 p-4">
                <p className="t-body font-semibold text-fg-1">{invite.name}</p>
                <p className="t-small text-fg-2">{invite.email}</p>
                <p className="mt-2 t-small text-fg-2">
                  Joining {invite.orgName} as {roleNoun(invite.role as Role)}
                  {invite.invitedBy && `, added by ${invite.invitedBy}`}.
                </p>
              </div>
              <Field
                label="Choose a password"
                name="password"
                required
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((f) => ({ ...f, password: undefined }));
                }}
                error={fieldErrors.password}
                hint="At least 8 characters."
              />
              {isTechnical(invite.role as Role) && (
                <Field
                  label="GitHub username"
                  name="github"
                  optional
                  autoComplete="username"
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  hint="So your commits reach your manager automatically."
                  autoCapitalize="off"
                  spellCheck={false}
                />
              )}
              <ConsentFields
                terms={terms}
                marketing={marketing}
                onTerms={(v) => {
                  setTerms(v);
                  setFieldErrors((f) => ({ ...f, terms: undefined }));
                }}
                onMarketing={setMarketing}
                error={fieldErrors.terms}
              />
            </>
          )}

          {error && (
            <p role="alert" className="t-small font-medium text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={busy} className="h-11 w-full">
            {invite ? "Join workspace" : "Check code"}
          </Button>
        </form>
      </div>
    </main>
  );
}
