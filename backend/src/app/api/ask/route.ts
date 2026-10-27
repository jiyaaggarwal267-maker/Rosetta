import { z } from "zod";
import { aiConfigured } from "@/lib/ai/provider";
import { answerQuestion } from "@/lib/ai/tasks";
import { requireUser } from "@/lib/auth";
import { demoSampleFor } from "@/lib/cards";
import { isPitchCommit, PITCH_FILES, PITCH_NOTES } from "@/lib/demo/pitch";
import { isPitchQuestion, PITCH_QUESTION } from "@/lib/demo/pitch-script";
import { diffText, trimFiles } from "@/lib/diff";
import { env } from "@/lib/env";
import { filesFor } from "@/lib/github";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { canSeeCard, cardOwner, isTechnical, orgMembers, personOf } from "@/lib/org";
import { limit } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import { NODE_KEY, rememberTechnicalQuestion, stepLabelOf } from "@/lib/tickets";
import type { StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const body = z.object({
  cardId: z.string(),
  nodeKey: z.string().regex(NODE_KEY),
  question: z.string().trim().min(1).max(500),
});

/** Questions about plans and people can't be answered from code. */
const NEEDS_ENGINEER = /\b(delay|launch|deadline|timeline|when|date|ship|release|eta|schedule|cost|budget|ready|working on)\b/i;

/**
 * POST /api/ask { cardId, nodeKey, question }
 * Answers from the diff at the asker's own level. When the code can't
 * answer, returns a technical rewrite and who to ask; the app then opens a
 * question (ticket) to that engineer.
 */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  // Each question can cost a model call: a person gets a fair number, not unlimited.
  limit(`ask:${me.id}`, 20, 10 * 60_000);
  const input = await readJson(req, body);
  const card = await store.get<StoredCard>("cards", input.cardId);
  const users = await orgMembers(me.orgId);
  if (!card || !canSeeCard(me, card, users)) throw new ApiError("not_found");

  const authorUser = users.find((u) => u.id === cardOwner(card));
  const askTo = authorUser && authorUser.id !== me.id ? personOf(authorUser, users) : null;
  const step = stepLabelOf(card, "engineer", input.nodeKey) ?? input.nodeKey;

  const pitch = isPitchCommit(card.repo, card.headSha);
  let result: { answerable: boolean; answer: string; technical_question: string } | null = null;
  if (pitch && isPitchQuestion(input.question)) {
    result = { answerable: false, answer: "", technical_question: PITCH_QUESTION.levels.engineer };
  } else if (aiConfigured()) {
    const files = pitch ? PITCH_FILES : await filesFor(card).catch(() => []);
    try {
      result = await answerQuestion({
        explanation: card.explanation,
        level: me.role,
        nodeKey: input.nodeKey,
        question: input.question,
        orgId: me.orgId,
        diff: files.length ? diffText(trimFiles(files, env.maxDiffLines).files) : "(diff unavailable; use the explanation)",
      });
    } catch (error) {
      // Out of quota mid-demo: the written notes below still answer the sample and pitch commits.
      if (!pitch && !demoSampleFor(card.repo, card.headSha)) throw error;
    }
  }
  if (!result) {
    // No model: the demo commits still answer from their written notes.
    const notes = pitch ? PITCH_NOTES : demoSampleFor(card.repo, card.headSha)?.notes;
    const note = notes && Object.hasOwn(notes, input.nodeKey) ? notes[input.nodeKey] : undefined;
    if (NEEDS_ENGINEER.test(input.question) || !note) {
      result = {
        answerable: false,
        answer: "",
        technical_question: `About the "${step}" step: ${input.question.trim()} Does this change affect the release plan, and is any follow-up needed before it ships?`,
      };
    } else {
      result = { answerable: true, answer: isTechnical(me.role) ? note.tech : note.plain, technical_question: "" };
    }
  }

  // Kept server-side: a ticket opened from this answer carries Rosetta's own rewrite, not the sender's copy.
  if (!result.answerable && result.technical_question) await rememberTechnicalQuestion(me.id, card.id, input.nodeKey, result.technical_question);

  return json(
    result.answerable
      ? { answerable: true, answer: result.answer }
      : { answerable: false, technicalQuestion: result.technical_question, askTo },
  );
});
