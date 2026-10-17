import { publicCard } from "../cards";
import { pause } from "../http";
import { sendNewChange } from "../mail";
import { notifications } from "../notify";
import { isTechnical } from "../org";
import { store } from "../store";
import type { Org, StoredCard, User } from "../types";
import { PITCH, pitchExplanation } from "./pitch";
import { writePitchThread } from "./pitch-thread";

/**
 * Explains the pitch commit for one workspace. Same answer every time, with
 * the full loading story (reading, findings, writing, checking) so it looks
 * and feels like a live explanation, and no GitHub or AI calls, so it can't
 * fail on stage. Pasting it again regenerates it fresh.
 */
export async function explainPitch(cardId: string, org: Org, me: User, users: User[], emit: (line: object) => void) {
  emit({ type: "start", title: PITCH.reading });
  for (const text of PITCH.findings) {
    await pause(700);
    emit({ type: "finding", text });
  }
  await pause(500);
  emit({ type: "writing" });
  await pause(2200);
  emit({ type: "checking" });
  await pause(1600);

  // Whoever pastes it as an engineer is the author, so it lands in their manager's feed.
  const owner = isTechnical(me.role) ? me : users.find((u) => u.githubLogin?.toLowerCase() === PITCH.author.login);
  const previous = await store.get<StoredCard>("cards", cardId);
  const now = Date.now();
  const card: StoredCard = {
    id: cardId,
    orgId: org.id,
    repo: PITCH.repo,
    ref: { kind: "commit", sha: PITCH.sha },
    url: PITCH.url,
    author: owner ? { name: owner.name, login: owner.githubLogin ?? PITCH.author.login } : PITCH.author,
    authorUserId: owner?.id,
    committedAt: new Date(now - 20 * 60_000).toISOString(),
    status: "draft",
    files: PITCH.files.map((f) => ({ path: f.filename, additions: f.additions, deletions: f.deletions, url: f.blob_url })),
    explanation: pitchExplanation(),
    headSha: PITCH.sha,
    reading: PITCH.reading,
    findings: PITCH.findings,
    createdBy: me.id,
    source: "manual",
    createdAt: new Date(now).toISOString(),
    // Readers' reports stay, so a reported mistake doesn't vanish on regenerate.
    ...(previous?.reports ? { reports: previous.reports } : {}),
  };
  await store.set("cards", card.id, card);

  // A question from their manager, already answered, with every reader's version.
  const thread = owner ? await writePitchThread({ orgId: org.id, ownerId: org.ownerId, cardId: card.id, author: owner, users, now }) : null;

  // Tell the author's manager, but not on every rehearsal paste.
  const fresh = !previous || now - new Date(previous.createdAt).getTime() > 10 * 60_000;
  if (fresh && thread && owner) {
    await notifications.reply({ orgId: org.id, to: thread.asker.id, fromName: owner.name, subject: thread.ticket.subject, ticketId: thread.ticket.id });
  }
  const manager = owner?.managerId ? users.find((u) => u.id === owner.managerId) : undefined;
  if (fresh && owner && manager) {
    await notifications.change({ orgId: org.id, to: manager.id, authorName: owner.name, title: card.explanation.title, cardId: card.id });
    void sendNewChange({
      to: manager.email,
      managerName: manager.name,
      authorName: owner.name,
      title: card.explanation.title,
      summary: card.explanation.levels[manager.role].summary,
      cardId: card.id,
    });
  }
  return publicCard(card, me, users);
}
