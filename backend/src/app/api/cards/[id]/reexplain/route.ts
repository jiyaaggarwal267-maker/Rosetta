import { requireUser } from "@/lib/auth";
import { publicCard } from "@/lib/cards";
import { isPitchCommit, pitchExplanation } from "@/lib/demo/pitch";
import { fetchChange } from "@/lib/github";
import type { ParsedLink } from "@/lib/github-url";
import { ApiError, json, preflight, route } from "@/lib/http";
import { explanationFor, forgetExplanation, prepare } from "@/lib/ingest";
import { canReview, canSeeCard, isLead, orgMembers } from "@/lib/org";
import { store } from "@/lib/store";
import type { StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
// Explaining, checking and one rewrite can take a couple of minutes (the Vercel Hobby maximum is 300 s).
export const maxDuration = 300;
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/cards/:id/reexplain: the author (or a lead) asks for a fresh
 * explanation, e.g. when the flowchart came out wrong. Comments and questions
 * stay; the card goes back to "not reviewed" because its text changed.
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
  if (isPitchCommit(card.repo, card.headSha)) {
    const next: StoredCard = { ...card, explanation: pitchExplanation(), status: "draft", approvedBy: undefined, approvedAt: undefined };
    await store.set("cards", id, next);
    return json({ card: publicCard(next, me, users) });
  }

  await forgetExplanation(card.repo, card.headSha);
  const prepared = prepare(await fetchChange(link));
  const explanation = await explanationFor(prepared);

  const next: StoredCard = {
    ...card,
    explanation,
    status: "draft",
    approvedBy: undefined,
    approvedAt: undefined,
    findings: prepared.findings,
  };
  await store.set("cards", id, next);
  return json({ card: publicCard(next, me, users) });
});
