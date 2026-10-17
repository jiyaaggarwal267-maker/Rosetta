import { ApiError, json, route } from "@/lib/http";
import { sendWeeklyReport } from "@/lib/mail";
import { orgMembers } from "@/lib/org";
import { store } from "@/lib/store";
import type { Org, StoredCard } from "@/lib/types";
import { reportFor } from "@/lib/weekly";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/weekly: every Monday morning (vercel.json), each workspace
 * owner gets one email with what every engineer shipped that week. Vercel
 * sends `Authorization: Bearer $CRON_SECRET`; without the secret set, it's off.
 */
export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new ApiError("unauthorized");
  const orgs = await store.all<Org>("orgs");
  let sent = 0;
  for (const org of orgs) {
    const [users, cards] = await Promise.all([orgMembers(org.id), store.list<StoredCard>("cards", "orgId", org.id)]);
    const out = await reportFor({ org, users, cards, engineerId: "all", sample: false }).catch(() => null);
    if (out?.report && (await sendWeeklyReport({ to: out.reader.email, ...out.report }))) sent++;
  }
  return json({ workspaces: orgs.length, sent });
});
