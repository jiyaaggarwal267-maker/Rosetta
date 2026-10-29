import { ApiError } from "./api";
import type { ApiCode } from "./types";

/** Errors say what happened and what to do (design.md §6). */
export const ERROR_COPY: Record<ApiCode, { message: string; action: "example" | "sample" | "retry" | "focus" }> = {
  invalid_url: { message: "That isn't a GitHub commit or pull request link.", action: "example" },
  private: {
    message: "This repository is private. Rosetta can only read public repositories for now.",
    action: "sample",
  },
  not_found: { message: "No commit found at that link. Check the commit ID.", action: "focus" },
  unavailable: { message: "Explanations are unavailable right now. Try again in a minute.", action: "retry" },
  network: { message: "Explanations are unavailable right now. Try again in a minute.", action: "retry" },
  timeout: {
    message: "This is taking longer than usual. Rosetta may still be working on it, so check back in a minute before trying again.",
    action: "retry",
  },
  unauthorized: { message: "Log in to explain a commit.", action: "focus" },
  invalid_credentials: { message: "That email and password don't match.", action: "focus" },
  conflict: { message: "An account with this email already exists. Log in instead.", action: "focus" },
  forbidden: { message: "You don't have access to this change.", action: "focus" },
  terms_required: { message: "Tick the box to agree to the Terms and confirm you've read the Privacy Policy.", action: "focus" },
  rate_limited: { message: "Too many tries. Wait a few minutes, then try again.", action: "retry" },
  bad_request: { message: "Some details are missing or invalid.", action: "focus" },
  sample_only: {
    message: "Rosetta is running on sample data, so only the three samples can be explained for now.",
    action: "sample",
  },
};

/**
 * What to tell the reader when a call fails: a timeout says the server may
 * still be working, the server's own message wins next, then rate limits.
 */
export function errorText(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === "timeout") return ERROR_COPY.timeout.message;
  if (error.detail) return error.detail.replace(/^✖ /gm, "");
  if (error.code === "rate_limited") return ERROR_COPY.rate_limited.message;
  return fallback;
}
