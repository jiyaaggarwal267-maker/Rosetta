import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { canMessage, canSeeCard, orgMembers } from "@/lib/org";
import { store } from "@/lib/store";
import { ticketView } from "@/lib/tickets";
import { sendQuestion } from "@/lib/mail";
import { notifications } from "@/lib/notify";
import { translateTicketMessageLater } from "@/lib/translate";
import type { StoredCard, Ticket } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const newId = (p: string) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

/** GET /api/tickets → { received, sent } */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const users = await orgMembers(me.orgId);
  const [tickets, cards] = await Promise.all([
    store.list<Ticket>("tickets", "orgId", me.orgId),
    store.list<StoredCard>("cards", "orgId", me.orgId),
  ]);
  const titles = new Map(cards.map((c) => [c.id, c.explanation.title]));
  const mine = tickets
    .filter((t) => t.fromId === me.id || t.toId === me.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((t) => ticketView(t, me, users, t.context ? titles.get(t.context.cardId) : undefined));
  return json({
    received: mine.filter((t) => t.direction === "received"),
    sent: mine.filter((t) => t.direction === "sent"),
    unread: mine.filter((t) => t.unread).length,
  });
});

const body = z.object({
  toId: z.string(),
  subject: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(2000),
  context: z
    .object({ cardId: z.string(), nodeKey: z.string(), technicalQuestion: z.string().max(1000).optional() })
    .optional(),
});

/**
 * POST /api/tickets: ask someone a question, e.g. a manager asking an intern
 * "Are you working on something for the release?". No GitHub needed.
 */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const input = await readJson(req, body);
  const users = await orgMembers(me.orgId);
  const to = users.find((u) => u.id === input.toId);
  if (!to || !canMessage(me, to, users)) throw new ApiError("forbidden", "You can't message this person.");

  let card: StoredCard | null = null;
  if (input.context) {
    card = await store.get<StoredCard>("cards", input.context.cardId);
    if (!card || !canSeeCard(me, card, users)) throw new ApiError("not_found");
  }

  const now = new Date().toISOString();
  const ticket: Ticket = {
    id: newId("t"),
    orgId: me.orgId,
    fromId: me.id,
    toId: to.id,
    subject: input.subject,
    ...(input.context ? { context: input.context } : {}),
    status: "open",
    messages: [{ id: newId("tm"), authorId: me.id, createdAt: now, text: input.text }],
    unreadBy: [to.id],
    createdAt: now,
    updatedAt: now,
  };
  await store.set("tickets", ticket.id, ticket);
  // Send at once; the version for each reader is written in the background.
  after(() => translateTicketMessageLater(ticket.id, ticket.messages[0].id, me.name, card?.explanation.title));
  after(() => notifications.question({ orgId: me.orgId, to: to.id, fromName: me.name, subject: input.subject, ticketId: ticket.id }));
  after(() => sendQuestion({ to: to.email, toName: to.name, fromName: me.name, subject: input.subject, text: input.text, ticketId: ticket.id }));
  return json({ ticket: ticketView(ticket, me, users, card?.explanation.title) }, 201);
});
