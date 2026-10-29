import { enqueue, matchAuthor, type EnqueueResult, type GitPerson, type Incoming, type JobSource } from "./jobs";
import { isTechnical } from "./org";
import { store } from "./store";
import { translated } from "./translate";
import type { Comment, Org, StoredCard, User } from "./types";

/**
 * What GitHub sends on a push or a comment, and turning it into queued
 * commits. Shared by the GitHub App webhook and the older per-workspace one.
 */

type PushCommit = {
  id: string;
  message?: string;
  timestamp?: string;
  author?: { name?: string; email?: string; username?: string };
  added?: string[];
  modified?: string[];
  removed?: string[];
};

export type PushPayload = {
  ref?: string;
  deleted?: boolean;
  repository?: { full_name?: string; default_branch?: string };
  commits?: PushCommit[];
  pusher?: { name?: string; email?: string };
  sender?: { login?: string; id?: number; type?: string };
};

export type CommentPayload = {
  repository?: { full_name?: string };
  comment?: { id: number; body: string; html_url: string; created_at: string; user?: { login: string }; commit_id?: string };
};

/** Files that only record resolved dependency versions: a commit touching nothing else has nothing to explain. */
const LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "cargo.lock",
  "gemfile.lock",
  "composer.lock",
  "poetry.lock",
  "pipfile.lock",
  "uv.lock",
  "go.sum",
  "packages.lock.json",
  "podfile.lock",
  "pubspec.lock",
  "mix.lock",
  "flake.lock",
]);

const isBot = (s: string | undefined) => Boolean(s && /\[bot\]$/i.test(s.trim()));
/** The messages git and GitHub write for merges. A merge GitHub didn't label is caught by its parents later. */
const MERGE = /^Merge (pull request #\d+|branch |remote-tracking branch |tag |commit |[0-9a-f]{7,40} into )/i;
/** Conventional-commit "style:" means formatting only, by definition. */
const FORMATTING = /^style(\([^)]*\))?!?:/i;

/** Why a pushed commit isn't worth explaining, from the payload alone (no GitHub call), or undefined. */
export function skipReason(c: PushCommit, sender?: PushPayload["sender"]): string | undefined {
  const login = c.author?.username;
  if (isBot(login) || isBot(c.author?.name) || (sender?.type === "Bot" && (!login || login === sender.login))) return "Made by a bot.";
  const message = c.message ?? "";
  if (MERGE.test(message)) return "A merge commit: its changes are explained commit by commit.";
  if (FORMATTING.test(message)) return "Formatting only.";
  const files = [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])];
  if (files.length && files.every((f) => LOCKFILES.has(f.split("/").pop()!.toLowerCase()))) return "Only lockfiles changed.";
  return undefined;
}

export type PushOutcome = EnqueueResult & { ignored?: string };

const ignore = (reason: string): PushOutcome => ({ queued: 0, duplicates: 0, unassigned: 0, skipped: 0, ignored: reason });

/**
 * Queues every commit of a push to a watched repo and branch (the repo's
 * default branch unless the owner chose others). Branch deletions and tags
 * are ignored. Commits by unknown authors are queued as "unassigned", never dropped.
 * `requireWatched` is off for the older webhook, which a lead added to the repo by hand.
 */
export async function queuePush(org: Org, users: User[], payload: PushPayload, source: JobSource, requireWatched = true): Promise<PushOutcome> {
  const repo = payload.repository?.full_name?.toLowerCase();
  if (!repo) return ignore("no repository");
  if (requireWatched && !org.repos.includes(repo)) return ignore("repository not watched");
  if (payload.deleted) return ignore("branch deleted");
  if (!payload.ref?.startsWith("refs/heads/")) return ignore("not a branch");
  const branch = payload.ref.slice("refs/heads/".length);
  const chosen = org.branches?.[repo]?.filter(Boolean);
  const allowed = chosen?.length ? chosen : [payload.repository?.default_branch || "main"];
  if (!allowed.includes(branch)) return ignore("branch not watched");

  const sender = payload.sender;
  const pusher: GitPerson | undefined = payload.pusher || sender
    ? { name: payload.pusher?.name, email: payload.pusher?.email?.toLowerCase(), login: sender?.login?.toLowerCase(), id: sender?.id }
    : undefined;
  const at = new Date().toISOString();
  const commits: Incoming[] = (payload.commits ?? [])
    .filter((c) => typeof c?.id === "string" && /^[0-9a-f]{7,64}$/i.test(c.id))
    .map((c) => {
      const login = c.author?.username?.toLowerCase();
      return {
        repo,
        sha: c.id,
        branch,
        committedAt: c.timestamp ?? at,
        subject: (c.message ?? "").split("\n")[0],
        // The push's sender is GitHub's proof of who they are; it names the commit's author only when they're the same account.
        author: {
          login,
          email: c.author?.email?.toLowerCase(),
          name: c.author?.name,
          ...(login && sender?.login?.toLowerCase() === login && sender.id ? { id: sender.id } : {}),
        },
        pusher,
        skip: skipReason(c, sender),
      };
    });
  return enqueue(org, users, commits, source);
}

/**
 * A comment on GitHub by a technical member becomes a Rosetta comment,
 * rewritten for each reader. Returns the work to run after answering, or null.
 */
export function commentWork(org: Org, users: User[], payload: CommentPayload) {
  const c = payload.comment;
  const repoName = payload.repository?.full_name?.toLowerCase();
  if (!c || !repoName) return null;
  const login = c.user?.login?.toLowerCase();
  const author = login ? matchAuthor(org, users, { login })?.user : undefined;
  if (!author || !isTechnical(author.role) || c.body.includes("[Rosetta]")) return null;
  return async () => {
    const id = `gh_${c.id}`;
    if (await store.get("comments", id)) return;
    const cards = c.commit_id ? await store.list<StoredCard>("cards", "orgId", org.id) : [];
    const card = cards.find((k) => k.headSha === c.commit_id);
    const comment: Comment = {
      id,
      orgId: org.id,
      cardId: card?.id,
      authorId: author.id,
      source: "github",
      githubUrl: c.html_url,
      repo: repoName,
      createdAt: c.created_at,
      ...(await translated(c.body, author.name, card?.explanation.title, org.id)),
    };
    await store.set("comments", id, comment);
  };
}
