import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { json, preflight, readJson, route } from "@/lib/http";
import type { Notification } from "@/lib/notify";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const KEEP = 30;

/** GET /api/notifications → { items, unread }: the latest 30, newest first. */
export const GET = route(async (req) => {
  const me = await requireUser(req);
  const all = (await store.list<Notification>("notifications", "userId", me.id)).filter((n) => n.orgId === me.orgId);
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const items = all.slice(0, KEEP).map(({ id, kind, title, href, read, createdAt }) => ({ id, kind, title, href, read, createdAt }));
  return json({ items, unread: all.filter((n) => !n.read).length });
});

/** POST /api/notifications { ids } or { all: true }: mark as read. */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const body = await readJson(req, z.object({ ids: z.array(z.string()).max(100).optional(), all: z.boolean().optional() }));
  const mine = await store.list<Notification>("notifications", "userId", me.id);
  const wanted = new Set(body.ids ?? []);
  const toMark = mine.filter((n) => !n.read && (body.all || wanted.has(n.id)));
  await Promise.all(toMark.map((n) => store.set("notifications", n.id, { ...n, read: true })));
  // Old read ones are cleaned up as we go, so the list stays small.
  const stale = mine
    .filter((n) => n.read || toMark.some((m) => m.id === n.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(KEEP * 2);
  await Promise.all(stale.map((n) => store.remove("notifications", n.id)));
  return json({ marked: toMark.length });
});
