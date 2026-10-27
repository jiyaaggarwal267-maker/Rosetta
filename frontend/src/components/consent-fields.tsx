"use client";

import Link from "next/link";

/** Moves focus to the first field marked invalid, after React has shown the errors. */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}

/**
 * The two ticks at signup and join: the Terms (required) and product emails
 * (optional). Neither is pre-ticked. The legal pages open in a new tab, so
 * nothing typed into the form is lost.
 */
export function ConsentFields({
  terms,
  marketing,
  onTerms,
  onMarketing,
  error,
}: {
  terms: boolean;
  marketing: boolean;
  onTerms: (v: boolean) => void;
  onMarketing: (v: boolean) => void;
  error?: string;
}) {
  const box = "mt-0.5 size-5 shrink-0 cursor-pointer accent-(--btn-primary-bg)";
  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">Agreements</legend>
      <div className="grid gap-1">
        <label className="flex cursor-pointer items-start gap-3 t-small text-fg-1">
          <input
            type="checkbox"
            name="acceptTerms"
            checked={terms}
            onChange={(e) => onTerms(e.target.checked)}
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "acceptTerms-error" : undefined}
            className={box}
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-medium underline underline-offset-4">
              Terms<span className="sr-only"> (opens in a new tab)</span>
            </Link>{" "}
            and have read the{" "}
            <Link href="/privacy" target="_blank" className="font-medium underline underline-offset-4">
              Privacy Policy<span className="sr-only"> (opens in a new tab)</span>
            </Link>
            . <span className="text-fg-3">(required)</span>
          </span>
        </label>
        {error && (
          <p id="acceptTerms-error" className="pl-8 t-small font-medium text-danger">
            {error}
          </p>
        )}
      </div>
      <label className="flex cursor-pointer items-start gap-3 t-small text-fg-1">
        <input type="checkbox" name="marketingOptIn" checked={marketing} onChange={(e) => onMarketing(e.target.checked)} className={box} />
        <span>
          Email me product updates. <span className="text-fg-3">(optional, you can turn this off in your profile)</span>
        </span>
      </label>
      <p className="t-micro text-fg-3">
        See{" "}
        <Link href="/data" target="_blank" className="underline underline-offset-4">
          what data we collect<span className="sr-only"> (opens in a new tab)</span>
        </Link>
        .
      </p>
    </fieldset>
  );
}
