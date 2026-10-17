import type { LevelKey } from "../levels";

/**
 * The live part of the pitch: one question the manager asks and one answer
 * the engineer types, each with its rewrite for every reader written in
 * advance. When either text is sent (as a question, a reply or a comment),
 * Rosetta stores these versions instead of calling the AI, so the demo shows
 * the same translation every time, even with no AI quota left.
 *
 * Matching forgives case, spacing, punctuation and a small typo or two.
 */

type Six = Record<LevelKey, string>;
export type ScriptLine = { text: string; levels: Six; hinglish: Partial<Six> };

/** The manager asks this from Ask Why on the "A second opinion scores it" step. */
export const PITCH_QUESTION: ScriptLine = {
  text: "Will this extra checking slow down how fast updates reach me?",
  levels: {
    engineer: "Does the judgeExplanation() call, plus the retry under RETRY_BELOW, add noticeable latency before a card is saved?",
    senior: "How much latency do the judge call and the occasional retry add per commit?",
    intern: "Does checking each explanation with a second AI make new explanations take longer to appear?",
    manager: "Will this extra checking slow down how fast updates reach me?",
    client: "Will updates reach me more slowly now that they're checked?",
    cmo: "Will fact-checking make updates arrive later?",
  },
  hinglish: {
    manager: "Kya is extra checking ki wajah se updates mujh tak der se pahunchenge?",
    client: "Kya check hone ki wajah se updates ab der se aayenge?",
    cmo: "Kya fact-check ki wajah se updates late aayenge?",
  },
};

/** The engineer replies with this. */
export const PITCH_ANSWER: ScriptLine = {
  text: "Only slightly. Each new commit gets one extra judgeExplanation() call, plus one rewrite if it scores under 75, so most cards are saved a few seconds later. Commits that were already explained, and the sample commits, aren't checked again, so they stay instant.",
  levels: {
    engineer:
      "Only slightly. Each new commit gets one extra judgeExplanation() call, plus one rewrite if it scores under 75, so most cards are saved a few seconds later. Commits that were already explained, and the sample commits, aren't checked again, so they stay instant.",
    senior: "Marginal: one judge call per new commit, plus one retry under 75. Already-explained and sample commits skip it.",
    intern:
      "A little. Every new commit gets one extra check by a second AI, and a rewrite only if it scores under 75, so it takes a few seconds longer. Commits that were explained before aren't checked again.",
    manager:
      "Only by a few seconds. Each new update gets one extra check, and a rewrite only when it scores low. Updates that were already explained open instantly, as before.",
    client: "Barely. New updates take a few seconds longer because each one is checked first.",
    cmo: "Hardly. Each new update takes a few seconds longer because it's fact-checked first, and anything already explained opens instantly.",
  },
  hinglish: {
    manager:
      "Bas kuch seconds ka fark. Har naye update ka ek extra check hota hai, aur rewrite sirf tab jab score low ho. Jo updates pehle explain ho chuke hain, woh pehle jaise turant khulte hain.",
    client: "Bahut thoda. Naye updates bas kuch seconds der se aate hain, kyunki har ek pehle check hota hai.",
    cmo: "Na ke barabar. Har naya update kuch seconds der se aata hai kyunki pehle uska fact-check hota hai, aur jo pehle explain ho chuka hai woh turant khulta hai.",
  },
};

const SCRIPT = [PITCH_QUESTION, PITCH_ANSWER];

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"‘’'`]/g, "")
    .replace(/[^a-z0-9_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

/** Close enough to a script line: at least 90% of the words in common, both ways. */
function matches(a: string, b: string) {
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return false;
  const sx = new Set(x);
  const sy = new Set(y);
  const common = [...sx].filter((w) => sy.has(w)).length;
  return common / sx.size >= 0.9 && common / sy.size >= 0.9;
}

/** The written-in-advance versions of this text, if it's one of the pitch lines. */
export function scriptedTranslation(text: string): { levels: Six; hinglish: Partial<Six> } | null {
  const line = SCRIPT.find((l) => matches(text, l.text));
  return line ? { levels: { ...line.levels }, hinglish: { ...line.hinglish } } : null;
}

export const isPitchQuestion = (text: string) => matches(text, PITCH_QUESTION.text);
