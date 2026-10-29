import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { sendReport } from "@/lib/mail";
import { notifications } from "@/lib/notify";
import { canSeeCard, cardOwner, orgMembers } from "@/lib/org";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import { ticketView } from "@/lib/tickets";
import { translateTicketMessageLater } from "@/lib/translate";
import type { StoredCard, Ticket } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  text: z.string().trim().min(3).max(1000),
  nodeKey: z.string().max(80).optional(),
});

const newId = (p: string) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

/** Only a step this card really has a label for (never "__proto__" or other junk); otherwise the whole card. */
const knownKey = (card: StoredCard, key = "") =>
  key && Object.values(card.explanation.levels).some((l) => l?.labels && Object.hasOwn(l.labels, key)) ? key : "";

/**
 * POST /api/cards/:id/report { text, nodeKey? }: anyone who can read a card
 * tells its author the explanation looks wrong. It arrives as a question in
 * their inbox, and the card counts the reports.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const input = await readJson(req, body);
  const users = await orgMembers(me.orgId);
  const card = await store.get<StoredCard>("cards", id);
  if (!card || !canSeeCard(me, card, users)) throw new ApiError("not_found");
  const author = users.find((u) => u.id === cardOwner(card));
  if (!author) throw new ApiError("bad_request", "Nobody in this workspace wrote this change, so there's no one to tell.");
  if (author.id === me.id) throw new ApiError("bad_request", "This is your change. Edit the text, or use Explain again.");
  limit(`report:${me.id}`, 10, 60 * 60_000);

  const now = new Date().toISOString();
  const ticket: Ticket = {
    id: newId("t"),
    orgId: me.orgId,
    fromId: me.id,
    toId: author.id,
    subject: `Possible mistake: ${card.explanation.title}`.slice(0, 120),
    kind: "report",
    context: { cardId: card.id, nodeKey: knownKey(card, input.nodeKey) },
    status: "open",
    messages: [{ id: newId("tm"), authorId: me.id, createdAt: now, text: input.text }],
    unreadBy: [author.id],
    createdAt: now,
    updatedAt: now,
  };
  await store.set("tickets", ticket.id, ticket);
  // Count on the latest copy, so a review or edit made meanwhile isn't undone.
  const latest = await store.get<StoredCard>("cards", card.id);
  if (latest) await store.set("cards", card.id, { ...latest, reports: (latest.reports ?? 0) + 1 });
  after(() => translateTicketMessageLater(ticket.id, ticket.messages[0].id, me.name, card.explanation.title));
  after(() => notifications.report({ orgId: me.orgId, to: author.id, fromName: me.name, title: card.explanation.title, ticketId: ticket.id }));
  after(() => sendReport({ to: author.email, toName: author.name, fromName: me.name, title: card.explanation.title, text: input.text, ticketId: ticket.id }));
  return json({ ticket: ticketView(ticket, me, users, card.explanation.title) }, 201);
});
