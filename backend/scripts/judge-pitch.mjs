#!/usr/bin/env node
/**
 * Re-scores the pitch explanation with the real judge model, so PITCH_JUDGE
 * in src/lib/demo/pitch.ts stays an honest, recorded result. Run it after
 * editing the pitch text, and copy the score in if it changed.
 *
 *   npm run pitch:judge          (uses FALLBACK_API_KEY / GEMINI_API_KEY from .env.local)
 *
 * Uses a throwaway store, so it never touches Firestore or .data.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = mkdtempSync(path.join(root, ".test-build-"));
process.env.FIREBASE_PROJECT_ID = "";
process.env.FIREBASE_CLIENT_EMAIL = "";
process.env.FIREBASE_PRIVATE_KEY = "";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "rosetta-judge-"));
process.loadEnvFile(path.join(root, ".env.local"));

try {
  execFileSync(process.execPath, [
    path.join(root, "node_modules", "typescript", "bin", "tsc"),
    path.join(root, "src", "lib", "demo", "pitch.ts"),
    path.join(root, "src", "lib", "diff.ts"),
    "--outDir", out, "--rootDir", path.join(root, "src", "lib"),
    "--module", "commonjs", "--moduleResolution", "node", "--target", "es2022",
    "--esModuleInterop", "--skipLibCheck", "--resolveJsonModule",
  ]);
  const require = createRequire(import.meta.url);
  const { pitchExplanation, PITCH, PITCH_FILES, PITCH_JUDGE } = require(path.join(out, "demo", "pitch.js"));
  const { judgeExplanation } = require(path.join(out, "ai", "tasks.js"));
  const { codeChecks } = require(path.join(out, "verify.js"));
  const { diffText } = require(path.join(out, "diff.js"));

  const e = pitchExplanation();
  const issues = codeChecks(e, { message: PITCH.message, files: PITCH_FILES });
  console.log(`Code checks: ${issues.length ? issues.join(" | ") : "no problems"}`);
  console.log(`Steps with code evidence: ${Object.keys(e.evidence).length}`);
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const j = await judgeExplanation({ message: PITCH.message, diff: diffText(PITCH_FILES), explanation: e });
    runs.push(j.score);
    console.log(`Judge run ${i + 1}: ${j.score}${j.issues.length ? `  (${j.issues.join(" | ")})` : ""}`);
  }
  const median = [...runs].sort((a, b) => a - b)[1];
  console.log(`\nMedian ${median}; recorded PITCH_JUDGE.score is ${PITCH_JUDGE.score}.${median !== PITCH_JUDGE.score ? " Update it in src/lib/demo/pitch.ts." : ""}`);
} finally {
  rmSync(out, { recursive: true, force: true });
  rmSync(process.env.DATA_DIR, { recursive: true, force: true });
}
