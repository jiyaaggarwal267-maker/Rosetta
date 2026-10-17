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
  unauthorized: { message: "Log in to explain a commit.", action: "focus" },
  invalid_credentials: { message: "That email and password don't match.", action: "focus" },
  conflict: { message: "An account with this email already exists. Log in instead.", action: "focus" },
  forbidden: { message: "Only the engineer who made this change can approve it.", action: "focus" },
  terms_required: { message: "Tick the box to agree to the Terms and confirm you've read the Privacy Policy.", action: "focus" },
  rate_limited: { message: "Too many tries. Wait a few minutes, then try again.", action: "retry" },
  bad_request: { message: "Some details are missing or invalid.", action: "focus" },
  sample_only: {
    message: "Rosetta is running on sample data, so only the three samples can be explained for now.",
    action: "sample",
  },
};
