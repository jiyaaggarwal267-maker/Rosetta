import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { orgMembers } from "@/lib/org";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import { ticketDetail, visibleCard } from "@/lib/tickets";
import { sendReply } from "@/lib/mail";
import { notifications } from "@/lib/notify";
import { backfill, translateTicketMessageLater } from "@/lib/translate";
import type { StoredCard, Ticket, User } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

/*
 * A thread is one document, so every write re-reads it first and changes only
 * its own part: a reply or a translation saved meanwhile is never lost.
 * (Very long threads would approach Firestore's 1 MiB document limit; replies
 * are capped at 2000 characters, so that's thousands of messages away.)
 */

async function load(id: string, me: User) {
  const ticket = await store.get<Ticket>("tickets", id);
  if (!ticket || (ticket.fromId !== me.id && ticket.toId !== me.id)) throw new ApiError("not_found");
  const [users, card] = await Promise.all([
    orgMembers(me.orgId),
    ticket.context ? store.get<StoredCard>("cards", ticket.context.cardId) : null,
  ]);
  return { ticket, users, card };
}

/** The latest copy of the ticket, right before a write. */
async function fresh(id: string) {
  const ticket = await store.get<Ticket>("tickets", id);
  if (!ticket) throw new ApiError("not_found");
  return ticket;
}

/** Context for translating: the card's title only when both people can open the card. */
function contextFor(ticket: Ticket, card: StoredCard | null, users: User[]) {
  const both = [ticket.fromId, ticket.toId].map((uid) => users.find((u) => u.id === uid));
  const shared = card && both.every((u) => u && visibleCard(card, u, users));
  return shared ? card.explanation.title : ticket.subject;
}

/** GET /api/tickets/:id: the thread at my level; marks it read. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const { ticket, users, card } = await load(id, me);
  const wasUnread = ticket.unreadBy.includes(me.id);
  // Messages written before an AI key was set get their level versions now.
  const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? "A teammate";
  const translated = await backfill(ticket.messages, nameOf, contextFor(ticket, card, users), 4, ticket.orgId);
  if (wasUnread || translated) {
    // Backfill can take a while: merge into the latest copy, not the one read before it.
    const latest = await fresh(id);
    latest.unreadBy = latest.unreadBy.filter((u) => u !== me.id);
    if (translated) {
      const done = new Map(ticket.messages.filter((m) => m.levels).map((m) => [m.id, m]));
      for (const m of latest.messages) {
        const t = done.get(m.id);
        if (t && !m.levels && t.text === m.text) {
          m.levels = t.levels;
          m.hinglish = t.hinglish;
        }
      }
    }
    await store.set("tickets", id, latest);
    return json({ ticket: ticketDetail(latest, me, users, card) });
  }
  return json({ ticket: ticketDetail(ticket, me, users, card) });
});

/** POST /api/tickets/:id { text }: reply. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  // Every reply is rewritten for six readers by a model: a fair number per person.
  limit(`reply:${me.id}`, 60, 60 * 60_000);
  const { text } = await readJson(req, z.object({ text: z.string().trim().min(1).max(2000) }));
  const { users, card } = await load(id, me);
  const ticket = await fresh(id);
  const now = new Date().toISOString();
  const otherId = ticket.fromId === me.id ? ticket.toId : ticket.fromId;
  const messageId = `tm_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  ticket.messages.push({ id: messageId, authorId: me.id, createdAt: now, text });
  // The person asked replying means it's answered; the asker following up reopens it.
  ticket.status = me.id === ticket.toId ? "answered" : "open";
  ticket.unreadBy = [otherId];
  ticket.updatedAt = now;
  await store.set("tickets", id, ticket);
  const context = contextFor(ticket, card, users);
  after(() => translateTicketMessageLater(id, messageId, me.name, context));
  const other = users.find((u) => u.id === otherId);
  if (other) after(() => notifications.reply({ orgId: me.orgId, to: other.id, fromName: me.name, subject: ticket.subject, ticketId: id }));
  if (other) after(() => sendReply({ to: other.email, fromName: me.name, subject: ticket.subject, text, ticketId: id }));
  return json({ ticket: ticketDetail(ticket, me, users, card) });
});

/** PATCH /api/tickets/:id { status }: close or reopen. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const { status } = await readJson(req, z.object({ status: z.enum(["open", "closed"]) }));
  const { users, card } = await load(id, me);
  const ticket = await fresh(id);
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  await store.set("tickets", id, ticket);
  return json({ ticket: ticketDetail(ticket, me, users, card) });
});
