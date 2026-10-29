"use client";

import { useEffect, useRef } from "react";

/**
 * After connecting GitHub (team page) or linking a GitHub account (profile),
 * GitHub sends the browser back with ?github=connected|linked or
 * ?github=error&reason=<reason>. These say what happened in plain words.
 */
const REASONS: Record<string, { connect: string; link: string }> = {
  state: {
    connect: "That connection link expired. Press Connect GitHub to start again.",
    link: "That link expired. Press Link GitHub to start again.",
  },
  owner: {
    connect: "Only the workspace owner can connect GitHub.",
    link: "Only the workspace owner can do that.",
  },
  installation: {
    connect: "Rosetta couldn't find that GitHub installation. Try connecting again.",
    link: "Rosetta couldn't find that GitHub installation. Try again.",
  },
  suspended: {
    connect: "Rosetta is suspended on that GitHub account. Turn it back on in GitHub's settings, then connect again.",
    link: "Rosetta is suspended on that GitHub account. Ask your workspace owner to turn it back on.",
  },
  taken: {
    connect: "That GitHub account is already connected to another Rosetta workspace.",
    link: "That GitHub account is already linked to someone else in Rosetta.",
  },
  verify: {
    connect: "GitHub couldn't confirm you can manage that account. Connect from a GitHub login that can, then try again.",
    link: "GitHub couldn't confirm your account. Try again.",
  },
  denied: {
    connect: "You cancelled on GitHub, so nothing changed.",
    link: "You cancelled on GitHub, so nothing changed.",
  },
  github: {
    connect: "GitHub didn't answer. Try again in a few minutes.",
    link: "GitHub didn't answer. Try again in a few minutes.",
  },
  not_configured: {
    connect: "Connecting GitHub isn't set up for Rosetta yet. Ask whoever runs Rosetta for your company.",
    link: "Linking GitHub accounts isn't set up for Rosetta yet. Ask whoever runs Rosetta for your company.",
  },
};

export const githubReason = (reason: string | null, flow: "connect" | "link") =>
  (reason && REASONS[reason]?.[flow]) || (flow === "connect" ? "Connecting GitHub didn't work. Try again." : "Linking GitHub didn't work. Try again.");

/**
 * Reads ?github=… once on arrival, calls back, then removes it from the
 * address so a reload doesn't show the message again.
 */
export function useGithubReturn(onReturn: (result: { ok: boolean; status: string; reason: string | null }) => void) {
  const handled = useRef(false);
  const callback = useRef(onReturn);
  useEffect(() => {
    callback.current = onReturn;
  });
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("github");
    if (!status) return;
    const reason = params.get("reason");
    params.delete("github");
    params.delete("reason");
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
    callback.current({ ok: status !== "error", status, reason });
  }, []);
}

/** Send the browser to GitHub (install or login page). */
export const goTo = (url: string) => {
  window.location.href = url;
};

/** "staging, release" → ["staging", "release"], without blanks or repeats. */
export const parseBranches = (text: string) => [...new Set(text.split(",").map((b) => b.trim()).filter(Boolean))];
