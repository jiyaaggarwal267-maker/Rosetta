import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { cardIdFor, demoSampleFor, publicCard } from "@/lib/cards";
import { fetchChange, type Change } from "@/lib/github";
import { parseGitHubLink } from "@/lib/github-url";
import { ApiError, ndjson, pause, preflight, readJson, route } from "@/lib/http";
import { isPitchLink } from "@/lib/demo/pitch";
import { explainPitch } from "@/lib/demo/pitch-card";
import { explanationFor, prepare, toCard, type Stage } from "@/lib/ingest";
import { orgMembers, requireOrg } from "@/lib/org";
import { store } from "@/lib/store";
import type { StoredCard } from "@/lib/types";

export const dynamic = "force-dynamic";
// Explaining, checking and one rewrite can take a couple of minutes (the Vercel Hobby maximum is 300 s).
export const maxDuration = 300;
export const OPTIONS = preflight;

const FINDING_GAP_MS = 300;

/** POST /api/explain { url } → NDJSON: start, finding…, writing, card. */
export const POST = route(async (req) => {
  const me = await requireUser(req);
  const org = await requireOrg(me);
  const { url } = await readJson(req, z.object({ url: z.string().max(500) }));
  const link = parseGitHubLink(url);
  if (!link) throw new ApiError("invalid_url");
  const users = await orgMembers(org.id);
  const id = cardIdFor(org.id, link);
  const repo = `${link.owner}/${link.repo}`;
  // Pasting a deleted change brings it back.
  await store.remove("deleted", id);

  // The pitch commit: always explained afresh, the same way, with no GitHub or AI calls.
  if (isPitchLink(link)) return ndjson((emit) => explainPitch(id, org, me, users, emit));

  // Already explained in this workspace: replay the story, no GitHub or model calls.
  const existing = await store.get<StoredCard>("cards", id);
  if (existing) {
    return ndjson(async (emit) => {
      emit({ type: "start", title: existing.reading });
      for (const text of existing.findings) {
        await pause(FINDING_GAP_MS / 2);
        emit({ type: "finding", text });
      }
      return publicCard(existing, me, users);
    });
  }

  const demo = link.kind === "commit" ? demoSampleFor(repo, link.sha) : undefined;
  let change: Change;
  try {
    change = await fetchChange(link);
  } catch (error) {
    // Demo commits still work with no Wi-Fi or GitHub.
    if (!demo) throw error;
    change = {
      repo: demo.card.repo,
      ref: demo.card.ref,
      headSha: demo.sha,
      url: demo.card.url,
      subject: demo.reading,
      message: demo.reading,
      author: demo.card.author,
      committedAt: new Date().toISOString(),
      files: demo.card.files.map((f) => ({
        filename: f.path,
        status: "modified",
        additions: f.additions,
        deletions: f.deletions,
        changes: f.additions + f.deletions,
        blob_url: f.url,
      })),
    };
  }

  const prepared = prepare(change);
  if (demo) {
    prepared.findings = demo.findings;
    prepared.reading = demo.reading;
  }

  return ndjson(async (emit) => {
    emit({ type: "start", title: prepared.reading });
    // Checking and rewriting can start while findings are still showing: hold them until "writing".
    let writing = false;
    let pending: Stage | null = null;
    const explanationPromise = explanationFor(prepared, (stage) => {
      if (writing) emit({ type: stage });
      else pending = stage;
    });
    explanationPromise.catch(() => {});
    for (const text of prepared.findings) {
      await pause(FINDING_GAP_MS);
      emit({ type: "finding", text });
    }
    emit({ type: "writing" });
    writing = true;
    if (pending) emit({ type: pending });
    const card = toCard(id, org, prepared, await explanationPromise, users, { createdBy: me.id, source: "manual" });
    await store.set("cards", id, card);
    return publicCard(card, me, users);
  });
});
