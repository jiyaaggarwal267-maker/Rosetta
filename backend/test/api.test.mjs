/**
 * API tests: roles, visibility, workspaces, security and edge cases.
 * Run with `npm test` (after `npm run build`). Uses an isolated server.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { startServer } from "./server.mjs";

let server;
let req;
const T = {};
const ids = {};
let seed;

const signup = (r, name, email, orgName, role = "cmo") => r("POST", "/api/auth/signup", { name, email, password: "pass-word-1", role, orgName, acceptTerms: true });
const feed = async (who, q = "") => (await req("GET", `/api/feed${q}`, undefined, T[who])).data;

before(async () => {
  server = await startServer();
  req = server.req;
  const owner = await signup(req, "Kavya Rao", "kavya@acme.test", "Acme");
  assert.equal(owner.status, 201);
  T.cmo = owner.data.token;
  seed = (await req("POST", "/api/demo/seed", undefined, T.cmo)).data;
  for (const name of ["Neha", "Arjun", "Rahul", "Priya"]) {
    const l = seed.logins.find((x) => x.name.startsWith(name));
    if (!l) continue;
    T[name.toLowerCase()] = (await req("POST", "/api/auth/login", { email: l.email, password: seed.password })).data.token;
  }
  const team = (await req("GET", "/api/team", undefined, T.cmo)).data;
  for (const m of team.members) ids[m.name.split(" ")[0].toLowerCase()] = m.id;
});

after(() => server?.stop());

describe("health", () => {
  test("reports the isolated setup", async () => {
    const h = (await req("GET", "/api/health")).data;
    assert.equal(h.store, "file");
    assert.equal(h.email, false);
  });
});

describe("workspaces and roles", () => {
  test("engineers can't create a workspace", async () => {
    assert.equal((await signup(req, "X", "x@acme.test", "Y", "engineer")).status, 400);
  });

  test("duplicate email is a conflict", async () => {
    assert.equal((await signup(req, "Kavya", "kavya@acme.test", "Other")).status, 409);
  });

  test("seeding twice is rejected", async () => {
    assert.equal((await req("POST", "/api/demo/seed", undefined, T.cmo)).status, 409);
  });

  test("CMO sees every change, at CMO level", async () => {
    const f = await feed("cmo");
    assert.equal(f.items.length, 3);
    assert.doesNotMatch(f.items.map((i) => i.summary).join(" "), /pickNextServer|servers\[/);
  });

  test("manager sees the team and filters by engineer", async () => {
    const f = await feed("neha");
    assert.equal(f.items.length, 3);
    const arjun = f.people.find((p) => p.name.startsWith("Arjun"));
    const only = await feed("neha", `?author=${arjun.id}`);
    assert.equal(only.items.length, 1);
  });

  test("engineer sees only their own work, in code terms", async () => {
    const f = await feed("arjun");
    assert.equal(f.items.length, 1);
    assert.match(f.items[0].summary, /pickNextServer/);
  });

  test("card level is locked to the reader's role", async () => {
    const id = (await feed("arjun")).items[0].id;
    const asNeha = (await req("GET", `/api/cards/${id}`, undefined, T.neha)).data;
    assert.equal(asNeha.viewer.level, "manager");
    assert.equal(asNeha.viewer.canReview, false);
    assert.equal(asNeha.viewer.canComment, false);
    assert.equal((await req("GET", `/api/cards/${id}`, undefined, T.rahul)).status, 404, "intern can't open a teammate's card");
  });

  test("only the author can mark a change reviewed", async () => {
    const id = (await feed("rahul")).items[0].id;
    assert.equal((await req("POST", "/api/approve", { cardId: id, edits: {} }, T.neha)).status, 403);
    const ok = await req("POST", "/api/approve", { cardId: id, edits: {} }, T.rahul);
    assert.equal(ok.data.card?.status, "approved");
  });

  test("managers can't comment; engineers can", async () => {
    const id = (await feed("arjun")).items[0].id;
    assert.equal((await req("POST", `/api/cards/${id}/comments`, { text: "hi" }, T.neha)).status, 403);
    assert.equal((await req("POST", `/api/cards/${id}/comments`, { text: "Load test passed." }, T.arjun)).status, 201);
    assert.equal((await req("POST", `/api/cards/${id}/comments`, { text: "x".repeat(5000) }, T.arjun)).status, 400);
  });

  test("questions go down the hierarchy and get answered", async () => {
    const t = await req("POST", "/api/tickets", { toId: ids.rahul, subject: "Status", text: "Are you working on something?" }, T.neha);
    assert.equal(t.status, 201);
    const inbox = (await req("GET", "/api/tickets", undefined, T.rahul)).data;
    assert.ok(inbox.unread >= 1);
    const reply = await req("POST", `/api/tickets/${t.data.ticket.id}`, { text: "Yes, the retry fix." }, T.rahul);
    assert.ok(reply.status < 300);
    assert.equal((await req("POST", "/api/tickets", { toId: ids.arjun, subject: "x", text: "y" }, T.rahul)).status, 403, "intern can't message sideways");
  });

  test("who can add whom", async () => {
    assert.equal((await req("POST", "/api/team/members", { name: "Z", email: "z@acme.test", role: "cmo" }, T.neha)).status, 403);
    assert.equal((await req("POST", "/api/team/members", { name: "Z", email: "z2@acme.test", role: "intern" }, T.arjun)).status, 403);
    const add = await req("POST", "/api/team/members", { name: "Sana Ali", email: "sana@acme.test", role: "engineer" }, T.neha);
    assert.equal(add.status, 201);
    assert.equal((await req("GET", `/api/invites/${add.data.inviteCode}`)).status, 200);
    const noTerms = await req("POST", "/api/auth/join", { code: add.data.inviteCode, password: "sana-password" });
    assert.equal(noTerms.status, 400);
    assert.equal(noTerms.data.code, "terms_required");
    const joined = await req("POST", "/api/auth/join", { code: add.data.inviteCode, password: "sana-password", acceptTerms: true, marketingOptIn: true });
    assert.equal(joined.status, 200);
    assert.ok(joined.data.user.termsAcceptedAt);
    assert.equal(joined.data.user.marketingOptIn, true);
    assert.equal((await req("POST", "/api/auth/join", { code: add.data.inviteCode, password: "again-again", acceptTerms: true })).status, 404, "invite is single use");
  });
});

describe("owner controls", () => {
  test("only the owner changes roles or removes people", async () => {
    assert.equal((await req("PATCH", `/api/team/members/${ids.rahul}`, { role: "engineer" }, T.neha)).status, 403);
    assert.equal((await req("DELETE", `/api/team/members/${ids.rahul}`, undefined, T.neha)).status, 403);
  });

  test("owner can't make a second CMO", async () => {
    assert.equal((await req("PATCH", `/api/team/members/${ids.rahul}`, { role: "cmo" }, T.cmo)).status, 403);
  });

  test("owner promotes an intern", async () => {
    const r = await req("PATCH", `/api/team/members/${ids.rahul}`, { role: "engineer" }, T.cmo);
    assert.equal(r.status, 200);
  });

  test("removing an invited person kills their invite", async () => {
    const inv = (await req("POST", "/api/team/members", { name: "Temp", email: "temp@acme.test", role: "intern" }, T.cmo)).data;
    const team = (await req("GET", "/api/team", undefined, T.cmo)).data;
    await req("DELETE", `/api/team/members/${team.members.find((m) => m.name === "Temp").id}`, undefined, T.cmo);
    assert.equal((await req("GET", `/api/invites/${inv.inviteCode}`)).status, 404);
  });
});

describe("AI usage", () => {
  test("leads see today's usage; others can't", async () => {
    const u = await req("GET", "/api/usage", undefined, T.cmo);
    assert.equal(u.status, 200);
    assert.equal(u.data.gemini.configured, false);
    assert.equal(typeof u.data.fallback.limit, "number");
    assert.equal((await req("GET", "/api/usage", undefined, T.arjun)).status, 403);
    assert.equal((await req("GET", "/api/usage")).status, 401);
  });
});

describe("verification and reports", () => {
  const retryCard = async () => (await feed("rahul")).items.find((i) => /retry/i.test(i.title));

  test("sample cards carry a hand-checked badge and code evidence", async () => {
    const item = await retryCard();
    assert.equal(item.confidence?.checkedBy, "sample");
    const card = (await req("GET", `/api/cards/${item.id}`, undefined, T.neha)).data;
    assert.equal(card.explanation.verification.checkedBy, "sample");
    const ev = card.explanation.evidence.temporary;
    assert.equal(ev.file, "src/lib/retry.js");
    assert.ok(ev.lines.some((l) => l.kind === "+"));
  });

  test("a reader reports a mistake to the author", async () => {
    const item = await retryCard();
    const r = await req("POST", `/api/cards/${item.id}/report`, { text: "We never retry card declines.", nodeKey: "temporary" }, T.neha);
    assert.equal(r.status, 201);
    assert.equal(r.data.ticket.kind, "report");
    const inbox = (await req("GET", "/api/tickets", undefined, T.rahul)).data;
    const got = inbox.received.find((t) => t.id === r.data.ticket.id);
    assert.ok(got, "author gets the report");
    assert.equal(got.context.nodeKey, "temporary");
    assert.equal((await retryCard()).reports, 1);
  });

  test("the author can't report their own change", async () => {
    const item = await retryCard();
    assert.equal((await req("POST", `/api/cards/${item.id}/report`, { text: "Looks wrong to me" }, T.rahul)).status, 400);
  });

  test("reports need a real message", async () => {
    const item = await retryCard();
    assert.equal((await req("POST", `/api/cards/${item.id}/report`, { text: "" }, T.neha)).status, 400);
  });
});

describe("notifications", () => {
  test("events reach the right people", async () => {
    const neha = (await req("GET", "/api/notifications", undefined, T.neha)).data;
    const kinds = new Set(neha.items.map((n) => n.kind));
    for (const k of ["change", "reviewed", "reply", "joined"]) assert.ok(kinds.has(k), `manager gets ${k}`);
    const rahul = (await req("GET", "/api/notifications", undefined, T.rahul)).data;
    assert.ok(rahul.items.some((n) => n.kind === "question"), "intern gets the question");
    assert.ok(rahul.items.some((n) => n.kind === "report" && n.href.startsWith("/app/questions/")), "author gets the report");
  });

  test("marking read", async () => {
    const before = (await req("GET", "/api/notifications", undefined, T.neha)).data;
    assert.ok(before.unread > 0);
    await req("POST", "/api/notifications", { ids: [before.items[0].id] }, T.neha);
    assert.equal((await req("GET", "/api/notifications", undefined, T.neha)).data.unread, before.unread - 1);
    await req("POST", "/api/notifications", { all: true }, T.neha);
    assert.equal((await req("GET", "/api/notifications", undefined, T.neha)).data.unread, 0);
  });

  test("nobody reads someone else's", async () => {
    const rahulIds = (await req("GET", "/api/notifications", undefined, T.rahul)).data.items.map((n) => n.id);
    await req("POST", "/api/notifications", { ids: rahulIds }, T.neha);
    assert.ok((await req("GET", "/api/notifications", undefined, T.rahul)).data.unread > 0);
  });
});

describe("feed search and filters", () => {
  test("search in the reader's own words", async () => {
    const all = await feed("cmo");
    const cmoWords = await feed("cmo", "?q=" + encodeURIComponent("bigger crowd"));
    assert.ok(cmoWords.items.length >= 1 && cmoWords.items.length < all.items.length);
    assert.equal((await feed("cmo", "?q=zzzz-nothing")).items.length, 0);
  });

  test("risk, date and repository", async () => {
    const all = await feed("cmo");
    const low = await feed("cmo", "?risk=low");
    assert.ok(low.items.every((i) => i.risk === "low"));
    assert.ok(low.items.length < all.items.length);
    assert.equal((await feed("cmo", "?days=7")).items.length, all.items.length);
    assert.deepEqual(all.repos.length, 1);
    assert.equal((await feed("cmo", `?repo=${all.repos[0]}`)).items.length, all.items.length);
  });

  test("pages", async () => {
    const first = await feed("cmo", "?limit=2");
    assert.equal(first.items.length, 2);
    assert.equal(first.page.more, true);
    const rest = await feed("cmo", "?limit=2&offset=2");
    assert.equal(rest.page.more, false);
    assert.ok(!rest.items.some((i) => first.items.some((f) => f.id === i.id)));
  });
});

describe("weekly digest", () => {
  test("leads get the week on one page", async () => {
    const d = (await req("GET", "/api/digest", undefined, T.neha)).data;
    assert.equal(d.stats.changes, 3);
    assert.match(d.headline, /3 changes this week/);
    const order = { high: 0, medium: 1, low: 2 };
    const risks = d.highlights.map((h) => order[h.risk]);
    assert.deepEqual(risks, [...risks].sort((a, b) => a - b), "riskiest first");
    assert.ok(d.attention.length >= 1);
    assert.ok(d.people.length >= 2);
    assert.doesNotMatch(d.highlights.map((h) => h.summary).join(" "), /withRetry|pickNextServer/, "manager words, not code");
  });

  test("an earlier week can be empty", async () => {
    const d = (await req("GET", "/api/digest?week=3", undefined, T.neha)).data;
    assert.equal(d.stats.changes, 0);
    assert.match(d.headline, /quiet week/);
  });

  test("engineers don't get a digest", async () => {
    assert.equal((await req("GET", "/api/digest", undefined, T.arjun)).status, 403);
  });
});

describe("account", () => {
  test("change password needs the current one", async () => {
    const r = server.client();
    const wrong = await r("POST", "/api/me/password", { current: "nope-nope", next: "new-pass-123" }, T.priya);
    assert.equal(wrong.status, 401);
    assert.equal((await r("POST", "/api/me/password", { current: seed.password, next: "short" }, T.priya)).status, 400);
    assert.equal((await r("POST", "/api/me/password", { current: seed.password, next: "new-pass-123" }, T.priya)).status, 200);
    const email = seed.logins.find((l) => l.name.startsWith("Priya")).email;
    assert.equal((await r("POST", "/api/auth/login", { email, password: seed.password })).status, 401);
    assert.equal((await r("POST", "/api/auth/login", { email, password: "new-pass-123" })).status, 200);
  });

  test("only the owner renames the workspace", async () => {
    assert.equal((await req("PATCH", "/api/org", { name: "Not yours" }, T.neha)).status, 403);
    const ok = await req("PATCH", "/api/org", { name: "Acme India" }, T.cmo);
    assert.equal(ok.data.org.name, "Acme India");
  });
});

const PITCH = "https://github.com/vaibhav025/Rosetta-NSUT/commit/ca08ab4f0a3ecce71292c0be57ccfbd33ff6024e";
const lines = (text) => String(text).trim().split("\n").map((l) => JSON.parse(l));

describe("pitch commit", () => {
  let first;

  test("always explains, the same way, as a live story", async () => {
    const a = lines((await req("POST", "/api/explain", { url: PITCH }, T.arjun)).data);
    assert.deepEqual([...new Set(a.map((l) => l.type))], ["start", "finding", "writing", "checking", "card"]);
    first = a.at(-1).card;
    assert.equal(first.explanation.title, "Check every explanation against the code");
    assert.equal(first.authorPerson?.name, "Arjun Mehta", "the engineer who pastes it is the author");
    assert.equal(first.explanation.verification.score, 95);
    assert.equal(first.explanation.verification.checkedBy, "ai");
    assert.ok(Object.keys(first.explanation.evidence).length >= 10, "code behind most boxes");

    const b = lines((await req("POST", "/api/explain", { url: PITCH }, T.arjun)).data);
    assert.ok(b.some((l) => l.type === "writing"), "second paste plays the full story again");
    const again = b.at(-1).card;
    assert.equal(again.id, first.id);
    assert.deepEqual(again.explanation.levels, first.explanation.levels);
  });

  test("a short link works too", async () => {
    const c = lines((await req("POST", "/api/explain", { url: PITCH.slice(0, -33) }, T.arjun)).data).at(-1);
    assert.equal(c.card.id, first.id);
  });

  test("the manager hears about it once, not on every rehearsal", async () => {
    const n = (await req("GET", "/api/notifications", undefined, T.neha)).data.items.filter((i) => i.href === `/app/c/${first.id}`);
    assert.equal(n.length, 1);
  });

  test("comes with a question from the manager, already answered", async () => {
    const thread = (await req("GET", "/api/tickets", undefined, T.neha)).data.sent.find((t) => t.context?.cardId === first.id);
    assert.ok(thread, "Neha asked about it");
    assert.equal(thread.status, "answered");
    assert.equal(thread.unread, true, "the answer is waiting for her");
    assert.equal(thread.context.cardTitle, "Check every explanation against the code");
  });

  test("each reader gets their own version of the question and the answer", async () => {
    const id = (await req("GET", "/api/tickets", undefined, T.neha)).data.sent.find((t) => t.context?.cardId === first.id).id;
    const asManager = (await req("GET", `/api/tickets/${id}`, undefined, T.neha)).data.ticket;
    assert.equal(asManager.stepLabel, "Still unsure?");
    assert.match(asManager.messages[0].text, /^Before I forward this to the client/, "she reads her own words");
    assert.equal(asManager.messages[0].translated, false);
    assert.match(asManager.messages[1].text, /doesn't reach the client/);
    assert.equal(asManager.messages[1].translated, true, "the engineer's answer is rewritten for her");
    assert.doesNotMatch(asManager.messages[1].text, /needsReview/);

    const asEngineer = (await req("GET", `/api/tickets/${id}`, undefined, T.arjun)).data.ticket;
    assert.match(asEngineer.messages[0].text, /RETRY_BELOW/, "the engineer reads the technical question");
    assert.equal(asEngineer.context.technicalQuestion.includes("needsReview"), true);

    await req("PATCH", "/api/me", { language: "hinglish" }, T.neha);
    const hinglish = (await req("GET", `/api/tickets/${id}`, undefined, T.neha)).data.ticket;
    assert.match(hinglish.messages[1].text, /^Client tak nahi jaata/);
    await req("PATCH", "/api/me", { language: "en" }, T.neha);
  });

  test("pasting again doesn't duplicate the thread", async () => {
    await req("POST", "/api/explain", { url: PITCH }, T.arjun);
    const threads = (await req("GET", "/api/tickets", undefined, T.neha)).data.sent.filter((t) => t.context?.cardId === first.id);
    assert.equal(threads.length, 1);
  });

  test("the live question: asked, routed to the engineer, answered, translated for each reader", async () => {
    const QUESTION = "Will this extra checking slow down how fast updates reach me?";
    const card = (await req("GET", `/api/cards/${first.id}`, undefined, T.neha)).data;
    assert.equal(card.suggestedQuestion, QUESTION, "offered as a one-tap question");

    const ask = (await req("POST", "/api/ask", { cardId: first.id, nodeKey: "judge", question: QUESTION }, T.neha)).data;
    assert.equal(ask.answerable, false, "it goes to the engineer");
    assert.equal(ask.askTo.name, "Arjun Mehta");
    assert.match(ask.technicalQuestion, /judgeExplanation\(\)/);

    const t = (await req("POST", "/api/tickets", { toId: ask.askTo.id, subject: "About “Check every explanation against the code”", text: QUESTION, context: { cardId: first.id, nodeKey: "judge", technicalQuestion: ask.technicalQuestion } }, T.neha)).data.ticket;
    const asEngineer = (await req("GET", `/api/tickets/${t.id}`, undefined, T.arjun)).data.ticket;
    assert.match(asEngineer.messages[0].text, /judgeExplanation\(\) call, plus the retry under RETRY_BELOW/, "Arjun reads it technically");

    // Typed live, with a typo and different punctuation: still matches.
    const typed = "only slightly - each new commit gets one extra judgeExplanation() call plus one rewrite if it scores under 75, so most cards are saved a few seconds later. Commits that were already explaned, and the sample commits, aren't checked again, so they stay instant";
    await req("POST", `/api/tickets/${t.id}`, { text: typed }, T.arjun);
    const asManager = (await req("GET", `/api/tickets/${t.id}`, undefined, T.neha)).data.ticket;
    assert.equal(asManager.messages[1].text, "Only by a few seconds. Each new update gets one extra check, and a rewrite only when it scores low. Updates that were already explained open instantly, as before.");
    assert.equal(asManager.messages[1].original, typed, "what Arjun actually wrote is kept");

    await req("PATCH", "/api/me", { language: "hinglish" }, T.neha);
    const hinglish = (await req("GET", `/api/tickets/${t.id}`, undefined, T.neha)).data.ticket;
    assert.match(hinglish.messages[1].text, /^Bas kuch seconds ka fark/);
    assert.match(hinglish.messages[0].text, /^Will this extra checking/, "her own question stays in her words");
    await req("PATCH", "/api/me", { language: "en" }, T.neha);
  });

  test("an unrelated question isn't mistaken for the scripted one", async () => {
    const ask = (await req("POST", "/api/ask", { cardId: first.id, nodeKey: "judge", question: "Will this delay the launch?" }, T.neha)).data;
    assert.ok(!ask.technicalQuestion?.includes("judgeExplanation() call, plus the retry"));
  });

  test("Ask Why works without AI", async () => {
    const r = await req("POST", "/api/ask", { cardId: first.id, nodeKey: "keep_better", question: "How does it pick?" }, T.neha);
    assert.equal(r.data.answerable, true);
    assert.match(r.data.answer, /higher/);
  });
});

describe("check accuracy", () => {
  const check = async (id, token) => lines((await req("POST", `/api/cards/${id}/check`, undefined, token)).data);

  test("runs every step and gives the same score each time", async () => {
    const id = lines((await req("POST", "/api/explain", { url: PITCH }, T.arjun)).data).at(-1).card.id;
    const one = await check(id, T.neha);
    const done = one.filter((l) => l.type === "step" && l.state !== "running").map((l) => l.key);
    assert.deepEqual(done, ["read", "evidence", "words", "names", "judge"]);
    assert.match(one.find((l) => l.key === "read" && l.detail).detail, /Read 3 files/);
    const two = await check(id, T.cmo);
    assert.equal(one.at(-1).card.verification.score, 95);
    assert.equal(two.at(-1).card.verification.score, 95);
  });

  test("hand-written samples say so", async () => {
    const id = (await feed("arjun")).items.find((i) => /servers/i.test(i.title)).id;
    const r = await check(id, T.neha);
    assert.equal(r.at(-1).card.verification.checkedBy, "sample");
  });

  test("other workspaces can't check", async () => {
    const other = (await signup(server.client(), "Eve", "eve@other.test", "Eve Co")).data.token;
    const id = (await feed("arjun")).items[0].id;
    assert.equal((await req("POST", `/api/cards/${id}/check`, undefined, other)).status, 404);
  });
});

describe("weekly report email", () => {
  test("leads see who it can be made for", async () => {
    const o = (await req("GET", "/api/digest/report", undefined, T.cmo)).data;
    assert.ok(o.engineers.some((e) => e.name === "Arjun Mehta"));
    assert.equal(o.owner.isMe, true);
    assert.equal(o.demo, true);
  });

  test("the sample week: four changes with flowcharts, at the owner's level", async () => {
    const arjun = (await req("GET", "/api/digest/report", undefined, T.cmo)).data.engineers.find((e) => e.name === "Arjun Mehta");
    const r = (await req("POST", "/api/digest/report", { engineerId: arjun.id, sample: true }, T.cmo)).data;
    assert.match(r.subject, /Arjun shipped 4 changes/);
    for (const t of ["Check every explanation against the code", "Retry payments", "Spread traffic", "Remember recent product lookups"]) assert.ok(r.html.includes(t), t);
    assert.ok(r.html.includes("◆"), "decision boxes");
    assert.ok(r.html.includes("How it works now"));
    assert.ok(r.html.includes("Checked against the code: High (95/100)"));
    assert.doesNotMatch(r.html, /withRetry|pickNextServer|codeChecks/, "CMO words, not code");
    assert.equal(r.sent, false);
  });

  test("a real week uses only their changes", async () => {
    const arjun = (await req("GET", "/api/digest/report", undefined, T.cmo)).data.engineers.find((e) => e.name === "Arjun Mehta");
    const r = (await req("POST", "/api/digest/report", { engineerId: arjun.id, sample: false }, T.cmo)).data;
    assert.ok(r.html.includes("Check every explanation against the code"), "the pitch commit Arjun explained");
    assert.ok(!r.html.includes("This copy uses a sample week"));
  });

  test("engineers can't send reports", async () => {
    assert.equal((await req("POST", "/api/digest/report", { engineerId: "all", sample: true }, T.arjun)).status, 403);
  });

  test("the Monday job needs its secret", async () => {
    assert.equal((await req("GET", "/api/cron/weekly")).status, 401);
  });
});

describe("deleting a change", () => {
  test("only its engineer can delete it, and pasting it again brings it back", async () => {
    const card = lines((await req("POST", "/api/explain", { url: PITCH }, T.arjun)).data).at(-1).card;
    await req("POST", `/api/cards/${card.id}/comments`, { text: "Demo note." }, T.arjun);

    assert.equal((await req("DELETE", `/api/cards/${card.id}`, undefined, T.neha)).status, 403, "the manager can't");
    assert.equal((await req("DELETE", `/api/cards/${card.id}`, undefined, T.rahul)).status, 404, "another engineer can't even see it");

    assert.equal((await req("DELETE", `/api/cards/${card.id}`, undefined, T.arjun)).status, 200);
    assert.equal((await req("GET", `/api/cards/${card.id}`, undefined, T.arjun)).status, 404);
    assert.ok(!(await feed("neha")).items.some((i) => i.id === card.id), "gone from the manager's feed");
    const comments = (await req("GET", "/api/comments", undefined, T.neha)).data.items;
    assert.ok(!comments.some((c) => c.card?.id === card.id), "its comments go too");
    const bell = (await req("GET", "/api/notifications", undefined, T.neha)).data.items;
    assert.ok(!bell.some((n) => n.href === `/app/c/${card.id}`), "and its notifications");

    const back = lines((await req("POST", "/api/explain", { url: PITCH }, T.arjun)).data).at(-1).card;
    assert.equal(back.id, card.id);
    assert.ok((await feed("arjun")).items.some((i) => i.id === card.id));
  });

  test("a deleted sample can be deleted twice without errors", async () => {
    const id = (await feed("priya")).items[0].id;
    assert.equal((await req("DELETE", `/api/cards/${id}`, undefined, T.priya)).status, 200);
    assert.equal((await req("DELETE", `/api/cards/${id}`, undefined, T.priya)).status, 404);
  });
});

describe("consent and your data", () => {
  test("no workspace without agreeing to the Terms", async () => {
    const r = await server.client()("POST", "/api/auth/signup", { name: "No Tick", email: "notick@x.test", password: "pass-word-1", role: "cmo", orgName: "X" });
    assert.equal(r.status, 400);
    assert.equal(r.data.code, "terms_required");
  });

  test("signup records what was accepted; product emails are off unless ticked", async () => {
    const me = (await req("GET", "/api/me", undefined, T.cmo)).data.user;
    assert.ok(me.termsAcceptedAt);
    assert.equal(me.termsVersion, me.privacyVersion);
    assert.equal(me.marketingOptIn, false);
    const on = await req("PATCH", "/api/me", { marketingOptIn: true }, T.cmo);
    assert.equal(on.data.user.marketingOptIn, true);
    await req("PATCH", "/api/me", { marketingOptIn: false }, T.cmo);
  });

  test("download my data: mine only, never the password hash", async () => {
    const r = await req("GET", "/api/me/export", undefined, T.arjun);
    assert.equal(r.status, 200);
    assert.equal(r.data.profile.name, "Arjun Mehta");
    assert.ok(r.data.comments.length >= 1);
    assert.ok(r.data.changesCreditedToYou.length >= 1);
    assert.doesNotMatch(JSON.stringify(r.data), /passwordHash|scrypt/);
  });

  test("delete my account: comments stay as Former member, reports move up", async () => {
    const r = server.client();
    const add = await r("POST", "/api/team/members", { name: "Leaving Lee", email: "lee@acme.test", role: "engineer", githubLogin: "lee-dev" }, T.neha);
    const lee = (await r("POST", "/api/auth/join", { code: add.data.inviteCode, password: "lee-password", acceptTerms: true })).data.token;
    const meId = (await r("GET", "/api/me", undefined, lee)).data.user.managerId;
    const t = (await r("POST", "/api/tickets", { toId: meId, subject: "Handover", text: "Note from Lee before leaving." }, lee)).data.ticket;

    assert.equal((await r("DELETE", "/api/me", { confirm: "wrong@acme.test" }, lee)).status, 400, "must type the email");
    assert.equal((await r("DELETE", "/api/me", { confirm: "lee@acme.test" }, lee)).status, 200);
    assert.equal((await r("GET", "/api/me", undefined, lee)).status, 401, "the account is gone");
    const thread = (await req("GET", `/api/tickets/${t.id}`, undefined, T.neha)).data.ticket;
    assert.equal(thread.messages[0].original, "Note from Lee before leaving.", "their message stays");
    assert.equal(thread.messages[0].author, null, "shown as a former member");
    assert.ok(!(await req("GET", "/api/team", undefined, T.neha)).data.members.some((m) => m.name === "Leaving Lee"));
  });

  test("the owner must hand over the workspace first", async () => {
    const me = (await req("GET", "/api/me", undefined, T.cmo)).data.user;
    const r = await req("DELETE", "/api/me", { confirm: me.email }, T.cmo);
    assert.equal(r.status, 409);
    assert.match(r.data.message, /Hand it to another CMO or manager/);
  });

  test("handing over the workspace, then deleting a whole workspace", async () => {
    const r = server.client();
    const boss = (await signup(r, "Owner Ola", "ola@small.test", "Small Co")).data.token;
    const add = await r("POST", "/api/team/members", { name: "Mgr Moe", email: "moe@small.test", role: "manager" }, boss);
    const moe = (await r("POST", "/api/auth/join", { code: add.data.inviteCode, password: "moe-password", acceptTerms: true })).data;
    assert.equal((await r("POST", "/api/org/owner", { userId: moe.user.id }, moe.token)).status, 403, "only the owner hands over");
    assert.equal((await r("POST", "/api/org/owner", { userId: moe.user.id }, boss)).status, 200);
    assert.equal((await r("DELETE", "/api/me", { confirm: "ola@small.test" }, boss)).status, 200, "no longer the owner, so they can leave");

    assert.equal((await r("DELETE", "/api/me", { confirm: "moe@small.test" }, moe.token)).status, 409);
    const gone = await r("DELETE", "/api/me", { confirm: "moe@small.test", deleteWorkspace: true }, moe.token);
    assert.equal(gone.data.workspaceDeleted, true);
    assert.equal((await r("POST", "/api/auth/login", { email: "moe@small.test", password: "moe-password" })).status, 401);
  });

  test("sample people and changes are marked as samples", async () => {
    const f = await feed("neha");
    assert.ok(f.items.some((i) => i.sample === true));
    assert.equal(f.people.find((p) => p.name === "Arjun Mehta").sample, true);
    assert.equal(f.people.find((p) => p.name === "Sana Ali").sample, false, "a real member who joined isn't");
  });
});

describe("security", () => {
  let other;
  before(async () => {
    other = (await signup(server.client(), "Bob", "bob@other.test", "Other")).data.token;
  });

  test("another workspace can't reach this one", async () => {
    const card = (await feed("cmo")).items[0].id;
    assert.equal((await req("GET", `/api/cards/${card}`, undefined, other)).status, 404);
    assert.ok([403, 404].includes((await req("POST", `/api/cards/${card}/comments`, { text: "x" }, other)).status));
    assert.equal((await req("POST", "/api/ask", { cardId: card, nodeKey: "pick", question: "why" }, other)).status, 404);
    assert.notEqual((await req("POST", "/api/approve", { cardId: card, edits: {} }, other)).status, 200);
    assert.equal((await req("POST", `/api/cards/${card}/reexplain`, undefined, other)).status, 404);
    assert.equal((await req("POST", `/api/cards/${card}/report`, { text: "wrong wrong" }, other)).status, 404);
    assert.equal((await req("POST", "/api/tickets", { toId: ids.neha, subject: "x", text: "y" }, other)).status, 403);
    assert.ok([403, 404].includes((await req("DELETE", `/api/team/members/${ids.neha}`, undefined, other)).status));
  });

  test("everything private needs a login", async () => {
    for (const [m, p] of [
      ["GET", "/api/feed"],
      ["GET", "/api/team"],
      ["GET", "/api/me"],
      ["GET", "/api/tickets"],
      ["GET", "/api/comments"],
      ["POST", "/api/explain"],
      ["POST", "/api/sync"],
      ["PATCH", "/api/org"],
    ]) {
      assert.equal((await req(m, p, m === "GET" ? undefined : {})).status, 401, `${m} ${p}`);
    }
  });

  test("a forged token is refused", async () => {
    assert.equal((await req("GET", "/api/me", undefined, `${T.cmo.slice(0, -4)}AAAA`)).status, 401);
  });

  test("bad input is a clear 400", async () => {
    assert.equal((await req("POST", "/api/auth/signup", "{oops")).status, 400);
    const r = await req("POST", "/api/explain", { url: "hello" }, T.cmo);
    assert.equal(r.status, 400);
    assert.equal(r.data.code, "invalid_url");
  });

  test("password guessing gets rate limited", async () => {
    const attacker = server.client("10.9.9.9");
    let status = 0;
    for (let i = 0; i < 12 && status !== 429; i++) {
      status = (await attacker("POST", "/api/auth/login", { email: "kavya@acme.test", password: `wrong-${i}` })).status;
    }
    assert.equal(status, 429);
    // The real owner, from their own address, is locked out of this account too
    // (account limit) until the window passes. That's the trade-off we accept.
  });

  test("password reset never reveals whether an email exists", async () => {
    const a = await server.client()("POST", "/api/auth/forgot", { email: "nobody@nowhere.test" });
    const b = await server.client()("POST", "/api/auth/forgot", { email: "neha@acme.test" });
    assert.equal(a.status, b.status);
  });
});
