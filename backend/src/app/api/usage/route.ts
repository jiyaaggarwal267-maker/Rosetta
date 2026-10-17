import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { ApiError, json, preflight, route } from "@/lib/http";
import { isLead } from "@/lib/org";
import { DAILY_LIMIT, getUsage } from "@/lib/usage";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** GET /api/usage: today's AI calls against the free daily limits (leads only). */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  if (!isLead(me.role)) throw new ApiError("forbidden", "Only a CMO or manager can see AI usage.");
  const u = await getUsage();
  const side = (p: "gemini" | "fallback", configured: boolean) => {
    const used = u[p].ok + u[p].failed;
    return {
      configured,
      used,
      limit: DAILY_LIMIT[p],
      left: u.exhausted?.[p] ? 0 : Math.max(0, DAILY_LIMIT[p] - used),
      exhausted: Boolean(u.exhausted?.[p]),
    };
  };
  return json({
    date: u.date,
    gemini: side("gemini", Boolean(env.geminiKey)),
    fallback: side("fallback", Boolean(env.fallbackKey)),
    tasks: u.tasks,
  });
});
