import type { RawFile } from "../github";
import type { ParsedLink } from "../github-url";
import type { Explanation, FlowGraph, Verification } from "../types";
import { codeChecks, evidenceFor } from "../verify";
import { levelsFrom } from "./samples";

/**
 * The pitch commit: one fixed link that always explains the same way, with
 * no GitHub or AI calls, so the live demo can't fail. Paste it as many times
 * as you like.
 *
 * It explains a real Rosetta feature (checking every explanation against the
 * code), and carries its own diff, so the code checks and the "code behind
 * each box" are computed for real from that diff.
 */

export const PITCH_REPO = process.env.PITCH_REPO || "vaibhav025/Rosetta-NSUT";
export const PITCH_SHA = (process.env.PITCH_SHA || "ca08ab4f0a3ecce71292c0be57ccfbd33ff6024e").toLowerCase();
export const PITCH_URL = `https://github.com/${PITCH_REPO}/commit/${PITCH_SHA}`;

export const isPitchCommit = (repo: string, sha: string) =>
  repo.toLowerCase() === PITCH_REPO.toLowerCase() && sha.length >= 7 && PITCH_SHA.startsWith(sha.toLowerCase());

export const isPitchLink = (link: ParsedLink) => link.kind === "commit" && isPitchCommit(`${link.owner}/${link.repo}`, link.sha);

const MESSAGE = "Check every explanation against the code before anyone reads it";
const AUTHOR = { name: "Vaibhav Singla", login: "vaibhav025" };
const blob = (path: string) => `https://github.com/${PITCH_REPO}/blob/${PITCH_SHA}/${path}`;

/** The diff, as GitHub would return it. */
export const PITCH_FILES: RawFile[] = [
  {
    filename: "src/lib/verify.ts",
    status: "added",
    additions: 22,
    deletions: 0,
    changes: 22,
    blob_url: blob("src/lib/verify.ts"),
    patch: [
      "@@ -0,0 +1,22 @@",
      '+import { judgeExplanation } from "./ai/tasks";',
      "+",
      "+export const RETRY_BELOW = 75;",
      "+",
      "+const CODE_WORDS = /\\b(api|endpoint|regex|json|config|env|null|function)\\b/i;",
      "+",
      "+/** Problems a reviewer can confirm by reading the code, no model needed. */",
      "+export function codeChecks(e, input) {",
      "+  const issues = [];",
      '+  for (const level of ["manager", "client", "cmo"]) {',
      "+    if (textsOf(e, level).some((t) => CODE_WORDS.test(t))) issues.push(`The ${level} version uses technical words.`);",
      "+  }",
      "+  const invented = namesIn(e).filter((name) => !input.diff.includes(name));",
      "+  if (invented.length) issues.push(`Names that aren't in the diff: ${invented.join(\", \")}`);",
      "+  return issues;",
      "+}",
      "+",
      "+export async function verify(e, input) {",
      "+  const issues = codeChecks(e, input);",
      "+  const judged = await judgeExplanation({ message: input.message, diff: input.diff, explanation: e });",
      "+  const score = Math.max(0, judged.score - Math.min(30, issues.length * 8));",
      "+  return { score, issues: [...issues, ...judged.issues] };",
      "+}",
    ].join("\n"),
  },
  {
    filename: "src/lib/ingest.ts",
    status: "modified",
    additions: 21,
    deletions: 3,
    changes: 24,
    blob_url: blob("src/lib/ingest.ts"),
    patch: [
      "@@ -52,9 +52,27 @@ export async function explanationFor(p) {",
      "   const input = { repo: change.repo, message: change.message, files, diff: diffText(kept) };",
      "-  const explanation = await explainChange(input);",
      '-  await store.set("explanations", id, explanation);',
      "-  return explanation;",
      "+  let best = await explainChange(input);",
      "+  let checked = await verify(best, check);",
      "+  let retried = false;",
      "+",
      "+  if (checked.score < RETRY_BELOW) {",
      "+    // One rewrite, with the problems as feedback.",
      "+    const second = await explainChange(input, checked.issues);",
      "+    const secondChecked = await verify(second, check);",
      "+    retried = true;",
      "+    if (secondChecked.score >= checked.score) {",
      "+      best = second;",
      "+      checked = secondChecked;",
      "+    }",
      "+  }",
      "+",
      "+  const explanation = {",
      "+    ...best,",
      "+    verification: { ...checked, retried, needsReview: checked.score < RETRY_BELOW },",
      "+    evidence: evidenceFor(best, kept),",
      "+  };",
      '+  await store.set("explanations", id, explanation);',
      "+  return explanation;",
    ].join("\n"),
  },
  {
    filename: "src/components/confidence.tsx",
    status: "added",
    additions: 7,
    deletions: 0,
    changes: 7,
    blob_url: blob("src/components/confidence.tsx"),
    patch: [
      "@@ -0,0 +1,7 @@",
      "+export function ConfidenceBadge({ v }) {",
      '+  const word = v.score >= 85 ? "High" : v.score >= 70 ? "Medium" : "Low";',
      "+  const label = v.needsReview",
      "+    ? `Needs engineer review (${v.score}/100)`",
      "+    : `Checked against the code: ${word} (${v.score}/100)`;",
      '+  return <button className="badge">{label}</button>;',
      "+}",
    ].join("\n"),
  },
];

