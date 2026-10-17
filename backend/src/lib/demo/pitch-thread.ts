import { store } from "../store";
import type { LevelKey } from "../levels";
import type { Ticket, User } from "../types";

/**
 * The pitch commit's question thread: the engineer's manager asks about one
 * step, the engineer has answered, and both messages are already rewritten
 * for every reader (plus Hinglish), exactly as Rosetta would store real ones.
 * Fixed text, no AI calls. Recreated fresh on every paste of the pitch link.
 */

type Six = Record<LevelKey, string>;

const QUESTION_ORIGINAL = "Before I forward this to the client: what happens to an update that still scores low after the rewrite? Does it reach them?";

const question: Six = {
  engineer:
    "What happens when both attempts score under RETRY_BELOW? Is a card with needsReview: true still shown to client-level readers, or held back until it's approved?",
  senior: "When both attempts are under 75, is the needs-review card still visible to clients, or held until approval?",
  intern: "If the explanation still scores under 75 after the rewrite, do clients still see it, or does it wait for the engineer?",
  manager: QUESTION_ORIGINAL,
  client: "Does an update that couldn't be confirmed still reach clients?",
  cmo: "If an update can't be confirmed, does it still go out to clients?",
};

const questionHinglish: Partial<Six> = {
  manager: "Client ko forward karne se pehle: agar rewrite ke baad bhi update ka score low rahe, toh kya hota hai? Kya woh client tak pahunchta hai?",
  client: "Jo update confirm nahi ho paaya, kya woh phir bhi clients tak pahunchta hai?",
  cmo: "Agar koi update confirm nahi ho paata, toh kya woh phir bhi clients tak jaata hai?",
};

const answer = (first: string): { original: string; levels: Six; hinglish: Partial<Six> } => {
  const original =
    "It's still saved, but flagged: needsReview is true, so the badge shows \"Needs engineer review\" instead of a score. Clients only see reviewed changes, so it won't reach them until I approve it. I'll review this one today.";
  return {
    original,
    levels: {
      engineer: original,
      senior: "Saved with needsReview: true and a \"Needs engineer review\" badge. Client visibility is approved-only, so it's held until the author approves it.",
      intern:
        "It's still saved, but marked \"Needs engineer review\" instead of getting a score. Clients only see changes the engineer has approved, so it waits for the engineer.",
      manager: `It doesn't reach the client. Anything that can't be confirmed is marked "Needs engineer review" and stays hidden from clients until it's been checked. ${first} is checking this one today.`,
      client: "No. An update that couldn't be confirmed is held back until the engineer checks it, so you only see confirmed work.",
      cmo: `No. Unconfirmed updates are labelled and held back from clients until the engineer checks them, so nothing unverified goes out. ${first} is checking this one today.`,
    },
    hinglish: {
      manager: `Client tak nahi jaata. Jo update confirm nahi ho paata, uspe "Needs engineer review" ka label lagta hai aur jab tak ${first} check na kar le, client ko nahi dikhta. Isko aaj hi check kiya jaayega.`,
      client: "Nahi. Jo update confirm nahi hua, woh engineer ke check karne tak roka jaata hai, toh aapko sirf confirmed kaam dikhta hai.",
      cmo: `Nahi. Unconfirmed updates pe label lagta hai aur engineer ke check karne tak woh clients tak nahi jaate, toh kuch bhi bina verify kiye bahar nahi jaata. ${first} aaj hi isko check karenge.`,
    },
  };
};

export const pitchThreadId = (cardId: string) => `t_pitch_${cardId}`.slice(0, 60);

/** Who asks: the author's manager, or the workspace owner if they have none. */
export function pitchAsker(author: User, users: User[], ownerId: string) {
  const manager = author.managerId ? users.find((u) => u.id === author.managerId) : undefined;
  if (manager) return manager;
  const owner = users.find((u) => u.id === ownerId);
  return owner && owner.id !== author.id ? owner : undefined;
}

export async function writePitchThread(o: { orgId: string; ownerId: string; cardId: string; author: User; users: User[]; now: number }) {
  const asker = pitchAsker(o.author, o.users, o.ownerId);
  if (!asker) return null;
  const first = o.author.name.split(" ")[0];
  const a = answer(first);
  const asked = new Date(o.now - 15 * 60_000).toISOString();
  const replied = new Date(o.now - 6 * 60_000).toISOString();
  const id = pitchThreadId(o.cardId);
  const ticket: Ticket = {
    id,
    orgId: o.orgId,
    fromId: asker.id,
    toId: o.author.id,
    subject: "Does a low score reach the client?",
    kind: "question",
    context: { cardId: o.cardId, nodeKey: "needs_review", technicalQuestion: question.engineer },
    status: "answered",
    messages: [
      { id: `${id}_q`, authorId: asker.id, createdAt: asked, text: QUESTION_ORIGINAL, levels: question, hinglish: questionHinglish },
      { id: `${id}_a`, authorId: o.author.id, createdAt: replied, text: a.original, levels: a.levels, hinglish: a.hinglish },
    ],
    // The asker hasn't read the answer yet, so their Questions badge lights up.
    unreadBy: [asker.id],
    createdAt: asked,
    updatedAt: replied,
  };
  await store.set("tickets", id, ticket);
  return { ticket, asker };
}
