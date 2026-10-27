import { env } from "../env";
import { ApiError } from "../http";

/**
 * One interface over Gemini (primary) and any OpenAI-compatible model
 * (Groq or OpenRouter) as the fallback when Gemini is slow or rate-limited.
 */

export type JsonTask<T> = {
  name: string;
  system: string;
  prompt: string;
  /** Gemini responseSchema (OpenAPI subset). */
  schema: object;
  /** Parses and repairs the raw model output; throws if unusable. */
  parse: (raw: unknown) => T;
  temperature?: number;
  /** Tokens the model may spend thinking first. 0 = answer straight away (fastest). */
  thinkingBudget?: number;
  /** Per attempt. Big explanations need longer than quick rewrites. */
  timeoutMs?: number;
  /** Which provider to try first. Small tasks use the fallback to save Gemini's quota. */
  prefer?: "gemini" | "fallback";
  /** A shorter prompt for the fallback model, whose per-minute token budget is small. */
  fallbackPrompt?: string;
  /** The workspace the call is for: it counts toward that workspace's share of the daily quota. */
  orgId?: string;
};

export const aiConfigured = () => Boolean(env.geminiKey || env.fallbackKey);

async function gemini(task: JsonTask<unknown>): Promise<unknown> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: task.system }] },
        contents: [{ role: "user", parts: [{ text: task.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: task.schema,
          temperature: task.temperature ?? 0.4,
          thinkingConfig: { thinkingBudget: task.thinkingBudget ?? 0 },
        },
      }),
      signal: AbortSignal.timeout(task.timeoutMs ?? 45_000),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 2000)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  // Thinking models may return thought parts; only the answer parts are JSON.
  const text = data.candidates?.[0]?.content?.parts
    ?.filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (!text) throw new Error("Gemini returned no text");
  return JSON.parse(text);
}

/** Groq's free tier allows a few thousand tokens a minute: a 429 that says "try again in 12s" is worth one wait. */
const MAX_WAIT_MS = 30_000;

async function openAiCompatible(task: JsonTask<unknown>, waited = false): Promise<unknown> {
  try {
    return await openAiCompatibleOnce(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const wait = message.match(/\b429\b[\s\S]*?try again in (?:(\d+)m)?([\d.]+)(ms|s)/i);
    if (waited || !wait || isDailyQuota(message)) throw error;
    const ms = (Number(wait[1] ?? 0) * 60 + Number(wait[2]) / (wait[3] === "ms" ? 1000 : 1)) * 1000 + 500;
    if (ms > MAX_WAIT_MS) throw error;
    console.warn(`[rosetta] ${task.name}: fallback busy, waiting ${Math.round(ms / 1000)}s`);
    await new Promise((r) => setTimeout(r, ms));
    return openAiCompatible(task, true);
  }
}

/** A 429 for the day (not the minute): skip this provider until tomorrow. */
const isDailyQuota = (message: string) => /per ?day|PerDay|daily|\bRPD\b|\bTPD\b|exceeded your current quota/i.test(message) && !/per ?minute|PerMinute|\bTPM\b|\bRPM\b/i.test(message);

async function openAiCompatibleOnce(task: JsonTask<unknown>): Promise<unknown> {
  const res = await fetch(`${env.fallbackBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.fallbackKey}` },
    body: JSON.stringify({
      model: env.fallbackModel,
      temperature: task.temperature ?? 0.4,
      response_format: { type: "json_object" },
      // gpt-oss models think before answering; on a small per-minute budget, keep that short.
      ...(/gpt-oss/i.test(env.fallbackModel) ? { reasoning_effort: "low" } : {}),
      messages: [
        {
          role: "system",
          content: `${task.system}\n\nRespond with one JSON object only, matching this schema:\n${JSON.stringify(task.schema)}`,
        },
        { role: "user", content: task.prompt },
      ],
    }),
    signal: AbortSignal.timeout(task.timeoutMs ?? 45_000),
  });
  if (!res.ok) throw new Error(`Fallback ${res.status}: ${(await res.text()).slice(0, 2000)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Fallback returned no text");
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

/**
 * Whether a failed call used up quota: an answer we couldn't use, or a
 * timeout (the provider may have finished it anyway), counts; a refusal
 * (any HTTP error, 429 included) or a network failure never reached the
 * model and doesn't.
 */
const billed = (message: string) => !/^(Gemini|Fallback) \d{3}:/.test(message) && !/fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN/i.test(message);

/**
 * Runs a task on the best available model. Big jobs (explaining a commit)
 * prefer Gemini; small ones prefer the fallback so Gemini's small free daily
 * quota is kept for explanations. A provider that's used up today, overall or
 * for this workspace, is skipped.
 */
export async function generateJson<T>(task: JsonTask<T>): Promise<T> {
  const { recordAi, sharedSpent, spent } = await import("../usage");
  const geminiOk = Boolean(env.geminiKey) && !(await spent("gemini", task.orgId));
  const fallbackOk = Boolean(env.fallbackKey) && !(await spent("fallback", task.orgId));

  const geminiAttempts: Attempt[] = geminiOk
    ? [
        ["gemini", "gemini", () => gemini(task)],
        ["gemini retry", "gemini", () => gemini(task)],
      ]
    : [];
  const fallbackAttempts: Attempt[] = fallbackOk
    ? [["fallback", "fallback", () => openAiCompatible(task.fallbackPrompt ? { ...task, prompt: task.fallbackPrompt } : task)]]
    : [];
  const attempts = task.prefer === "fallback" ? [...fallbackAttempts, ...geminiAttempts] : [...geminiAttempts, ...fallbackAttempts];

  let skipRetry = false;
  for (const [label, provider, run] of attempts) {
    // A timeout or an overloaded model won't recover in a second: move on.
    if (label === "gemini retry" && skipRetry) continue;
    try {
      const result = task.parse(await run());
      void recordAi(provider, task.name, "ok", task.orgId);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const limited = /\b429\b/.test(message);
      if (limited || /timeout|aborted|\b503\b/i.test(message)) skipRetry = true;
      // Only a daily limit switches the provider off for the day; a per-minute one passes.
      void recordAi(provider, task.name, limited && isDailyQuota(message) ? "exhausted" : billed(message) ? "failed" : "error", task.orgId);
      console.warn(`[rosetta] ${task.name}: ${label} failed:`, message.slice(0, 200));
    }
  }
  if (geminiOk || fallbackOk) throw new ApiError("unavailable");
  // Say whose quota ran out: everyone's, or only this workspace's share.
  const shared = (!env.geminiKey || (await sharedSpent("gemini"))) && (!env.fallbackKey || (await sharedSpent("fallback")));
  throw new ApiError(
    "unavailable",
    shared || !task.orgId ? "Today's free AI quota is used up. It resets tomorrow." : "Your workspace has used its share of today's free AI quota. It resets tomorrow.",
  );
}

type Attempt = [label: string, provider: "gemini" | "fallback", run: () => Promise<unknown>];
