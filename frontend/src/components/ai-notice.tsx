import Link from "next/link";
import { cn } from "@/lib/utils";

/** Said once, right where it happens: what leaves Rosetta for the AI provider. */
export function AiNotice({ what = "The code and your question are", className }: { what?: string; className?: string }) {
  return (
    <p className={cn("t-micro text-fg-3", className)}>
      {what} sent to our AI provider to write the answer.{" "}
      <Link href="/privacy#ai" className="underline underline-offset-4 hover:text-fg-1">
        Learn more
      </Link>
    </p>
  );
}
