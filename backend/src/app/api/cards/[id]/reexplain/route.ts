import { requireUser } from "@/lib/auth";
import { publicCard } from "@/lib/cards";
import { isPitchCommit, pitchExplanation } from "@/lib/demo/pitch";
import { fetchChange } from "@/lib/github";
import type { ParsedLink } from "@/lib/github-url";
import { ApiError, json, preflight, route } from "@/lib/http";
import { explanationFor, forgetExplanation, prepare } from "@/lib/ingest";
import { canReview, canSeeCard, isLead, orgMembers } from "@/lib/org";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import type { StoredCard, User } from "@/lib/types";

export const dynamic = "force-dynamic";
// Explaining, checking and one rewrite can take a couple of minutes (the Vercel Hobby maximum is 300 s).
export const maxDuration = 300;
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/cards/:id/reexplain: the author (or a lead) asks for a fresh
 * explanation, e.g. when the flowchart came out wrong. Comments and questions
 * stay; the card goes back to "not reviewed" because its text changed.
 * → { card, reviewReset }
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const me = await requireUser(req);
  const users = await orgMembers(me.orgId);
  const card = await store.get<StoredCard>("cards", id);
  if (!card || !canSeeCard(me, card, users)) throw new ApiError("not_found");
  if (!canReview(me, card) && !isLead(me.role)) {
    throw new ApiError("forbidden", "Only the author or a lead can ask for a new explanation.");
  }

  const [owner, repo] = card.repo.split("/");
  const link: ParsedLink =
    card.ref.kind === "commit" ? { owner, repo, kind: "commit", sha: card.ref.sha } : { owner, repo, kind: "pull", number: card.ref.number };

  // The pitch commit always explains the same way, without GitHub.
  if (isPitchCommit(card.repo, card.headSha)) return json(await save(id, card, { explanation: pitchExplanation() }, me, users));

  limit(`reexplain:${me.id}`, 10, 60 * 60_000);
  await forgetExplanation(card.repo, card.headSha);
  const prepared = prepare(await fetchChange(link, card.orgId));
  const explanation = await explanationFor(prepared, undefined, card.orgId);
  return json(await save(id, card, { explanation, findings: prepared.findings }, me, users));
});

/**
 * Writes the new explanation over the latest stored card (not the one read
 * before the slow rewrite), so nothing else changed meanwhile is lost. If the
 * engineer reviewed or edited it while this ran, their work wins and the new
 * text is dropped. `reviewReset` tells the app the card went back to "not reviewed".
 */
async function save(id: string, before: StoredCard, fresh: Pick<StoredCard, "explanation"> & Partial<Pick<StoredCard, "findings">>, me: User, users: User[]) {
  const latest = await store.get<StoredCard>("cards", id);
  if (!latest) throw new ApiError("not_found");
  const edited = latest.explanation.title !== before.explanation.title || JSON.stringify(latest.explanation.levels) !== JSON.stringify(before.explanation.levels);
  if (edited || latest.status !== before.status || latest.approvedAt !== before.approvedAt) {
    throw new ApiError("conflict", "This change was reviewed or edited while the new explanation was being written. Reload it and try again.");
  }
  const next: StoredCard = { ...latest, ...fresh, status: "draft", approvedBy: undefined, approvedAt: undefined };
  await store.set("cards", id, next);
  return { card: publicCard(next, me, users), reviewReset: latest.status === "approved" };
}