const before: FlowGraph = {
  nodes: [
    { id: "b1", key: "commit", kind: "start" },
    { id: "b2", key: "write", kind: "step" },
    { id: "b3", key: "publish_unchecked", kind: "end" },
  ],
  edges: [
    ["b1", "b2"],
    ["b2", "b3"],
  ],
};

const after: FlowGraph = {
  groups: [{ id: "gc", key: "check_box" }],
  nodes: [
    { id: "a1", key: "commit", kind: "start" },
    { id: "a2", key: "write", kind: "step" },
    { id: "a3", key: "rules", kind: "step", group: "gc" },
    { id: "a4", key: "judge", kind: "step", group: "gc" },
    { id: "a5", key: "penalty", kind: "step", group: "gc" },
    { id: "a6", key: "low", kind: "decision" },
    { id: "a7", key: "rewrite", kind: "step" },
    { id: "a8", key: "verify_again", kind: "step" },
    { id: "a9", key: "keep_better", kind: "step" },
    { id: "a10", key: "save", kind: "data" },
    { id: "a11", key: "needs_review", kind: "decision" },
    { id: "a12", key: "badge", kind: "end" },
    { id: "a13", key: "flag", kind: "end" },
  ],
  edges: [
    ["a1", "a2"],
    ["a2", "a3"],
    ["a3", "a4"],
    ["a4", "a5"],
    ["a5", "a6"],
    ["a6", "a10", "not_low"],
    ["a6", "a7", "is_low"],
    ["a7", "a8"],
    ["a8", "a9"],
    ["a9", "a10"],
    ["a10", "a11"],
    ["a11", "a12", "clear"],
    ["a11", "a13", "review"],
  ],
};

