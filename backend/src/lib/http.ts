import { z } from "zod";
import { env } from "./env";
import type { ApiErrorCode } from "./types";

type ServerCode =
  | ApiErrorCode
  | "unauthorized"
  | "forbidden"
  | "bad_request"
  | "conflict"
  | "invalid_credentials"
  | "rate_limited"
  | "terms_required";

const STATUS: Record<ServerCode, number> = {
  invalid_url: 400,
  bad_request: 400,
  terms_required: 400,
  unauthorized: 401,
  invalid_credentials: 401,
  conflict: 409,
  rate_limited: 429,
  forbidden: 403,
  private: 403,
  not_found: 404,
  sample_only: 503,
  unavailable: 503,
  network: 503,
};

export class ApiError extends Error {
  constructor(
    public code: ServerCode,
    message?: string,
  ) {
    super(message ?? code);
  }
  get status() {
    return STATUS[this.code];
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = origin && (env.allowedOrigins.includes("*") || env.allowedOrigins.includes(origin));
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// Fallback wording for schemas without their own message, so Zod's
// developer text ("Too small: expected string…") never reaches people.
z.config({
  customError: (issue) => {
    switch (issue.code) {
      case "too_small":
        return issue.origin === "string" && issue.minimum === 1 ? "Please fill in every required field." : "Something you entered is too short.";
      case "too_big":
        return "Something you entered is too long.";
      case "unrecognized_keys":
        return "That request had fields Rosetta doesn't accept.";
      case "invalid_value":
        return "Pick one of the options offered.";
      default:
        return "Something in that request isn't valid. Check it and try again.";
    }
  },
});

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function errorResponse(error: unknown) {
  if (error instanceof ApiError) return json({ code: error.code, message: error.message }, error.status);
  if (error instanceof z.ZodError) {
    // Our own messages are written for people; drop Zod's "→ at <path>" detail.
    const messages = [...new Set(error.issues.map((i) => i.message))];
    return json({ code: "bad_request", message: messages.join(" ") }, 400);
  }
  console.error("[rosetta] unhandled error", error);
  return json({ code: "unavailable" }, 503);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route: CORS on every response, errors as `{ code }` JSON. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    let res: Response;
    try {
      res = await handler(req, ctx);
    } catch (error) {
      res = errorResponse(error);
    }
    for (const [key, value] of Object.entries(corsHeaders(req))) res.headers.set(key, value);
    return res;
  };
}

export const preflight = async (req: Request) => new Response(null, { status: 204, headers: corsHeaders(req) });

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const body = await req.json().catch(() => {
    throw new ApiError("bad_request", "Body must be JSON.");
  });
  return schema.parse(body);
}

/**
 * Streams NDJSON lines, then `{ type: "card", card }` with whatever `run`
 * returns. Errors after the stream opens become `{ type: "error", code, message? }`,
 * with the message only when the route wrote one for people to read.
 */
export function ndjson(run: (emit: (line: object) => void) => Promise<object>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const emit = (line: object) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      try {
        emit({ type: "card", card: await run(emit) });
      } catch (error) {
        if (!(error instanceof ApiError)) console.error("[rosetta] stream error", error);
        const known = error instanceof ApiError;
        emit({ type: "error", code: known ? error.code : "unavailable", ...(known && error.message !== error.code ? { message: error.message } : {}) });
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
