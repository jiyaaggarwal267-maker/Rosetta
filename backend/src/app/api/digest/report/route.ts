import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ApiError, json, preflight, readJson, route } from "@/lib/http";
import { mailConfigured, sendWeeklyReport } from "@/lib/mail";
import { isLead, isTechnical, orgMembers, requireOrg, visibleAuthorIds } from "@/lib/org";
import { store } from "@/lib/store";
import type { StoredCard } from "@/lib/types";
import { realItems, reportFor } from "@/lib/weekly";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** GET /api/digest/report → who a report can be made for, and who receives it. */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  if (!isLead(me.role)) throw new ApiError("forbidden", "Weekly reports are for the CMO and managers.");
  const org = await requireOrg(me);
  const [users, cards] = await Promise.all([orgMembers(org.id), store.list<StoredCard>("cards", "orgId", org.id)]);
  const visible = visibleAuthorIds(me, users);
  const owner = users.find((u) => u.id === org.ownerId);
  return json({
    engineers: users
      .filter((u) => isTechnical(u.role) && visible.has(u.id) && u.status === "active")
      .map((u) => ({ id: u.id, name: u.name, title: u.title ?? "", changes: realItems(cards, u.id).length })),
    owner: owner ? { name: owner.name, isMe: owner.id === me.id } : null,
    email: mailConfigured(),
    // Seeded workspaces start with the sample week, which shows the report at its fullest.
    demo: cards.some((c) => c.source === "demo"),
  });
});

const body = z.object({
  engineerId: z.string().min(1).max(80),
  sample: z.boolean().default(false),
  send: z.boolean().default(false),
});

/** POST /api/digest/report { engineerId | "all", sample, send } → { subject, html, sent }: preview, and optionally email the owner. */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  if (!isLead(me.role)) throw new ApiError("forbidden", "Weekly reports are for the CMO and managers.");
  const input = await readJson(req, body);
  const org = await requireOrg(me);
  const [users, cards] = await Promise.all([orgMembers(org.id), store.list<StoredCard>("cards", "orgId", org.id)]);
  const visible = visibleAuthorIds(me, users);
  if (input.engineerId !== "all" && !visible.has(input.engineerId)) throw new ApiError("not_found");
  // A manager's "all" means their own people only.
  const scoped = users.filter((u) => !isTechnical(u.role) || visible.has(u.id));

  const out = await reportFor({ org, users: scoped, cards, engineerId: input.engineerId, sample: input.sample });
  if (!out) throw new ApiError("not_found", "This workspace has no owner to send the report to.");
  if (!out.report) throw new ApiError("bad_request", "No changes from them in the last 7 days. Turn on the sample week to see a full report.");

  const sent = input.send ? await sendWeeklyReport({ to: out.reader.email, ...out.report }) : false;
  return json({ subject: out.report.subject, html: out.report.html, sent, to: out.reader.name });
});
