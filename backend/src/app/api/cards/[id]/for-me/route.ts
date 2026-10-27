import { createHash } from "node:crypto";
import { aiConfigured } from "@/lib/ai/provider";
import { personalNote } from "@/lib/ai/tasks";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, route } from "@/lib/http";
import { canSeeCard, orgMembers } from "@/lib/org";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import type { StoredCard, User } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };
type Note = { text: string; profileHash: string; explanationHash: string };

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
const profileHash = (u: User) => hash([u.role, u.title, u.focus, u.language, u.name]);

/** GET /api/cards/:id/for-me → { note }: two sentences written for this reader, cached per profile. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const card = await store.get<StoredCard>("cards", id);
  if (!card || !canSeeCard(me, card, await orgMembers(me.orgId))) throw new ApiError("not_found");

  const noteId = `${id}_${me.id}`;
  const keys = { profileHash: profileHash(me), explanationHash: hash(card.explanation.levels[me.role]) };
  const cached = await store.get<Note>("notes", noteId);
  if (cached && cached.profileHash === keys.profileHash && cached.explanationHash === keys.explanationHash) {
    return json({ note: cached.text });
  }
  let note: string | null = null;
  if (aiConfigured()) {
    // Only a fresh note costs a model call.
    limit(`for-me:${me.id}`, 60, 60 * 60_000);
    note = await personalNote(card.explanation, me).catch(() => null);
    if (note) await store.set("notes", noteId, { text: note, ...keys } satisfies Note);
  }
  return json({ note });
});
