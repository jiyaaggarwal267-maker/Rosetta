import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword, requireUser, userIdFor } from "@/lib/auth";
import { cardIdFor } from "@/lib/cards";
import { DEMO_COMMENTS, DEMO_TEAM, SAMPLES } from "@/lib/demo/samples";
import { ApiError, json, preflight, route } from "@/lib/http";
import { LEVELS, type LevelKey } from "@/lib/levels";
import { isLead, orgMembers, requireOrg } from "@/lib/org";
import { notifications } from "@/lib/notify";
import { store } from "@/lib/store";
import type { Comment, StoredCard, StoredUser, Ticket, Translated } from "@/lib/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const id = (p: string) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const HOUR = 3_600_000;

/** Two versions: as written for engineers, and in plain words for everyone else. */
const twoWay = (tech: string, plain: string): Translated => ({
  text: tech,
  levels: Object.fromEntries(
    LEVELS.map(({ key }) => [key, ["engineer", "senior", "intern"].includes(key) ? tech : plain]),
  ) as Record<LevelKey, string>,
});

/**
 * POST /api/demo/seed: fills an empty workspace with a sample team, their
 * explained commits, comments and a question, so every role has something
 * to look at. The sample people share one random password, returned once in
 * the response, and their emails carry a random tag so nobody can guess them.
 */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  if (!isLead(me.role)) throw new ApiError("forbidden", "Only a CMO or manager can add the sample team.");
  const org = await requireOrg(me);
  // Any earlier sample team, whichever tag it was made with.
  const members = await orgMembers(org.id);
  if (members.some((u) => /^arjun\.[a-z0-9]+@demo\.rosetta\.dev$/.test(u.email))) {
    throw new ApiError("conflict", "The sample team is already in this workspace.");
  }
  // A GitHub username belongs to one person: a real member who already uses one keeps it.
  const taken = new Set(members.flatMap((u) => (u.githubLogin ? [u.githubLogin.toLowerCase()] : [])));
  const tag = randomBytes(8).toString("hex");
  const email = (key: string) => `${key}.${tag}@demo.rosetta.dev`;
  const password = randomBytes(12).toString("base64url");

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  const people: StoredUser[] = [];
  const make = (key: string, name: string, role: StoredUser["role"], managerId: string, extra: Partial<StoredUser> = {}) => {
    const user: StoredUser = {
      id: userIdFor(email(key)),
      orgId: org.id,
      email: email(key),
      name,
      role,
      managerId,
      focus: [],
      language: "en",
      status: "active",
      passwordHash,
      createdAt: now,
      updatedAt: now,
      ...extra,
    };
    people.push(user);
    return user;
  };

  // A CMO gets a manager in between, so the whole tree is visible.
  const lead =
    me.role === "cmo"
      ? make("neha", "Neha Kapoor", "manager", me.id, { title: "Engineering manager", teamName: "Payments" })
      : me;
  const team = Object.fromEntries(
    DEMO_TEAM.map((m) => [m.key, make(m.key, m.name, m.role, lead.id, { title: m.title, ...(taken.has(m.githubLogin.toLowerCase()) ? {} : { githubLogin: m.githubLogin }) })]),
  ) as Record<(typeof DEMO_TEAM)[number]["key"], StoredUser>;
  for (const p of people) await store.set("users", p.id, p);

  const authorOf = { "round-robin": team.arjun, caching: team.priya, retry: team.rahul };
  const when = { "round-robin": ago(2 * HOUR), caching: ago(26 * HOUR), retry: ago(5 * HOUR) };
  const cardIds: Record<string, string> = {};
  for (const s of SAMPLES) {
    const [owner, repo] = s.card.repo.split("/");
    const cardId = cardIdFor(org.id, { owner, repo, kind: "commit", sha: s.sha });
    cardIds[s.key] = cardId;
    const author = authorOf[s.key];
    const reviewed = s.key === "round-robin";
    const card: StoredCard = {
      ...s.card,
      id: cardId,
      orgId: org.id,
      author: { name: author.name, login: author.githubLogin ?? "" },
      authorUserId: author.id,
      committedAt: when[s.key],
      status: reviewed ? "approved" : "draft",
      ...(reviewed ? { approvedBy: author.name, approvedAt: ago(HOUR) } : {}),
      headSha: s.sha,
      reading: s.reading,
      findings: s.findings,
      source: "demo",
      createdAt: when[s.key],
    };
    await store.set("cards", cardId, card);
  }

  for (const c of DEMO_COMMENTS) {
    const comment: Comment = {
      id: id("m"),
      orgId: org.id,
      cardId: cardIds[c.sample],
      authorId: team[c.by].id,
      source: "rosetta",
      repo: SAMPLES[0].card.repo,
      createdAt: ago(HOUR / 2),
      text: c.text,
      levels: Object.fromEntries(LEVELS.map(({ key }, i) => [key, c.levels[i]])) as Record<LevelKey, string>,
    };
    await store.set("comments", comment.id, comment);
  }

  // A lead checking in with an intern who hasn't posted an update.
  const ticket: Ticket = {
    id: id("t"),
    orgId: org.id,
    fromId: lead.id,
    toId: team.rahul.id,
    subject: "Checkout release",
    status: "answered",
    messages: [
      { id: id("tm"), authorId: lead.id, createdAt: ago(3 * HOUR), text: "Are you working on anything for Friday's checkout release?" },
      {
        id: id("tm"),
        authorId: team.rahul.id,
        createdAt: ago(2 * HOUR),
        ...twoWay(
          "Yes, the payment retry fix (withRetry + backoff). Verifying Idempotency-Key handling in the gateway sandbox tomorrow, then it's ready for review.",
          "Yes. Rahul is finishing the fix that retries failed payments. Tomorrow he checks that nobody can be charged twice, then it's ready.",
        ),
      },
    ],
    unreadBy: [lead.id],
    createdAt: ago(3 * HOUR),
    updatedAt: ago(2 * HOUR),
  };
  await store.set("tickets", ticket.id, ticket);

  // What the lead's bell would have shown over the last day.
  for (const s of SAMPLES) {
    await notifications.change({ orgId: org.id, to: lead.id, authorName: authorOf[s.key].name, title: s.card.explanation.title, cardId: cardIds[s.key] });
  }
  await notifications.reviewed({ orgId: org.id, to: lead.id, authorName: team.arjun.name, title: SAMPLES[0].card.explanation.title, cardId: cardIds["round-robin"] });
  await notifications.reply({ orgId: org.id, to: lead.id, fromName: team.rahul.name, subject: ticket.subject, ticketId: ticket.id });

  return json(
    {
      added: people.length,
      password,
      logins: people.map((p) => ({ name: p.name, role: p.role, email: p.email })),
    },
    201,
  );
});
