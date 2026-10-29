import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, route } from "@/lib/http";
import { aliasKey, type Job } from "@/lib/jobs";
import { assignableBy, isLead, orgMembers, requireOrg } from "@/lib/org";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/github/unassigned → { groups, people }
 * Pushed commits whose author matched nobody in the workspace, grouped by
 * GitHub username (or commit email when there's none). Nothing is spent on
 * them until a lead says whose they are (POST /api/github/unassigned/assign).
 * `people` are the members this lead may assign them to.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  if (!isLead(me.role)) throw new ApiError("forbidden", "Only a CMO or manager can assign GitHub commits.");
  const org = await requireOrg(me);
  const [jobs, users] = await Promise.all([store.list<Job>("jobs", "orgId", org.id), orgMembers(org.id)]);

  type Group = {
    key: string;
    login: string | null;
    email: string | null;
    names: string[];
    commits: number;
    repos: string[];
    latestAt: string;
    recent: { repo: string; sha: string; subject: string; committedAt: string }[];
  };
  const groups = new Map<string, Group>();
  for (const j of jobs.filter((x) => x.status === "unassigned").sort((a, b) => b.committedAt.localeCompare(a.committedAt))) {
    const key = aliasKey(j.author);
    if (!key) continue;
    const g =
      groups.get(key) ??
      ({ key, login: j.author.login ?? null, email: j.author.login ? null : (j.author.email ?? null), names: [], commits: 0, repos: [], latestAt: j.committedAt, recent: [] } as Group);
    g.commits++;
    if (j.author.name && !g.names.includes(j.author.name)) g.names.push(j.author.name);
    if (!g.repos.includes(j.repo)) g.repos.push(j.repo);
    if (g.recent.length < 5) g.recent.push({ repo: j.repo, sha: j.sha.slice(0, 7), subject: j.subject ?? "", committedAt: j.committedAt });
    groups.set(key, g);
  }

  return json({
    groups: [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt)),
    people: assignableBy(me, users).map((u) => ({ id: u.id, name: u.name, role: u.role, githubLogin: u.githubLogin ?? null })),
  });
});
