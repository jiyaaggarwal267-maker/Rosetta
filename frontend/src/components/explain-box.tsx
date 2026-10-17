"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ApiError, explain } from "@/lib/api";
import { ERROR_COPY } from "@/lib/errors";
import { EXAMPLE_LINK, parseGitHubLink } from "@/lib/github-url";
import { SAMPLES } from "@/lib/mock/samples";
import type { ApiCode } from "@/lib/types";
import { LinkInput } from "./link-input";
import { AiNotice } from "./ai-notice";
import { LoadingStory } from "./loading-story";

type Stage = "writing" | "checking" | "rewriting" | null;
type Phase = { kind: "idle" } | { kind: "loading"; title?: string; findings: string[]; stage: Stage };

/** Paste a commit link; the loading story narrates, then the card opens. */
export function ExplainBox({ samples = false }: { samples?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<ApiCode | null>(null);
  const loading = phase.kind === "loading";

  const start = async (url: string) => {
    if (loading) return;
    if (!parseGitHubLink(url)) {
      setError("invalid_url");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setPhase({ kind: "loading", findings: [], stage: null });
    try {
      const card = await explain(url, (event) =>
        setPhase((p) => {
          if (p.kind !== "loading") return p;
          if (event.type === "start") return { ...p, title: event.title };
          if (event.type === "finding") return { ...p, findings: [...p.findings, event.text] };
          return { ...p, stage: event.type };
        }),
      );
      router.push(`/app/c/${card.id}`);
    } catch (e) {
      setPhase({ kind: "idle" });
      setError(e instanceof ApiError ? e.code : "unavailable");
    }
  };

  const copy = error ? ERROR_COPY[error] : null;

  return (
    <div className="w-full">
      <LinkInput
        value={value}
        onValueChange={(v) => {
          setValue(v);
          if (error === "invalid_url" && parseGitHubLink(v)) setError(null);
        }}
        onPasteValue={(v) => {
          setValue(v);
          setError(parseGitHubLink(v) ? null : "invalid_url");
        }}
        onSubmit={() => start(value)}
        loading={loading}
        invalid={error === "invalid_url"}
        describedBy={copy ? "explain-status" : undefined}
        inputRef={inputRef}
      />
      <AiNotice what="The commit's code is" className="mt-2 px-1" />
      <div id="explain-status" className="mt-2 min-h-6 px-1">
        {copy && (
          <p role="alert" className="t-small font-medium text-fg-1">
            {copy.message}
            {error === "invalid_url" && <span className="font-normal text-fg-2"> Links look like <span className="font-mono">{EXAMPLE_LINK}</span></span>}
          </p>
        )}
      </div>
      {loading ? (
        <div className="mt-2">
          <LoadingStory title={phase.title} findings={phase.findings} stage={phase.stage} />
        </div>
      ) : (
        samples && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-small text-fg-3">Try:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setValue(s.url);
                  void start(s.url);
                }}
                className="press h-8 rounded-xs bg-surface-2 px-3 t-small font-medium text-fg-2 hover:text-fg-1 pointer-coarse:h-11"
              >
                {s.name}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
