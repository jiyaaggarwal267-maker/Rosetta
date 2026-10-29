/**
 * The GitHub App: connecting, the push webhook, the explain queue, unassigned
 * authors and account linking. Runs against a fake GitHub on localhost (API,
 * OAuth and all), so nothing here ever reaches the real GitHub or an AI.
 */
import assert from "node:assert/strict";
import { createHash, createHmac, generateKeyPairSync, verify as rsaVerify } from "node:crypto";
import http from "node:http";
import { after, before, describe, test } from "node:test";
import { startServer } from "./server.mjs";

const APP_ID = "4242";
const SECRET = "hook-secret-for-tests";
const QSTASH_KEY = "sig_test_current";
const APP_URL = "http://app.test";
const DEMO = "code-crunchers/rosetta-demo";
const PRIVATE = "ghco/private-api";
// Two of the sample commits: they explain from their hand-written text, with no AI.
const RETRY_SHA = "e52d08a7b3c94f16d0e8a2b5c7f39d41a6e0b8c3";
const CACHE_SHA = "7c1e4b90f2a65d38e1c7b04a9f6d2e85c3b17a40";
const FAIL_SHA = "badc0ffee0000000000000000000000000000001";
const MERGE_SHA = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";

/* ------------------------------------------------------------------ */
/* A fake GitHub                                                       */
/* ------------------------------------------------------------------ */

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" });
const hits = new Map();
const hit = (key) => hits.set(key, (hits.get(key) ?? 0) + 1);

/** The App's JWT, checked the way GitHub does: RS256 with the App's public key, iss = App id, not expired. */
function appJwtOk(auth) {
  const [h, p, s] = (auth ?? "").replace(/^Bearer /, "").split(".");
  if (!h || !p || !s) return false;
  if (!rsaVerify("RSA-SHA256", Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, "base64url"))) return false;
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  const now = Date.now() / 1000;
  return String(claims.iss) === APP_ID && claims.exp > now && claims.exp - claims.iat <= 600;
}

const commitJson = (sha, parents = 1) => ({
  sha,
  html_url: `https://github.com/${DEMO}/commit/${sha}`,
  commit: { message: "A change", author: { name: "Someone", date: "2026-10-01T10:00:00Z" } },
  author: { login: "someone" },
  files: [{ filename: "src/a.js", status: "modified", additions: 3, deletions: 1, changes: 4, patch: "@@ -1 +1 @@\n-a\n+b", blob_url: "https://github.com/x" }],
  parents: Array.from({ length: parents }, (_, i) => ({ sha: `${i}`.repeat(40) })),
});