const base: Explanation = {
  title: "Check every explanation against the code",
  risk: "medium",
  riskReason: "Changes how every explanation is saved. Nothing is deleted, but a bad check could hold good updates back.",
  files: PITCH_FILES.map((f) => f.filename),
  flow: { before, after },
  walkthrough: {
    steps: [
      { path: ["a1", "a2", "a3", "a4", "a5", "a6", "a10", "a11", "a12"] },
      { path: ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11", "a12"] },
      { path: ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11", "a13"] },
    ],
  },
  levels: levelsFrom({
    summary: [
      "Adds verify(): each new explanation goes through codeChecks() and judgeExplanation(), losing 8 points per rule issue. Below RETRY_BELOW (75) it is rewritten once with explainChange(input, checked.issues) and checked again, the higher score is kept, and it is saved with retried, needsReview and evidenceFor(best, kept).",
      "Adds a verification gate: rule checks plus a second-model score, one feedback-driven retry under 75 that keeps the better result, and a needs-review flag.",
      "Before an explanation is saved, the new verify() checks it two ways: plain rules (no code words for managers, no names that aren't in the diff) and a second AI that scores it. A low score gets one rewrite, which is checked again, and the better version is kept.",
      "Every explanation is now checked against the real code before your team reads it. Weak ones are rewritten once, and anything that still scores low is marked for the engineer to review.",
      "Every update you receive is now checked against the actual work before it reaches you, so what you read matches what was built.",
      "Every update you read is now fact-checked against the real work before it reaches you, and it shows a trust score.",
    ],
    analogy: [
      "A CI gate for prose: lint rules (codeChecks) plus a reviewer (judgeExplanation), with one auto-fix attempt that is re-checked before merging.",
      "Same shape as a CI pipeline: static checks, a reviewer, one auto-fix that is re-run, then a flag if it still fails.",
      "Like a teacher marking an answer sheet: first the quick checks, then a careful read, and one chance to correct it, which is marked again.",
      "Like an editor checking every article against the facts before it goes to print, and sending it back once if it's off.",
      "Like a quality inspector checking each parcel against the order before it's shipped.",
      "Like the brand team proofreading every ad against the product before it goes live in the Diwali sale.",
    ],
    impact: [
      "Adds 1 to 3 model calls per new commit: the judge, plus one rewrite and a second judge under 75. The score, issues, retried and needsReview go in its verification field, next to evidenceFor(best, kept), and ConfidenceBadge shows the score.",
      "Up to 3 extra model calls per new commit. Low-confidence output is never published silently; it carries a needs-review flag.",
      "Read verify.ts first: codeChecks() is plain rules, and verify() combines them with the judge's score. The retry and the keep-the-better-one step live in ingest.ts, and ConfidenceBadge shows the result.",
      "You can trust the updates you forward. Anything that still scores low is clearly marked for the engineer to review, so wrong information doesn't reach clients or leadership.",
      "Fewer surprises: what you're told was built is what was built. Anything not yet confirmed is clearly marked.",
      "You can quote these updates in campaigns and client calls with confidence. Each one shows how well it matched the real work, and anything unconfirmed is clearly marked.",
    ],
    labels: {
      commit: ["Commit arrives", "New commit", "A new commit comes in", "An engineer ships work", "New work is delivered", "New work is ready"],
      write: ["explainChange(input)", "Draft explanation", "AI writes the explanation", "The update is written", "The update is written", "The update is drafted"],
      rules: ["codeChecks(e, input)", "Rule checks", "Quick rule checks", "Quick checks", "Quick checks", "Quick proofread"],
      judge: ["judgeExplanation() scores 0-100", "Second-model score", "A second AI scores it", "A second opinion scores it", "Independent review", "Fact-checker scores it"],
      penalty: ["score - 8 per issue (max 30)", "Deduct for rule issues", "Take off points per problem", "Points off for problems", "Points off for problems", "Points off for slips"],
      low: ["checked.score < RETRY_BELOW?", "Below 75?", "Is the score under 75?", "Too low?", "Not accurate enough?", "Fails the check?"],
      rewrite: ["explainChange(input, checked.issues)", "Retry with feedback", "Rewrite using the problems", "Rewritten once", "Corrected once", "Rewritten in plain words"],
      verify_again: ["verify(second, check)", "Re-score the retry", "Check the new version", "Checked again", "Checked again", "Fact-checked again"],
      keep_better: ["secondChecked.score >= checked.score: keep it", "Keep the better one", "Keep whichever scored higher", "Keep the better version", "Keep the better version", "Keep the better version"],
      save: ["verification + evidenceFor(best, kept)", "Store score and evidence", "Save the score and the code behind it", "Saved with its score", "Saved with its score", "Saved with its receipts"],
      needs_review: ["needsReview: score < RETRY_BELOW?", "Still below 75?", "Still under 75?", "Still unsure?", "Still unconfirmed?", "Still unconfirmed?"],
      badge: ["ConfidenceBadge: score/100", "Badge: High or Medium", "Shown with a trust badge", "Reaches you with a score", "Reaches you with a score", "Reaches you with a trust score"],
      flag: ["Needs engineer review", "Flag for the author", "Marked for the engineer", "Marked: engineer to review", "Marked: not confirmed yet", "Marked: wait for the engineer"],
      check_box: ["verify() (src/lib/verify.ts)", "Verification gate", "The new checking step", "New: fact check", "New: quality check", "New: fact-check desk"],
      publish_unchecked: ["store.set(), no checks", "Saved unchecked", "Saved without checking", "Sent without checking", "Sent without checking", "Went out unchecked"],
      is_low: ["yes", "yes", "yes", "yes", "yes", "yes"],
      not_low: ["no", "no", "no", "no", "no", "no"],
      review: ["yes", "yes", "yes", "yes", "yes", "yes"],
      clear: ["no", "no", "no", "no", "no", "no"],
    },
    walkTitle: [
      "Trace 3 commits through verify()",
      "Three commits through the gate",
      "Follow 3 explanations being checked",
      "Three updates, three outcomes",
      "Three updates, three outcomes",
      "Three updates in a launch week",
    ],
    walk: [
      [
        "Commit 1: codeChecks() finds nothing and judgeExplanation() returns 92, so it is saved with evidence and ConfidenceBadge shows High (92/100).",
        "Clean pass: no rule issues, judge 92, saved and shown as High.",
        "The first explanation has no problems. The second AI gives it 92, so it's saved with the code behind each box and a High badge.",
        "The first update is clean and scores 92. It reaches you straight away.",
        "The first update passes with 92 out of 100 and reaches you straight away.",
        "Update 1 passes the fact-check with 92 and reaches you with a High trust score.",
      ],
      [
        "Commit 2: the cmo text says \"API\", so codeChecks() flags it: the judge's 72 minus 8 is 64. The rewrite with checked.issues scores 88 on verify(second, check), so it replaces the first.",
        "One rule issue takes 72 down to 64; the retry with feedback scores 88 and is kept.",
        "The CMO version used a technical word, so 72 became 64. It was rewritten with that note, checked again, and scored 88, so the new one is kept.",
        "The second update used jargon and scored 64, so it was rewritten once. The new version scores 88 and reaches you.",
        "The second update was too technical at first. It was corrected once and then passed with 88.",
        "Update 2 used jargon at first. It was rewritten once in plain words and passed with 88.",
      ],
      [
        "Commit 3: the first try scores 58, the rewrite 61. The higher one is kept, but 61 < RETRY_BELOW, so it is saved with needsReview: true and the badge says Needs engineer review.",
        "Both attempts under 75 (58, then 61): the better one is saved with the needs-review flag.",
        "This time the first version scores 58 and the rewrite 61. Rosetta keeps the 61 but marks it for the engineer, because it's still under 75.",
        "The third update still scores low after one rewrite (61), so it's marked for the engineer to review before you rely on it.",
        "The third update couldn't be confirmed yet, so it's clearly marked until the engineer checks it.",
        "Update 3 couldn't be confirmed, so it carries a clear 'wait for the engineer' label instead of reaching you as fact.",
      ],
    ],
  }),
};

/**
 * What the second model said about this explanation and diff, recorded from
 * a real run of judgeExplanation(), so the demo needs no AI quota.
 */
// Real runs on 2026-10-18 (openai/gpt-oss-120b): 95, 95, 92. Re-run after editing the text above.
export const PITCH_JUDGE = { score: 95, issues: [] as string[], checkedAt: "2026-10-18T10:00:00.000Z" };

/** The full explanation: verification from the real code checks plus the recorded judge, evidence from the diff. */
export function pitchExplanation(): Explanation {
  const check = { message: MESSAGE, files: PITCH_FILES };
  const issues = codeChecks(base, check);
  const score = Math.max(0, PITCH_JUDGE.score - Math.min(30, issues.length * 8));
  const verification: Verification = {
    score,
    confidence: score >= 85 ? "high" : score >= 70 ? "medium" : "low",
    checkedBy: "ai",
    issues: [...issues, ...PITCH_JUDGE.issues],
    retried: false,
    needsReview: score < 75,
    checkedAt: PITCH_JUDGE.checkedAt,
  };
  return { ...structuredClone(base), verification, evidence: evidenceFor(base, PITCH_FILES) };
}

export const PITCH = {
  repo: PITCH_REPO,
  sha: PITCH_SHA,
  url: PITCH_URL,
  message: MESSAGE,
  author: AUTHOR,
  reading: "“Check every explanation against the code”",
  findings: ["Found 3 changed files", "New function: `verify()`", "New function: `codeChecks()`", "Score bar: `RETRY_BELOW = 75`"],
  files: PITCH_FILES,
};

/** Ask Why answers for the pitch steps, used when no AI is available (or it's out of quota mid-demo). */
export const PITCH_NOTES: Record<string, { tech: string; plain: string }> = {
  rules: {
    tech: "codeChecks() is plain rules, no model: it flags technical words in the manager, client and CMO text, and any code name in the technical text that doesn't appear in the diff.",
    plain: "Before any AI judges it, simple rules catch the obvious slips: jargon in your version, or names of things that aren't really in the work.",
  },
  judge: {
    tech: "judgeExplanation() sends the diff and the explanation to a second model, which scores accuracy, completeness, the flowchart and reader fit out of 100 and lists concrete issues.",
    plain: "A second, independent AI reads the real work and the update side by side and scores how well they match, out of 100.",
  },
  penalty: {
    tech: "Each rule issue takes 8 points off the judge's score, capped at 30, so a fluent but jargon-heavy explanation can't score high.",
    plain: "Every slip the rules found costs points, so an update can't score well just by sounding confident.",
  },
  low: {
    tech: "If checked.score < RETRY_BELOW (75), the explanation is rewritten once; otherwise it's saved as is.",
    plain: "Anything under 75 out of 100 isn't good enough to reach you as it is, so it gets one more try.",
  },
  rewrite: {
    tech: "explainChange(input, checked.issues) runs again with the problems listed as feedback, so the model fixes exactly what was wrong.",
    plain: "The update is rewritten with a note of exactly what was wrong, like an editor's comments.",
  },
  verify_again: {
    tech: "verify(second, check) scores the rewrite with the same rules and judge, so both versions are measured the same way.",
    plain: "The new version goes through the same checks, so the comparison is fair.",
  },
  keep_better: {
    tech: "if (secondChecked.score >= checked.score) the rewrite replaces the first; otherwise the first is kept. A retry can't make it worse.",
    plain: "Whichever version scored higher is the one you read. A second try can only help.",
  },
  save: {
    tech: "The explanation is saved with verification (score, issues, retried, needsReview) and evidenceFor(best, kept), the diff lines behind each flowchart step.",
    plain: "The update is saved with its score and the proof behind each step, so anyone can check it.",
  },
  needs_review: {
    tech: "needsReview is checked.score < RETRY_BELOW after the retry; ConfidenceBadge then shows \"Needs engineer review\" instead of a score.",
    plain: "If it still can't reach 75, it's labelled clearly instead of being presented as fact.",
  },
  badge: {
    tech: "ConfidenceBadge maps the score to High (85+), Medium (70+) or Low and shows it on the card and in the feed.",
    plain: "You see a trust score on every update: High, Medium or Low, with the number.",
  },
  flag: {
    tech: "Flagged cards show \"Needs engineer review\" until the author approves them, in the feed and the weekly digest.",
    plain: "You'll see a clear 'wait for the engineer' label, and it shows up under Needs your attention in the weekly digest.",
  },
};
