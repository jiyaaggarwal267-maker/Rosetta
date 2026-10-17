/**
 * Starts the built backend on a spare port with nothing real attached: a
 * throwaway file store, no Firestore, no email, no AI keys. Tests can't touch
 * real data or spend the AI quota.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

export async function startServer() {
  if (!existsSync(path.join(root, ".next", "BUILD_ID"))) {
    throw new Error("No build found. Run `npm run build` first, then `npm test`.");
  }
  const port = 4300 + Math.floor(Math.random() * 500);
  const dataDir = mkdtempSync(path.join(tmpdir(), "rosetta-test-"));
  const child = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      FIREBASE_PROJECT_ID: "",
      FIREBASE_CLIENT_EMAIL: "",
      FIREBASE_PRIVATE_KEY: "",
      SMTP_USER: "",
      SMTP_PASS: "",
      GEMINI_API_KEY: "",
      FALLBACK_API_KEY: "",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));

  const base = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {}
    if (child.exitCode !== null) throw new Error(`Server exited:\n${log}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  let ip = 0;
  /** Each caller gets its own address so login rate limits don't leak between tests. */
  const client = (addr = `10.0.0.${++ip}`) => async (method, p, body, token) => {
    const res = await fetch(base + p, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": addr,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, data };
  };

  return {
    base,
    client,
    req: client(),
    log: () => log,
    stop() {
      child.kill();
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {}
    },
  };
}
