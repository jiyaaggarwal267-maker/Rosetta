"use client";

import type { ElementType, FocusEvent, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

type Props = {
  as?: ElementType;
  value: string;
  editable: boolean;
  label: string;
  onCommit: (value: string) => void;
  className?: string;
};

/**
 * Plain text that becomes inline-editable in engineer review. The element
 * is keyed by its value, so React never fights the browser over the DOM.
 */
export function Editable({ as: Tag = "p", value, editable, label, onCommit, className }: Props) {
  if (!editable) return <Tag className={className}>{value}</Tag>;

  const commit = (e: FocusEvent<HTMLElement>) => {
    const next = (e.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!next) e.currentTarget.textContent = value;
    else if (next !== value) onCommit(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      e.currentTarget.textContent = value;
      e.currentTarget.blur();
    }
  };

  // The element keeps its meaning (a heading stays a heading); the editable box lives inside it.
  return (
    <Tag className={className}>
      <span
        key={value}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-label={label}
        spellCheck
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="editable block"
      >
        {value}
      </span>
    </Tag>
  );
}
