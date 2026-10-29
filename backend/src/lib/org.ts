import { FORMER_MEMBER } from "./account";
import { ApiError } from "./http";
import { store } from "./store";
import type { Org, Role, StoredCard, StoredUser, User } from "./types";

/**
 * The reporting tree: CMO → managers → engineers, senior devs and interns.
 * Clients sit under a manager (never directly under a CMO or the owner) and
 * only read reviewed work from that manager's team.
 */

export const TECHNICAL: Role[] = ["engineer", "senior", "intern"];
export const LEADS: Role[] = ["cmo", "manager"];

export const isTechnical = (role: Role) => TECHNICAL.includes(role);
export const isLead = (role: Role) => LEADS.includes(role);

/** Who each role may add under themselves. */
export const CAN_ADD: Record<Role, Role[]> = {
  cmo: ["manager", "engineer", "senior", "intern", "client"],
  manager: ["engineer", "senior", "intern", "client"],
  engineer: [],
  senior: [],
  intern: [],
  client: [],
};

/** "an engineer", "a CMO": for messages that name a role. */
export function aRole(role: Role) {
  const label = role === "cmo" ? "CMO" : role === "senior" ? "senior developer" : role;
  return `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`;
}

/** A GitHub username maps commits to one person, so only one person in a workspace may claim it. */
export function assertGithubLoginFree(login: string | undefined, users: User[], selfId: string) {
  if (!login) return;
  const taken = users.some((u) => u.id !== selfId && u.githubLogin?.toLowerCase() === login.toLowerCase());
  if (taken) throw new ApiError("conflict", `Someone in this workspace already uses the GitHub username ${login}.`);
}

export async function orgMembers(orgId: string): Promise<StoredUser[]> {
  return store.list<StoredUser>("users", "orgId", orgId);
}

export async function requireOrg(user: User): Promise<Org> {
  const org = await store.get<Org>("orgs", user.orgId);
  if (!org) throw new ApiError("forbidden", "You're not part of a workspace.");
  return org;
}

/** Everyone below `rootId` in the tree, at any depth. */
export function descendants(rootId: string, users: User[]): User[] {
  const out: User[] = [];
  const queue = [rootId];
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    for (const u of users) {
      if (u.managerId === id && !seen.has(u.id)) {
        seen.add(u.id);
        out.push(u);
        queue.push(u.id);
      }
    }
  }
  return out;
}

/** Whose work this person sees in their feed. */
export function visibleAuthorIds(viewer: User, users: User[]): Set<string> {
  if (viewer.role === "cmo") return new Set(users.map((u) => u.id));
  if (viewer.role === "manager") return new Set([viewer.id, ...descendants(viewer.id, users).map((u) => u.id)]);
  if (viewer.role === "client") {
    // A client follows the team of the manager who added them. Only a manager's
    // team: a client left under a CMO or the owner sees nothing, never the whole workspace.
    const manager = users.find((u) => u.id === viewer.managerId);
    return manager?.role === "manager" ? visibleAuthorIds(manager, users) : new Set();
  }
  return new Set([viewer.id]);
}

/** Whose work a card counts as: its author, or whoever explained it when the author has left or is unknown. */
export const cardOwner = (card: StoredCard) =>
  card.authorUserId && card.authorUserId !== FORMER_MEMBER ? card.authorUserId : card.createdBy;

export function canSeeCard(viewer: User, card: StoredCard, users: User[]) {
  if (card.orgId !== viewer.orgId) return false;
  if (viewer.role === "client" && card.status !== "approved") return false;
  const owner = cardOwner(card);
  if (!owner) return viewer.role === "cmo";
  return visibleAuthorIds(viewer, users).has(owner) || card.createdBy === viewer.id;
}

/**
 * The engineer who wrote it (or the person who explained it) may edit and mark it reviewed.
 * Nobody may once the author has left (authorUserId is FORMER_MEMBER; older removals
 * left it empty and only renamed the author "Former member").
 */
export const canReview = (viewer: User, card: StoredCard) =>
  card.authorUserId === viewer.id ||
  (!card.authorUserId && card.author?.name !== "Former member" && card.createdBy === viewer.id);

/** Leads can message anyone they manage; anyone can message the people above them. */
export function canMessage(from: User, to: User, users: User[]) {
  if (from.orgId !== to.orgId || from.id === to.id) return false;
  if (from.role === "cmo") return true;
  if (descendants(from.id, users).some((u) => u.id === to.id)) return true;
  // Up the chain: your manager, their manager, …
  let cursor = users.find((u) => u.id === from.managerId);
  while (cursor) {
    if (cursor.id === to.id) return true;
    cursor = users.find((u) => u.id === cursor!.managerId);
  }
  return false;
}

/** The team a person belongs to: the nearest manager above them (or themselves). */
export function teamOf(user: User, users: User[]): User | null {
  if (user.role === "manager") return user;
  let cursor = users.find((u) => u.id === user.managerId);
  while (cursor && cursor.role !== "manager") cursor = users.find((u) => u.id === cursor!.managerId);
  return cursor ?? null;
}

/** The smallest public view of a person, for lists and filters. */
export const personOf = (u: User, users: User[]) => {
  const team = teamOf(u, users);
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    title: u.title,
    githubLogin: u.githubLogin,
    /** The username was proven by logging in to GitHub, not typed in. */
    githubVerified: Boolean(u.githubVerified),
    status: u.status,
    managerId: u.managerId,
    team: team ? { id: team.id, name: team.teamName || `${team.name.split(" ")[0]}'s team` } : null,
    /** Made by "Add a sample team": not a real person. */
    sample: isSamplePerson(u),
  };
};

export const isSamplePerson = (u: Pick<User, "email">) => u.email.endsWith("@demo.rosetta.dev");
export type Person = ReturnType<typeof personOf>;

/**
 * Who a lead may hand unassigned GitHub commits to: technical people they
 * manage (a CMO: anyone technical). A manager may also take them themselves.
 */
export function assignableBy(lead: User, users: User[]): User[] {
  const byName = (a: User, b: User) => a.name.localeCompare(b.name);
  if (lead.role === "cmo") return users.filter((u) => isTechnical(u.role)).sort(byName);
  const mine = new Set(descendants(lead.id, users).map((u) => u.id));
  return users.filter((u) => (mine.has(u.id) && isTechnical(u.role)) || u.id === lead.id).sort(byName);
}