let gh;
function startGitHub() {
  return new Promise((resolve) => {
    gh = http.createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      const url = new URL(req.url, "http://x");
      const send = (status, data) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      const auth = req.headers.authorization;
      const p = url.pathname;
      hit(`${req.method} ${p}`);

      // As the App.
      let m;
      if ((m = /^\/app\/installations\/(\d+)$/.exec(p))) {
        if (!appJwtOk(auth)) return send(401, {});
        if (m[1] === "111") return send(200, { id: 111, account: { login: "ghco", type: "Organization" }, created_at: new Date().toISOString() });
        if (m[1] === "222") return send(200, { id: 222, account: { login: "someone-else" }, created_at: new Date().toISOString() });
        return send(404, {});
      }
      if ((m = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(p)) && req.method === "POST") {
        if (!appJwtOk(auth)) return send(401, {});
        return send(201, { token: `ghs_mock_${m[1]}`, expires_at: new Date(Date.now() + 3_600_000).toISOString() });
      }
      // As the installation: private repos need its token.
      if (p === "/installation/repositories") {
        if (auth !== "Bearer ghs_mock_111") return send(401, {});
        return send(200, {
          total_count: 2,
          repositories: [
            { full_name: "GhCo/Private-Api", private: true, default_branch: "main" },
            { full_name: DEMO, private: false, default_branch: "main" },
          ],
        });
      }
      if ((m = /^\/repos\/([^/]+)\/([^/]+)\/commits\/([0-9a-f]+)$/.exec(p))) {
        if (auth !== "Bearer ghs_mock_111") return send(401, {});
        const sha = m[3];
        if (sha === FAIL_SHA) return send(500, {});
        if (sha === MERGE_SHA) return send(200, commitJson(sha, 2));
        return send(200, commitJson(sha));
      }
      if (/^\/repos\/[^/]+\/[^/]+$/.test(p)) return send(200, { full_name: "x/y" });
      // As a user (OAuth).
      if (p === "/login/oauth/access_token" && req.method === "POST") {
        const { code } = JSON.parse(body || "{}");
        const token = { good: "gho_owner", "good-sam": "gho_sam" }[code];
        return send(200, token ? { access_token: token, token_type: "bearer" } : { error: "bad_verification_code" });
      }
      if (p === "/user/installations") {
        if (auth !== "Bearer gho_owner") return send(401, {});
        return send(200, { total_count: 1, installations: [{ id: 111 }] });
      }
      if (p === "/user") {
        if (auth === "Bearer gho_sam") return send(200, { login: "Sam-GH", id: 77 });
        if (auth === "Bearer gho_owner") return send(200, { login: "owner-gh", id: 1 });
        return send(401, {});
      }
      send(404, { message: "Not Found" });
    });
    gh.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${gh.address().port}`));
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

let server;
let req;
let base;
const T = {};
const ids = {};

const sign = (body, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

/** Sends a GitHub App webhook delivery, signed unless told otherwise. */
async function hook(event, payload, { signature } = {}) {
  const body = JSON.stringify(payload);
  const res = await fetch(`${base}/api/webhooks/github-app`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-GitHub-Event": event, ...(signature !== null ? { "X-Hub-Signature-256": signature ?? sign(body) } : {}) },
    body,
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data };
}

/** A GET that doesn't follow redirects: where it sends the browser. */
async function visit(path, token) {
  const res = await fetch(path.startsWith("http") ? path : `${base}${path}`, {
    redirect: "manual",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

const commit = (id, { username, email, message = "Add a thing", files = ["src/a.js"] } = {}) => ({
  id,
  message,
  timestamp: "2026-10-01T10:00:00Z",
  author: { name: username ?? "Someone", email: email ?? `${username}@users.noreply.github.com`, ...(username ? { username } : {}) },
  modified: files,
});

const push = (commits, { repo = DEMO, ref = "refs/heads/main", installation = 111, deleted = false, sender } = {}) => ({
  ref,
  deleted,
  installation: { id: installation },
  repository: { full_name: repo, default_branch: "main" },
  pusher: { name: "eve", email: "eve@ghco.test" },
  sender: sender ?? { login: "eve-gh", id: 5, type: "User" },
  commits,
});

const status = async () => (await req("GET", "/api/github/status", undefined, T.owner)).data;

async function waitFor(check, what, ms = 20_000) {
  const until = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) assert.fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

const cardFor = async (token, sha) => (await req("GET", "/api/feed?limit=100", undefined, token)).data.items.find((i) => sha.startsWith(i.ref));

/* ------------------------------------------------------------------ */

before(async () => {
  const fake = await startGitHub();
  server = await startServer({
    GITHUB_API_URL: fake,
    GITHUB_WEB_URL: fake,
    GITHUB_TOKEN: "",
    GITHUB_APP_ID: APP_ID,
    GITHUB_APP_PRIVATE_KEY: pem.replace(/\n/g, "\\n"),
    GITHUB_APP_SLUG: "rosetta-test",
    GITHUB_APP_WEBHOOK_SECRET: SECRET,
    GITHUB_APP_CLIENT_ID: "Iv1.test",
    GITHUB_APP_CLIENT_SECRET: "client-secret",
    QSTASH_CURRENT_SIGNING_KEY: QSTASH_KEY,
    CRON_SECRET: "cron-secret-for-tests",
    JOBS_BACKOFF_MS: "20",
    APP_URL,
    DEMO_REPO: DEMO,
  });
  req = server.req;
  base = server.base;

  const owner = await req("POST", "/api/auth/signup", { name: "Olga Owner", email: "olga@ghco.test", password: "pass-word-1", role: "cmo", orgName: "GhCo", acceptTerms: true });
  assert.equal(owner.status, 201);
  T.owner = owner.data.token;
  for (const [key, name, githubLogin] of [
    ["eve", "Eve Engineer", "eve-gh"],
    ["sam", "Sam Senior", undefined],
  ]) {
    const add = await req("POST", "/api/team/members", { name, email: `${key}@ghco.test`, role: "engineer", ...(githubLogin ? { githubLogin } : {}) }, T.owner);
    assert.equal(add.status, 201);
    const joined = await req("POST", "/api/auth/join", { code: add.data.inviteCode, password: `${key}-password`, acceptTerms: true });
    T[key] = joined.data.token;
    ids[key] = joined.data.user.id;
  }
});

after(() => {
  server?.stop();
  gh?.close();
});

describe("connecting the GitHub App", () => {
  test("only the owner gets an install link, with a signed state", async () => {
    assert.equal((await req("GET", "/api/github/install", undefined, T.eve)).status, 403);
    const r = await req("GET", "/api/github/install", undefined, T.owner);
    assert.equal(r.status, 200);
    assert.match(r.data.url, /\/apps\/rosetta-test\/installations\/new\?state=[\w-]+\.[\w-]+$/);
  });

  test("a tampered or missing state is refused", async () => {
    const { url } = (await req("GET", "/api/github/install", undefined, T.owner)).data;
    const state = new URL(url).searchParams.get("state");
    const [payload, sig] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url")), o: "someone-elses-org" })).toString("base64url");
    for (const s of [`${forged}.${sig}`, `${payload}.${sig.slice(0, -2)}xx`, ""]) {
      const r = await visit(`/api/github/callback?installation_id=111&setup_action=install&state=${encodeURIComponent(s)}`);
      assert.equal(r.status, 302);
      assert.equal(r.location, `${APP_URL}/app/team?github=error&reason=state`);
    }
    assert.equal((await status()).connected, false);
  });

  test("an installation the owner can't see on GitHub isn't attached", async () => {
    const { url } = (await req("GET", "/api/github/install", undefined, T.owner)).data;
    const state = new URL(url).searchParams.get("state");
    const toGitHub = await visit(`/api/github/callback?installation_id=222&setup_action=install&state=${encodeURIComponent(state)}`);
    const confirm = new URL(toGitHub.location).searchParams.get("state");
    const back = await visit(`/api/github/link/callback?code=good&state=${encodeURIComponent(confirm)}`);
    assert.equal(back.location, `${APP_URL}/app/team?github=error&reason=verify`);
    assert.equal((await status()).connected, false);
  });

  test("the owner installs, confirms on GitHub, and the workspace is connected", async () => {
    const { url } = (await req("GET", "/api/github/install", undefined, T.owner)).data;
    const state = new URL(url).searchParams.get("state");
    const toGitHub = await visit(`/api/github/callback?installation_id=111&setup_action=install&state=${encodeURIComponent(state)}`);
    assert.equal(toGitHub.status, 302);
    assert.match(toGitHub.location, /\/login\/oauth\/authorize\?client_id=Iv1\.test&state=/);
    const confirm = new URL(toGitHub.location).searchParams.get("state");
    // The confirm state isn't an account-link state, and vice versa.
    assert.equal((await visit(`/api/github/callback?installation_id=111&setup_action=install&state=${encodeURIComponent(confirm)}`)).location, `${APP_URL}/app/team?github=error&reason=state`);
    const back = await visit(`/api/github/link/callback?code=good&state=${encodeURIComponent(confirm)}`);
    assert.equal(back.location, `${APP_URL}/app/team?github=connected`);
    const s = await status();
    assert.equal(s.connected, true);
    assert.equal(s.account, "ghco");
    assert.doesNotMatch(JSON.stringify(s), /ghs_mock|BEGIN|hook-secret/);
    assert.equal((await req("GET", "/api/github/status", undefined, T.eve)).status, 403);
  });

  test("lists the installation's repos; only those can be watched", async () => {
    const r = await req("GET", "/api/github/repos", undefined, T.owner);
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.data.repos.map((x) => [x.fullName, x.private]),
      [
        [DEMO, false],
        [PRIVATE, true],
      ],
    );
    assert.equal((await req("PATCH", "/api/org", { repos: ["someone/else"] }, T.owner)).status, 400);
    assert.equal((await req("PATCH", "/api/org", { repos: [DEMO, PRIVATE] }, T.eve)).status, 403);
    const ok = await req("PATCH", "/api/org", { repos: [DEMO, PRIVATE] }, T.owner);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data.org.repos, [DEMO, PRIVATE]);
  });
});

describe("the push webhook", () => {
  test("a bad or missing signature is refused", async () => {
    assert.equal((await hook("push", push([commit(RETRY_SHA, { username: "eve-gh" })]), { signature: sign("other body") })).status, 401);
    assert.equal((await hook("push", push([]), { signature: null })).status, 401);
    assert.equal((await hook("push", push([]), { signature: sign("x", "wrong-secret") })).status, 401);
  });

  test("queues the push, skips bots, merges and lockfiles, and is explained for the author", async () => {
    const payload = push([
      commit(RETRY_SHA, { username: "eve-gh" }),
      commit("b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0", { username: "dependabot[bot]" }),
      commit("c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0", { username: "eve-gh", message: "Merge pull request #4 from ghco/feature" }),
      commit("d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0", { username: "eve-gh", files: ["package-lock.json"] }),
      commit("e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0", { username: "eve-gh", message: "style: run prettier" }),
    ]);
    const r = await hook("push", payload);
    assert.equal(r.status, 202);
    assert.deepEqual([r.data.queued, r.data.skipped, r.data.unassigned], [1, 4, 0]);

    const card = await waitFor(() => cardFor(T.owner, RETRY_SHA), "the pushed commit's card");
    assert.equal(card.source, "push");
    assert.equal(card.author?.id, ids.eve);
    const eveBell = (await req("GET", "/api/notifications", undefined, T.eve)).data.items;
    assert.ok(eveBell.some((n) => n.title === `Your push to ${DEMO} was explained — review it` && n.href === `/app/c/${card.id}`));
    const ownerBell = (await req("GET", "/api/notifications", undefined, T.owner)).data.items;
    assert.ok(ownerBell.some((n) => n.href === `/app/c/${card.id}`), "her manager hears about it");
    const s = await status();
    assert.equal(s.queue.done, 1);
    assert.equal(s.queue.skipped, 4);
    assert.equal(s.lastWebhookEvent, "push");
    assert.ok(s.lastWebhookAt);
  });

  test("a second delivery of the same push adds nothing", async () => {
    const r = await hook("push", push([commit(RETRY_SHA, { username: "eve-gh" })]));
    assert.deepEqual([r.data.queued, r.data.duplicates], [0, 1]);
  });

  test("other branches, tags, deletions and unwatched repos are ignored", async () => {
    const c = [commit("f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0", { username: "eve-gh" })];
    assert.equal((await hook("push", push(c, { ref: "refs/heads/feature" }))).data.ignored, "branch not watched");
    assert.equal((await hook("push", push(c, { ref: "refs/tags/v1.0" }))).data.ignored, "not a branch");
    assert.equal((await hook("push", push([], { deleted: true }))).data.ignored, "branch deleted");
    assert.equal((await hook("push", push(c, { repo: "ghco/unwatched" }))).data.ignored, "repository not watched");
    assert.equal((await hook("push", push(c, { installation: 999 }))).status, 202);
  });

  test("chosen branches replace the default branch; a real merge is skipped by its parents", async () => {
    assert.equal((await req("PATCH", "/api/org", { branches: { [DEMO]: ["release"] } }, T.owner)).data.org.branches[DEMO][0], "release");
    const c = [commit(MERGE_SHA, { username: "eve-gh", message: "Bring release up to date" })];
    assert.equal((await hook("push", push(c))).data.ignored, "branch not watched");
    assert.equal((await hook("push", push(c, { ref: "refs/heads/release" }))).data.queued, 1);
    await waitFor(async () => (await status()).queue.skipped === 5, "the merge to be skipped");
    assert.deepEqual((await req("PATCH", "/api/org", { branches: { [DEMO]: [] } }, T.owner)).data.org.branches, {});
  });
});

describe("unassigned authors", () => {
  test("an unknown author's commits wait, and a lead assigns them", async () => {
    const r = await hook("push", push([commit(CACHE_SHA, { username: "mystery-dev", email: "Mystery@x.test" })], { sender: { login: "mystery-dev", id: 9 } }));
    assert.equal(r.data.unassigned, 1);
    assert.equal((await req("GET", "/api/github/unassigned", undefined, T.eve)).status, 403);
    const list = (await req("GET", "/api/github/unassigned", undefined, T.owner)).data;
    const group = list.groups.find((g) => g.key === "mystery-dev");
    assert.equal(group.commits, 1);
    assert.ok(list.people.some((p) => p.id === ids.sam));
    assert.equal((await status()).queue.unassigned, 1);

    assert.equal((await req("POST", "/api/github/unassigned/assign", { login: "mystery-dev", userId: ids.sam }, T.eve)).status, 403);
    assert.equal((await req("POST", "/api/github/unassigned/assign", { login: "mystery-dev", email: "a@b.c", userId: ids.sam }, T.owner)).status, 400);
    const a = await req("POST", "/api/github/unassigned/assign", { login: "mystery-dev", userId: ids.sam }, T.owner);
    assert.equal(a.status, 200);
    assert.equal(a.data.requeued, 1);
    const card = await waitFor(() => cardFor(T.owner, CACHE_SHA), "the assigned commit's card");
    assert.equal(card.author?.id, ids.sam);
    assert.equal((await req("GET", "/api/github/unassigned", undefined, T.owner)).data.groups.length, 0);
  });
});

describe("the queue", () => {
  test("a commit GitHub keeps failing on is retried with backoff, then marked failed", async () => {
    // No username: matched to Sam by his email.
    const r = await hook("push", push([commit(FAIL_SHA, { email: "sam@ghco.test" })]));
    assert.equal(r.data.queued, 1);
    const failure = await waitFor(async () => (await status()).failures.find((f) => FAIL_SHA.startsWith(f.sha)), "the commit to fail");
    assert.equal(failure.tries, 3);
    assert.ok(failure.error);
    assert.equal(hits.get(`GET /repos/code-crunchers/rosetta-demo/commits/${FAIL_SHA}`), 3);
  });

  test("the queue runner needs a valid QStash signature or the cron secret", async () => {
    const run = (body, headers = {}) => fetch(`${base}/api/jobs/run`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body }).then((x) => x.status);
    const body = JSON.stringify({ orgId: "nobody" });
    const jwt = (claims, key = QSTASH_KEY) => {
      const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
      return `${h}.${p}.${createHmac("sha256", key).update(`${h}.${p}`).digest("base64url")}`;
    };
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: "Upstash", sub: `${base}/api/jobs/run`, exp: now + 300, nbf: now - 1, iat: now, jti: "x", body: createHash("sha256").update(body).digest("base64url") };
    assert.equal(await run(body), 401);
    assert.equal(await run(body, { "Upstash-Signature": jwt(claims, "wrong-key") }), 401);
    assert.equal(await run(JSON.stringify({ orgId: "other" }), { "Upstash-Signature": jwt(claims) }), 401, "the body is part of the signature");
    assert.equal(await run(body, { "Upstash-Signature": jwt({ ...claims, exp: now - 60 }) }), 401);
    assert.equal(await run(body, { "Upstash-Signature": jwt(claims) }), 200);
    assert.equal(await run(body, { Authorization: "Bearer cron-secret-for-tests" }), 200);
  });
});

describe("linking a GitHub account", () => {
  test("a verified account wins over a typed-in username", async () => {
    assert.equal((await req("PATCH", "/api/me", { githubLogin: "sam-gh" }, T.eve)).status, 200);
    const { url } = (await req("GET", "/api/github/link", undefined, T.sam)).data;
    const state = new URL(url).searchParams.get("state");
    assert.equal((await visit(`/api/github/link/callback?error=access_denied&state=${encodeURIComponent(state)}`)).location, `${APP_URL}/app/profile?github=error&reason=denied`);
    const back = await visit(`/api/github/link/callback?code=good-sam&state=${encodeURIComponent(state)}`);
    assert.equal(back.location, `${APP_URL}/app/profile?github=linked`);

    const sam = (await req("GET", "/api/me", undefined, T.sam)).data.user;
    assert.deepEqual([sam.githubLogin, sam.githubId, sam.githubVerified], ["Sam-GH", 77, true]);
    assert.equal((await req("GET", "/api/me", undefined, T.eve)).data.user.githubLogin, undefined, "Eve's typed-in copy is cleared");
    assert.equal((await req("PATCH", "/api/me", { githubLogin: "sam-gh" }, T.eve)).status, 409);
    assert.equal((await req("PATCH", `/api/team/members/${ids.sam}`, { githubLogin: "other" }, T.owner)).status, 409, "only Sam changes a verified username");
    await req("PATCH", "/api/me", { githubLogin: "eve-gh" }, T.eve);
  });

  test("email about pushes can be turned off", async () => {
    const r = await req("PATCH", "/api/me", { notifyEmailOnPush: false }, T.owner);
    assert.equal(r.data.user.notifyEmailOnPush, false);
  });
});

describe("installation changes", () => {
  test("repos removed from the installation stop being watched", async () => {
    const r = await hook("installation_repositories", { action: "removed", installation: { id: 111 }, repositories_removed: [{ full_name: "GhCo/Private-Api" }] });
    assert.equal(r.status, 202);
    assert.deepEqual((await status()).repos, [DEMO]);
  });

  test("uninstalling the App disconnects the workspace", async () => {
    assert.equal((await hook("installation", { action: "deleted", installation: { id: 111 } })).status, 202);
    const s = await status();
    assert.equal(s.connected, false);
    assert.equal(s.account, null);
    assert.equal((await hook("push", push([commit("ab".repeat(20), { username: "eve-gh" })]))).data, "No workspace uses this installation");
  });

  test("the owner can also disconnect in Rosetta", async () => {
    assert.equal((await req("DELETE", "/api/github/installation", undefined, T.eve)).status, 403);
    assert.equal((await req("DELETE", "/api/github/installation", undefined, T.owner)).data.connected, false);
  });
});
