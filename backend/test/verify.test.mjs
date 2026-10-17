/**
 * Unit tests for the verifier's code checks and evidence finder. Compiles
 * src/lib/verify.ts on the fly; no server, no AI calls.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
let out;
let v;

before(() => {
  // Inside the project, so the compiled files can find node_modules.
  out = mkdtempSync(path.join(root, ".test-build-"));
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules", "typescript", "bin", "tsc"),
      path.join(root, "src", "lib", "verify.ts"),
      "--outDir", out, "--rootDir", path.join(root, "src", "lib"),
      "--module", "commonjs", "--moduleResolution", "node", "--target", "es2022",
      "--esModuleInterop", "--skipLibCheck", "--resolveJsonModule",
    ],
    { stdio: "pipe" },
  );
  v = createRequire(import.meta.url)(path.join(out, "verify.js"));
});
after(() => rmSync(out, { recursive: true, force: true }));

const level = (summary, labels = {}) => ({ summary, analogy: "Like a queue at a chai stall.", impact: "Fewer slow pages.", labels });
const explanation = (over = {}) => ({
  title: "Retry payments",
  risk: "medium",
  files: ["src/lib/retry.js"],
  flow: {
    before: { nodes: [{ id: "b1", key: "pay" }, { id: "b2", key: "charge_once" }], edges: [["b1", "b2"]] },
    after: {
      nodes: [
        { id: "a1", key: "pay", kind: "start" },
        { id: "a2", key: "with_retry", kind: "step" },
        { id: "a3", key: "backoff", kind: "step" },
        { id: "a4", key: "done", kind: "end" },
      ],
      edges: [["a1", "a2"], ["a2", "a3"], ["a3", "a4"]],
    },
  },
  levels: {
    engineer: level("Wraps gateway.charge() in withRetry() with backoff.", { with_retry: "withRetry() loop", backoff: "sleep(200 * 2 ** attempt)", pay: "pay", done: "done", charge_once: "gateway.charge once" }),
    senior: level("Retry with exponential backoff."),
    intern: level("A loop tries the payment again."),
    manager: level("Payments that fail for a moment are tried again."),
    client: level("Fewer failed payments for your customers."),
    cmo: level("Fewer shoppers see a failed payment."),
  },
  ...over,
});
const files = [
  {
    filename: "src/lib/retry.js",
    status: "added",
    additions: 6,
    deletions: 1,
    changes: 7,
    blob_url: "https://github.com/o/r/blob/abc/src/lib/retry.js",
    patch: [
      "@@ -1,3 +1,8 @@",
      " import { gateway } from './gateway';",
      "-export const pay = (o) => gateway.charge(o);",
      "+export async function withRetry(fn) {",
      "+  for (let attempt = 1; attempt <= 3; attempt++) {",
      "+    try { return await fn(); } catch (e) {",
      "+      await sleep(200 * 2 ** attempt);",
      "+    }",
      "+  }",
      "+}",
    ].join("\n"),
  },
];
const input = { message: "Retry flaky payments", files };

describe("code checks", () => {
  test("a clean explanation passes", () => {
    assert.deepEqual(v.codeChecks(explanation(), input), []);
  });

  test("code words in the CMO version are caught", () => {
    const e = explanation();
    e.levels.cmo = level("We changed the retry config so the API endpoint calls withRetry().");
    const issues = v.codeChecks(e, input);
    assert.equal(issues.length, 1);
    assert.match(issues[0], /CMO version uses technical words/);
  });

  test("names that aren't in the diff are caught", () => {
    const e = explanation();
    e.levels.engineer = level("Adds retryQueue and flushPending() to the worker.", e.levels.engineer.labels);
    const issues = v.codeChecks(e, input);
    assert.match(issues.join(" "), /retryQueue/);
    assert.match(issues.join(" "), /flushPending/);
  });

  test("identical before and after flowcharts are caught", () => {
    const e = explanation();
    e.flow.before = structuredClone(e.flow.after);
    assert.match(v.codeChecks(e, input).join(" "), /same/);
  });
});

describe("evidence", () => {
  test("each step points at the lines behind it", () => {
    const ev = v.evidenceFor(explanation(), files);
    assert.equal(ev.with_retry.file, "src/lib/retry.js");
    assert.ok(ev.with_retry.lines.some((l) => l.kind === "+" && l.text.includes("withRetry")));
    assert.match(ev.with_retry.url, /retry\.js#L\d+$/);
    assert.ok(ev.backoff.lines.some((l) => l.text.includes("sleep(200")));
  });

  test("a removed step points at removed lines", () => {
    const ev = v.evidenceFor(explanation(), files);
    assert.ok(ev.charge_once.lines.some((l) => l.kind === "-"));
    assert.equal(ev.charge_once.url, undefined);
  });

  test("line numbers follow the hunk header", () => {
    const ev = v.evidenceFor(explanation(), files);
    assert.equal(ev.with_retry.line, 2);
  });

  test("source files beat test files", () => {
    const test = { ...files[0], filename: "test.js", blob_url: "https://github.com/o/r/blob/abc/test.js", patch: "@@ -1,1 +1,2 @@\n+test('withRetry retries', async () => withRetry(fn));" };
    const ev = v.evidenceFor(explanation(), [test, ...files]);
    assert.equal(ev.with_retry.file, "src/lib/retry.js");
  });

  test("no patch, no evidence", () => {
    assert.deepEqual(v.evidenceFor(explanation(), [{ ...files[0], patch: undefined }]), {});
  });
});

describe("score without a second model", () => {
  test("clean but unjudged tops out at medium", async () => {
    const r = await v.verify(explanation(), { ...input, diff: files[0].patch }, { useAi: false });
    assert.equal(r.checkedBy, "code");
    assert.equal(r.confidence, "medium");
    assert.ok(r.score < 85);
  });

  test("problems lower the score", async () => {
    const e = explanation();
    e.levels.cmo = level("The API endpoint now uses withRetry().");
    const r = await v.verify(e, { ...input, diff: files[0].patch }, { useAi: false });
    assert.ok(r.score < 80);
    assert.ok(r.issues.length >= 1);
  });
});
