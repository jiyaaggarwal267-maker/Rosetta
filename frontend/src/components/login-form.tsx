"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { ERROR_COPY } from "@/lib/errors";
import { safeNext, useSession } from "@/lib/session";
import { Button } from "./button";
import { Field } from "./form";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { user, status, login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "signed-in" && user) router.replace(next);
  }, [status, user, router, next]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace(next);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "unavailable";
      setError(
        code === "network" || code === "unavailable"
          ? "Rosetta can't be reached right now. Try again in a minute."
          : code !== "invalid_credentials" && err instanceof ApiError && err.detail
            ? err.detail
            : ERROR_COPY[code].message,
      );
      setBusy(false);
      emailRef.current?.focus();
    }
  };

  return (
    <main id="main" tabIndex={-1} className="mx-auto grid min-h-[calc(100svh-var(--nav-h))] max-w-(--w-app) place-items-center px-(--gutter) py-16">
      <div className="w-full max-w-[26rem]">
        <h1 className="t-title text-fg-1">Log in</h1>
        <p className="mt-3 t-body text-fg-2">You&rsquo;ll land in your own view: your work, your team, or your whole organisation.</p>

        <form noValidate onSubmit={onSubmit} className="mt-8 grid gap-5 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
          <Field
            ref={emailRef}
            label="Email"
            required
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Password"
            required
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p role="alert" className="t-small font-medium text-danger">
              {error}
            </p>
          )}
          <Link href="/forgot" className="-mt-2 justify-self-end t-small font-medium text-fg-2 underline underline-offset-4 hover:text-fg-1">
            Forgot password?
          </Link>
          <Button type="submit" variant="primary" loading={busy} className="h-11 w-full">
            Log in
          </Button>
        </form>

        <p className="mt-6 t-small text-fg-2">
          Got an invite code?{" "}
          <Link href="/join" className="font-medium text-fg-1 underline underline-offset-4">
            Join your team
          </Link>
          {" · "}
          <Link href="/signup" className="font-medium text-fg-1 underline underline-offset-4">
            Create a workspace
          </Link>
        </p>
      </div>
    </main>
  );
}
