"use client";

import type { ClipboardEvent, RefObject } from "react";
import { Button } from "./button";

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  onPasteValue: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  invalid: boolean;
  describedBy?: string;
  inputRef: RefObject<HTMLInputElement | null>;
};

/**
 * Glass wrapper, 56px tall, 16px radius with 4px padding; the field and the
 * button inside use 12px (16 − 4).
 */
export function LinkInput({ value, onValueChange, onPasteValue, onSubmit, loading, invalid, describedBy, inputRef }: Props) {
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").trim();
    if (!text) return;
    e.preventDefault();
    onPasteValue(text);
  };

  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-2">
      <label htmlFor="commit-link" className="px-1 t-small font-medium text-fg-1">
        GitHub commit or pull request link
      </label>
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="glass flex h-14 w-full items-center gap-1 rounded-md p-1 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus"
    >
      <input
        id="commit-link"
        ref={inputRef}
        type="text"
        inputMode="url"
        enterKeyHint="go"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="github.com/owner/repo/commit/…"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onPaste={onPaste}
        readOnly={loading}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="h-12 min-w-0 flex-1 rounded-[12px] bg-transparent px-4 font-mono text-base font-medium text-fg-1 outline-none placeholder:font-normal placeholder:text-fg-3"
      />
      <Button type="submit" variant="primary" loading={loading} className="h-12! rounded-[12px] px-5">
        Explain
      </Button>
    </form>
    </div>
  );
}
