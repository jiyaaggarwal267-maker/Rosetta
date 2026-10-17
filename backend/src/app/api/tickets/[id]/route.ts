import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { orgMembers } from "@/lib/org";
import { store } from "@/lib/store";
import { ticketDetail } from "@/lib/tickets";
import { sendReply } from "@/lib/mail";
import { notifications } from "@/lib/notify";
import { backfill, translateTicketMessageLater } from "@/lib/translate";
import type { StoredCard, Ticket, User } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string, me: User) {
  const ticket = await store.get<Ticket>("tickets", id);
  if (!ticket || (ticket.fromId !== me.id && ticket.toId !== me.id)) throw new ApiError("not_found");
  const [users, card] = await Promise.all([
    orgMembers(me.orgId),
    ticket.context ? store.get<StoredCard>("cards", ticket.context.cardId) : null,
  ]);
  return { ticket, users, card };
}

/** GET /api/tickets/:id: the thread at my level; marks it read. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const { ticket, users, card } = await load(id, me);
  let dirty = false;
  if (ticket.unreadBy.includes(me.id)) {
    ticket.unreadBy = ticket.unreadBy.filter((u) => u !== me.id);
    dirty = true;
  }
  // Messages written before an AI key was set get their level versions now.
  const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? "A teammate";
  if (await backfill(ticket.messages, nameOf, card?.explanation.title ?? ticket.subject)) dirty = true;
  if (dirty) await store.set("tickets", id, ticket);
  return json({ ticket: ticketDetail(ticket, me, users, card) });
});

/** POST /api/tickets/:id { text }: reply. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const { text } = await readJson(req, z.object({ text: z.string().trim().min(1).max(2000) }));
  const { ticket, users, card } = await load(id, me);
  const now = new Date().toISOString();
  const otherId = ticket.fromId === me.id ? ticket.toId : ticket.fromId;
  const messageId = `tm_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  ticket.messages.push({ id: messageId, authorId: me.id, createdAt: now, text });
  // The person asked replying means it's answered; the asker following up reopens it.
  ticket.status = me.id === ticket.toId ? "answered" : "open";
  ticket.unreadBy = [otherId];
  ticket.updatedAt = now;
  await store.set("tickets", id, ticket);
  after(() => translateTicketMessageLater(id, messageId, me.name, card?.explanation.title ?? ticket.subject));
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
  const { ticket, users, card } = await load(id, me);
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  await store.set("tickets", id, ticket);
  return json({ ticket: ticketDetail(ticket, me, users, card) });
});
