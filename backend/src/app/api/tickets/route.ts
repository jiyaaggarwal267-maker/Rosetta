import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { canMessage, canSeeCard, orgMembers } from "@/lib/org";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import { NODE_KEY, technicalQuestionFor, ticketView } from "@/lib/tickets";
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
  // Only titles of cards I can open: a question about one I can't see doesn't reveal it.
  const titles = new Map(cards.filter((c) => canSeeCard(me, c, users)).map((c) => [c.id, c.explanation.title]));
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
  // A technicalQuestion sent here is ignored: the server uses the one Rosetta wrote in /api/ask.
  context: z.object({ cardId: z.string(), nodeKey: z.string().regex(NODE_KEY) }).optional(),
});

/**
 * POST /api/tickets: ask someone a question, e.g. a manager asking an intern
 * "Are you working on something for the release?". No GitHub needed.
 */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  // Every message is rewritten for six readers by a model: a fair number per person.
  limit(`ticket:${me.id}`, 20, 60 * 60_000);
  const input = await readJson(req, body);
  const users = await orgMembers(me.orgId);
  const to = users.find((u) => u.id === input.toId);
  if (!to || !canMessage(me, to, users)) throw new ApiError("forbidden", "You can't message this person.");

  let card: StoredCard | null = null;
  let context: Ticket["context"];
  if (input.context) {
    card = await store.get<StoredCard>("cards", input.context.cardId);
    if (!card || !canSeeCard(me, card, users)) throw new ApiError("not_found");
    const technicalQuestion = await technicalQuestionFor(me.id, card.id, input.context.nodeKey);
    context = { cardId: card.id, nodeKey: input.context.nodeKey, ...(technicalQuestion ? { technicalQuestion } : {}) };
  }

  const now = new Date().toISOString();
  const ticket: Ticket = {
    id: newId("t"),
    orgId: me.orgId,
    fromId: me.id,
    toId: to.id,
    subject: input.subject,
    ...(context ? { context } : {}),
    status: "open",
    messages: [{ id: newId("tm"), authorId: me.id, createdAt: now, text: input.text }],
    unreadBy: [to.id],
    createdAt: now,
    updatedAt: now,
  };
  await store.set("tickets", ticket.id, ticket);
  // Send at once; the version for each reader is written in the background.
  // The recipient may not be able to open the card, so its title isn't sent as context for them.
  const shared = card && canSeeCard(to, card, users) ? card.explanation.title : undefined;
  after(() => translateTicketMessageLater(ticket.id, ticket.messages[0].id, me.name, shared));
  after(() => notifications.question({ orgId: me.orgId, to: to.id, fromName: me.name, subject: input.subject, ticketId: ticket.id }));
  after(() => sendQuestion({ to: to.email, toName: to.name, fromName: me.name, subject: input.subject, text: input.text, ticketId: ticket.id }));
  return json({ ticket: ticketView(ticket, me, users, card?.explanation.title) }, 201);
});
