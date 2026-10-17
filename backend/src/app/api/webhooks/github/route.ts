import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { ingestLink } from "@/lib/ingest";
import { isTechnical, orgMembers } from "@/lib/org";
import { store } from "@/lib/store";
import { translated } from "@/lib/translate";
import type { Comment, Org, StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
// Explaining, checking and one rewrite can take a couple of minutes (the Vercel Hobby maximum is 300 s).
export const maxDuration = 300;

type Push = { repository?: { full_name: string }; commits?: { id: string; author?: { username?: string } }[] };
type CommentEvent = {
  repository?: { full_name: string };
  comment?: { id: number; body: string; html_url: string; created_at: string; user?: { login: string }; commit_id?: string };
};

const verify = (secret: string, body: string, signature: string | null) => {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
};

/**
 * POST /api/webhooks/github?org=<id>
 * Add this URL to a repo's GitHub webhooks (content type: application/json,
 * secret from the Team page, events: pushes and comments). Every push by a
 * workspace member is explained and lands in their manager's feed.
 */
export async function POST(req: Request) {
  const orgId = new URL(req.url).searchParams.get("org") ?? "";
  const org = await store.get<Org>("orgs", orgId);
  const raw = await req.text();
  if (!org || !verify(org.webhookSecret, raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  if (event === "ping") return new Response("pong");

  const payload = JSON.parse(raw) as Push & CommentEvent;
  const repoName = payload.repository?.full_name?.toLowerCase();
  if (!repoName) return new Response("Ignored", { status: 202 });
  const [owner, repo] = repoName.split("/");
  const users = await orgMembers(org.id);

  if (event === "push") {
    const shas = (payload.commits ?? [])
      .filter((c) => users.some((u) => u.githubLogin && u.githubLogin.toLowerCase() === c.author?.username?.toLowerCase()))
      .map((c) => c.id)
      .slice(-6);
    // Answer GitHub at once; explaining takes a few seconds per commit.
    after(async () => {
      for (const sha of shas) await ingestLink(org, { owner, repo, kind: "commit", sha }, users, "webhook").catch(() => null);
    });
    return new Response(`Queued ${shas.length}`, { status: 202 });
  }

  if ((event === "commit_comment" || event === "issue_comment" || event === "pull_request_review_comment") && payload.comment) {
    const c = payload.comment;
    const author = users.find((u) => u.githubLogin?.toLowerCase() === c.user?.login.toLowerCase());
    if (!author || !isTechnical(author.role)) return new Response("Ignored", { status: 202 });
    after(async () => {
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
        ...(await translated(c.body, author.name, card?.explanation.title)),
      };
      await store.set("comments", id, comment);
    });
    return new Response("Queued", { status: 202 });
  }

  return new Response("Ignored", { status: 202 });
}
