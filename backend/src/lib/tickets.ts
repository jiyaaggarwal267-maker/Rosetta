import { createHash } from "node:crypto";
import { canSeeCard, personOf } from "./org";
import { store } from "./store";
import { displayFor } from "./translate";
import type { StoredCard, Ticket, User } from "./types";

/**
 * The technical rewrite of a question is written by Rosetta in /api/ask and
 * kept here, so a ticket can carry it without trusting the sender's copy.
 */
const TECHNICAL_KEEP_MS = 24 * 3_600_000;
const technicalId = (userId: string, cardId: string, nodeKey: string) =>
  `ask_${createHash("sha256").update(JSON.stringify([userId, cardId, nodeKey])).digest("hex").slice(0, 32)}`;

type TechnicalNote = { userId: string; cardId: string; nodeKey: string; technicalQuestion: string; createdAt: string };

export async function rememberTechnicalQuestion(userId: string, cardId: string, nodeKey: string, technicalQuestion: string) {
  const note: TechnicalNote = { userId, cardId, nodeKey, technicalQuestion, createdAt: new Date().toISOString() };
  await store.set("checks", technicalId(userId, cardId, nodeKey), note).catch(() => {});
}

/** The last technical rewrite Rosetta wrote for this person's question about this step, if recent. */
export async function technicalQuestionFor(userId: string, cardId: string, nodeKey: string) {
  const note = await store.get<TechnicalNote>("checks", technicalId(userId, cardId, nodeKey)).catch(() => null);
  if (!note || note.userId !== userId || Date.now() - Date.parse(note.createdAt) > TECHNICAL_KEEP_MS) return undefined;
  return note.technicalQuestion;
}

/**
 * A step key as the flowcharts write them (words joined by "_", starting with
 * a letter or digit). Anything else, like "__proto__", is refused before it's
 * used as a lookup key; lookups also check own properties ("constructor").
 */
export const NODE_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;

/** One reader's label for a step: always a string, or null when there's none. */
export function stepLabelOf(card: StoredCard, role: User["role"], nodeKey: string): string | null {
  if (!NODE_KEY.test(nodeKey)) return null;
  const labels = card.explanation.levels[role]?.labels;
  const label = labels && Object.hasOwn(labels, nodeKey) ? labels[nodeKey] : undefined;
  return typeof label === "string" ? label : nodeKey;
}

/**
 * The card a ticket is about, only if this person may open it: someone asked
 * about a card they can't see doesn't learn its title or steps.
 */
export const visibleCard = (card: StoredCard | null | undefined, me: User, users: User[]) => (card && canSeeCard(me, card, users) ? card : null);

/** A ticket as one participant sees it. `cardTitle` is only passed when `me` can see the card. */
export function ticketView(t: Ticket, me: User, users: User[], cardTitle?: string) {
  const otherId = t.fromId === me.id ? t.toId : t.fromId;
  const other = users.find((u) => u.id === otherId);
  const from = users.find((u) => u.id === t.fromId);
  const to = users.find((u) => u.id === t.toId);
  const last = t.messages.at(-1);
  return {
    id: t.id,
    subject: t.subject,
    kind: t.kind ?? "question",
    status: t.status,
    direction: t.fromId === me.id ? ("sent" as const) : ("received" as const),
    from: from ? personOf(from, users) : null,
    to: to ? personOf(to, users) : null,
    other: other ? personOf(other, users) : null,
    unread: t.unreadBy.includes(me.id),
    updatedAt: t.updatedAt,
    createdAt: t.createdAt,
    preview: last ? displayFor(last, me).text.slice(0, 160) : "",
    context:
      t.context && cardTitle !== undefined
        ? {
            cardId: t.context.cardId,
            nodeKey: t.context.nodeKey,
            cardTitle,
            // The engineer sees the precise version Rosetta wrote for them (set by the server, never by the sender).
            technicalQuestion: me.id === t.toId ? t.context.technicalQuestion : undefined,
          }
        : null,
  };
}

export function ticketDetail(t: Ticket, me: User, users: User[], card?: StoredCard | null) {
  const seen = visibleCard(card, me, users);
  return {
    ...ticketView(t, me, users, seen?.explanation.title),
    stepLabel: t.context?.nodeKey && seen ? stepLabelOf(seen, me.role, t.context.nodeKey) : null,
    messages: t.messages.map((m) => {
      const author = users.find((u) => u.id === m.authorId);
      return {
        id: m.id,
        author: author ? personOf(author, users) : null,
        mine: m.authorId === me.id,
        createdAt: m.createdAt,
        ...displayFor(m, me),
      };
    }),
  };
}
