import { publicUser, requireUser } from "@/lib/auth";
import { json, preflight, route } from "@/lib/http";
import type { Notification } from "@/lib/notify";
import { orgMembers } from "@/lib/org";
import { store } from "@/lib/store";
import type { Comment, Org, StoredCard, StoredUser, Ticket } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/me/export → a JSON file of what Rosetta holds about you: your
 * profile and consent record, your comments, your questions, reports of
 * mistakes and replies (only your own messages; other people's words are
 * theirs), the changes credited to you, the personal notes written for you,
 * and your notifications. Never the password hash.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const [stored, org, users, comments, tickets, cards, notes] = await Promise.all([
    store.get<StoredUser>("users", me.id),
    store.get<Org>("orgs", me.orgId),
    orgMembers(me.orgId),
    store.list<Comment>("comments", "orgId", me.orgId),
    store.list<Ticket>("tickets", "orgId", me.orgId),
    store.list<StoredCard>("cards", "orgId", me.orgId),
    store.list<Notification>("notifications", "userId", me.id),
  ]);
  // Personal notes are cached per reader and change, keyed `<card>_<user>`.
  const personal = await Promise.all(
    cards.map(async (c) => ({ cardId: c.id, note: await store.get<{ text: string }>("notes", `${c.id}_${me.id}`) })),
  );
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "Former member";
  const data = {
    exportedAt: new Date().toISOString(),
    workspace: org ? { name: org.name, youAreOwner: org.ownerId === me.id } : null,
    profile: publicUser(stored ?? me),
    reportsTo: me.managerId ? nameOf(me.managerId) : null,
    comments: comments.filter((c) => c.authorId === me.id).map(({ id, cardId, text, source, createdAt }) => ({ id, cardId, text, source, createdAt })),
    questions: tickets
      .filter((t) => t.fromId === me.id || t.toId === me.id)
      .map((t) => ({
        id: t.id,
        kind: t.kind ?? "question",
        subject: t.subject,
        with: nameOf(t.fromId === me.id ? t.toId : t.fromId),
        direction: t.fromId === me.id ? "asked by you" : "asked of you",
        status: t.status,
        createdAt: t.createdAt,
        yourMessages: t.messages.filter((m) => m.authorId === me.id).map(({ text, createdAt }) => ({ text, createdAt })),
      })),
    changesCreditedToYou: cards
      .filter((c) => c.authorUserId === me.id)
      .map((c) => ({ id: c.id, title: c.explanation.title, repo: c.repo, commit: c.headSha, committedAt: c.committedAt, status: c.status })),
    personalNotes: personal.filter((p) => p.note).map((p) => ({ cardId: p.cardId, text: p.note!.text })),
    notifications: notes.map(({ kind, title, read, createdAt }) => ({ kind, title, read, createdAt })),
  };
  const res = json(data);
  res.headers.set("Content-Disposition", `attachment; filename="rosetta-data-${new Date().toISOString().slice(0, 10)}.json"`);
  return res;
});
