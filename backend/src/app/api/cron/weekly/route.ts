import { timingSafeEqual } from "node:crypto";
import { ApiError, json, route } from "@/lib/http";
import { sendWeeklyReport } from "@/lib/mail";
import { orgMembers } from "@/lib/org";
import { store } from "@/lib/store";
import type { Org, StoredCard } from "@/lib/types";
import { reportFor } from "@/lib/weekly";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const IST_OFFSET_MS = 330 * 60_000;

/** The Monday (YYYY-MM-DD, India time) of the week `now` falls in. */
const weekOf = (now: number) => {
  const d = new Date(now + IST_OFFSET_MS);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

const authorized = (header: string | null, secret: string) => {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

/**
 * GET /api/cron/weekly: every Monday morning (vercel.json), each workspace
 * owner gets one email with what every engineer shipped that week. Vercel
 * sends `Authorization: Bearer $CRON_SECRET`; without the secret set, it's off.
 * A retried run skips workspaces that already got this week's email.
 */
export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorized(req.headers.get("authorization"), secret)) throw new ApiError("unauthorized");
  const week = weekOf(Date.now());
  const orgs = await store.all<Org>("orgs");
  let sent = 0;
  for (const org of orgs) {
    if (org.weeklyReportFor === week) continue;
    const [users, cards] = await Promise.all([orgMembers(org.id), store.list<StoredCard>("cards", "orgId", org.id)]);
    const out = await reportFor({ org, users, cards, engineerId: "all", sample: false }).catch(() => null);
    if (!out?.report) continue;
    // Claim the week before sending, on the latest copy, so an overlapping run doesn't send it twice.
    const latest = await store.get<Org>("orgs", org.id);
    if (!latest || latest.weeklyReportFor === week) continue;
    await store.set("orgs", org.id, { ...latest, weeklyReportFor: week });
    if (await sendWeeklyReport({ to: out.reader.email, ...out.report })) {
      sent++;
    } else {
      // Not sent: let a retry try again.
      const now = await store.get<Org>("orgs", org.id);
      if (now?.weeklyReportFor === week) await store.set("orgs", org.id, { ...now, weeklyReportFor: latest.weeklyReportFor });
    }
  }
  return json({ workspaces: orgs.length, sent });
});
