import { personOf } from "./org";
import { displayFor } from "./translate";
import type { StoredCard, Ticket, User } from "./types";

/** A ticket as one participant sees it. */
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
    context: t.context
      ? {
          cardId: t.context.cardId,
          nodeKey: t.context.nodeKey,
          cardTitle: cardTitle ?? "",
          // The engineer sees the precise version Rosetta wrote for them.
          technicalQuestion: me.id === t.toId ? t.context.technicalQuestion : undefined,
        }
      : null,
  };
}

export function ticketDetail(t: Ticket, me: User, users: User[], card?: StoredCard | null) {
  return {
    ...ticketView(t, me, users, card?.explanation.title),
    stepLabel: t.context?.nodeKey && card ? (card.explanation.levels[me.role].labels[t.context.nodeKey] ?? t.context.nodeKey) : null,
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
