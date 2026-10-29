"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import * as api from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button } from "./button";
import { Field } from "./form";

function Shell({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto grid min-h-[calc(100svh-var(--nav-h))] max-w-(--w-app) place-items-center px-(--gutter) py-16">
      <div className="w-full max-w-[26rem]">
        <h1 className="t-title text-fg-1">{title}</h1>
        <p className="mt-3 t-body text-fg-2">{lead}</p>
        <div className="mt-8">{children}</div>
        <p className="mt-6 t-small text-fg-2">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-fg-1 underline underline-offset-4">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

/** /forgot: ask for a reset link. */
export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter the email you log in with.");
    setState("sending");
    setError(null);
    try {
      await api.forgotPassword(email.trim());
      setState("sent");
    } catch (err) {
      setError(err instanceof api.ApiError && err.detail ? err.detail : "That didn't work. Try again in a minute.");
      setState("idle");
    }
  };

  return (
    <Shell title="Forgot your password?" lead="We'll email you a link to choose a new one.">
      {state === "sent" ? (
        <div role="status" className="rounded-md bg-surface-1 p-6 shadow-elev-1">
          <p className="t-body font-medium text-fg-1">Check your inbox.</p>
          <p className="mt-1 t-small text-fg-2">
            If {email.trim()} has a Rosetta account, a reset link is on its way. It works for one hour. Check spam if it
            doesn&rsquo;t arrive in a minute.
          </p>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="grid gap-5 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
          <Field label="Email" name="email" required type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && (
            <p role="alert" className="t-small font-medium text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={state === "sending"} className="h-11 w-full">
            Email me a reset link
          </Button>
        </form>
      )}
    </Shell>
  );
}

/** /reset?token=…: choose the new password; logs straight in. */
export function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const { resetPassword } = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      router.replace("/app");
    } catch (err) {
      setError(err instanceof api.ApiError && err.detail ? err.detail.replace(/^✖ /gm, "") : "That didn't work. Ask for a new link.");
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <Shell title="This link is incomplete" lead="Open the link from your email again, or ask for a new one.">
        <Link href="/forgot" className="t-body font-medium text-fg-1 underline underline-offset-4">
          Get a new reset link
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password" lead="You'll be logged in straight after.">
      <form noValidate onSubmit={onSubmit} className="grid gap-5 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
        <Field label="New password" name="password" required type="password" autoComplete="new-password" hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label="Type it again" name="confirm" required type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && (
          <p role="alert" className="t-small font-medium whitespace-pre-line text-danger">
            {error}{" "}
            {/expired|valid/i.test(error) && (
              <Link href="/forgot" className="underline underline-offset-4">
                Get a new link
              </Link>
            )}
          </p>
        )}
        <Button type="submit" variant="primary" loading={busy} className="h-11 w-full">
          Save new password
        </Button>
      </form>
    </Shell>
  );
}
