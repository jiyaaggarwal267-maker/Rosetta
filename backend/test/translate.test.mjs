/**
 * Unit tests for message rewriting: the fact guard and what each reader sees.
 * Compiles src/lib/translate.ts on the fly; no AI calls.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
let out;
let t;

before(() => {
  out = mkdtempSync(path.join(root, ".test-build-"));
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules", "typescript", "bin", "tsc"),
      path.join(root, "src", "lib", "translate.ts"),
      "--outDir", out, "--rootDir", path.join(root, "src", "lib"),
      "--module", "commonjs", "--moduleResolution", "node", "--target", "es2022",
      "--esModuleInterop", "--skipLibCheck", "--resolveJsonModule",
    ],
    { stdio: "pipe" },
  );
  t = createRequire(import.meta.url)(path.join(out, "translate.js"));
});
after(() => rmSync(out, { recursive: true, force: true }));

describe("fact guard", () => {
  test("keeps rewrites that add no numbers", () => {
    const r = t.guard("Load test passed at 3x traffic.", { manager: "It held up under 3 times the usual traffic.", cmo: "The site stays fast on big days." });
    assert.deepEqual(Object.keys(r).sort(), ["cmo", "manager"]);
  });

  test("drops a rewrite that invents a number", () => {
    const r = t.guard("Load test passed.", { manager: "It handles 10,000 users now.", cmo: "The site stays fast." });
    assert.deepEqual(Object.keys(r), ["cmo"]);
  });

  test("an invented date counts too", () => {
    const r = t.guard("Fix ships soon.", { client: "The fix ships on 12 March." });
    assert.deepEqual(r, {});
  });
});

describe("what a reader sees", () => {
  const msg = {
    text: "Added withRetry with backoff.",
    levels: { engineer: "Added withRetry with backoff.", manager: "Failed payments are tried again.", client: "Fewer failed payments." },
    hinglish: { manager: "Failed payments ab dobara try hote hain." },
  };

  test("their own level", () => {
    const d = t.display(msg, "manager");
    assert.equal(d.text, "Failed payments are tried again.");
    assert.equal(d.translated, true);
    assert.equal(d.original, msg.text);
  });

  test("Hinglish when they chose it", () => {
    assert.equal(t.display(msg, "manager", "hinglish").text, "Failed payments ab dobara try hote hain.");
  });

  test("Hinglish missing: falls back to English at their level", () => {
    assert.equal(t.display(msg, "client", "hinglish").text, "Fewer failed payments.");
  });

  test("a level the guard dropped borrows the nearest one, simpler side first", () => {
    assert.equal(t.display(msg, "cmo").text, "Fewer failed payments.");
  });

  test("no versions at all: the original", () => {
    const d = t.display({ text: "hello" }, "cmo");
    assert.equal(d.text, "hello");
    assert.equal(d.translated, false);
  });
});
