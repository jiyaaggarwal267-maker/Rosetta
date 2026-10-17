import { env, isProduction } from "@/lib/env";
import { json, preflight, route } from "@/lib/http";
import { mailConfigured } from "@/lib/mail";
import { storeKind } from "@/lib/store";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Setup problems that break a deployed server, in plain words. Never reveals a value. */
function warnings() {
  const out: string[] = [];
  if (!isProduction) return out;
  if (storeKind === "file" && process.env.VERCEL) {
    out.push("Data is being saved to a temporary file and will be lost. Set the three FIREBASE_* variables.");
  }
  if (!env.geminiKey && !env.fallbackKey) out.push("No AI key is set, so only the sample commits can be explained.");
  if (!env.githubToken) out.push("GITHUB_TOKEN isn't set, so GitHub allows only 60 requests an hour.");
  if (/localhost/.test(env.appUrl)) out.push("APP_URL still points to localhost, so links in emails won't open.");
  if (env.allowedOrigins.every((o) => /localhost/.test(o))) out.push("ALLOWED_ORIGINS only allows localhost, so the deployed frontend can't call this API.");
  return out;
}

/** GET /api/health: what's configured, without revealing any keys. */
export const GET = route(async () =>
  json({
    ok: true,
    store: storeKind,
    github: Boolean(env.githubToken),
    gemini: Boolean(env.geminiKey),
    fallback: Boolean(env.fallbackKey),
    email: mailConfigured(),
    warnings: warnings(),
  }),
);
