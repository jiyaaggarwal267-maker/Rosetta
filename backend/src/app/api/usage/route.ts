import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { ApiError, json, preflight, route } from "@/lib/http";
import { isLead } from "@/lib/org";
import { dayFor, getUsage, ORG_DAILY_LIMIT, sharedSpent, today, type Provider } from "@/lib/usage";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * GET /api/usage: today's AI calls by my workspace against its share of the
 * free daily limits (leads only). Other workspaces' counts are never shown;
 * `sharedLimitReached` only says the provider is used up for everyone.
 */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  if (!isLead(me.role)) throw new ApiError("forbidden", "Only a CMO or manager can see AI usage.");
  const side = async (p: Provider, configured: boolean) => {
    const [u, shared] = await Promise.all([getUsage(dayFor(p), me.orgId), sharedSpent(p)]);
    const used = u[p].ok + u[p].failed;
    const limit = ORG_DAILY_LIMIT[p];
    return {
      usage: {
        configured,
        used,
        limit,
        left: shared ? 0 : Math.max(0, limit - used),
        exhausted: shared || used >= limit,
        sharedLimitReached: shared,
      },
      // Each provider keeps its own day, so its tasks come from its own counter.
      tasks: u.tasksBy?.[p] ?? {},
    };
  };
  const [g, f] = await Promise.all([side("gemini", Boolean(env.geminiKey)), side("fallback", Boolean(env.fallbackKey))]);
  const tasks: Record<string, number> = { ...g.tasks };
  for (const [k, n] of Object.entries(f.tasks)) tasks[k] = (tasks[k] ?? 0) + n;
  return json({ date: today(), gemini: g.usage, fallback: f.usage, tasks });
});
