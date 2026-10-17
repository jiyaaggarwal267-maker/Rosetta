import type { Evidence } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GitHubIcon } from "./icons";

/** The diff lines behind one flowchart step: proof the box isn't made up. */
export function EvidenceSnippet({ evidence }: { evidence: Evidence }) {
  return (
    <figure className="grid gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 t-micro text-fg-3">
        <span className="min-w-0 truncate font-mono">
          {evidence.file}
          {evidence.line ? `:${evidence.line}` : ""}
        </span>
        {evidence.url && (
          <a href={evidence.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 hover:text-fg-1">
            <GitHubIcon size={12} /> Open on GitHub
          </a>
        )}
      </figcaption>
      <pre className="overflow-x-auto rounded-sm bg-surface-2 py-2 font-mono text-[12.5px] leading-5 shadow-ring">
        {evidence.lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              "flex min-w-max gap-3 px-3",
              l.kind === "+" && "bg-[color-mix(in_srgb,var(--risk-low)_14%,transparent)]",
              l.kind === "-" && "bg-[color-mix(in_srgb,var(--risk-high)_12%,transparent)]",
            )}
          >
            <span
              aria-label={l.kind === "+" ? "added" : l.kind === "-" ? "removed" : undefined}
              className={cn("w-2 shrink-0 select-none", l.kind === "+" ? "text-(--risk-low)" : l.kind === "-" ? "text-(--risk-high)" : "text-fg-3")}
            >
              {l.kind === " " ? "" : l.kind === "-" ? "−" : "+"}
            </span>
            <code className="whitespace-pre text-fg-1">{l.text || " "}</code>
          </div>
        ))}
      </pre>
    </figure>
  );
}
