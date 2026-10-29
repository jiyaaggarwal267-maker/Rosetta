"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "./api";
import type { OrgSummary, User } from "./types";

const TOKEN_KEY = "rosetta:token";
/** Saved per person on this browser; cleared on logout so the next person can't read them. */
export const SAMPLE_LOGINS_PREFIX = "rosetta:sample-logins:";
export const EDITS_PREFIX = "rosetta:edits:";

type Status = "loading" | "anonymous" | "signed-in";

type SessionValue = {
  user: User | null;
  org: OrgSummary | null;
  status: Status;
  createWorkspace: (input: api.WorkspaceSignup) => Promise<User>;
  join: (input: Parameters<typeof api.join>[0]) => Promise<User>;
  resetPassword: (token: string, password: string) => Promise<User>;
  login: (email: string, password: string) => Promise<User>;
  updateProfile: (patch: Parameters<typeof api.updateMe>[0]) => Promise<User>;
  /** Changing the password signs out every other session, so this one keeps the new token. */
  changePassword: (current: string, next: string) => Promise<void>;
  renameWorkspace: (name: string) => Promise<void>;
  /** Reload the user, e.g. after GitHub sends the browser back. */
  refreshUser: () => Promise<void>;
  /** Forget the proven GitHub account (the username stays). */
  unlinkGithub: () => Promise<User>;
  logout: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the session lasts for this page only */
  }
};
/** The sample team's password and unsaved card edits stay with the person who made them. */
const clearPersonal = () => {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(EDITS_PREFIX) || key.startsWith("rosetta:sample-logins")) localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable: nothing was saved */
  }
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const signOut = useCallback(() => {
    api.setToken(null);
    writeToken(null);
    clearPersonal();
    setUser(null);
    setOrg(null);
    setStatus("anonymous");
  }, []);

  /** Store the token, then load the user and their workspace. */
  const start = useCallback(
    async (token: string) => {
      api.setToken(token);
      writeToken(token);
      const me = await api.getMe();
      setUser(me.user);
      setOrg(me.org);
      setStatus("signed-in");
      return me.user;
    },
    [],
  );

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setStatus("anonymous");
      return;
    }
    start(token).catch((error) => {
      if (error instanceof api.ApiError && error.code === "unauthorized") signOut();
      else setStatus("anonymous");
    });
  }, [start, signOut]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      org,
      status,
      createWorkspace: async (input) => start((await api.signup(input)).token),
      join: async (input) => start((await api.join(input)).token),
      resetPassword: async (token, password) => start((await api.resetPassword(token, password)).token),
      login: async (email, password) => start((await api.login(email, password)).token),
      updateProfile: async (patch) => {
        const next = await api.updateMe(patch);
        setUser(next);
        return next;
      },
      changePassword: async (current, next) => {
        const { token } = await api.changePassword(current, next);
        api.setToken(token);
        writeToken(token);
      },
      renameWorkspace: async (name) => {
        const { org: next } = await api.updateOrg({ name });
        setOrg((o) => (o ? { ...o, name: next.name } : o));
      },
      refreshUser: async () => {
        const me = await api.getMe();
        setUser(me.user);
        setOrg(me.org);
      },
      unlinkGithub: async () => {
        const next = await api.unlinkGithub();
        setUser(next);
        return next;
      },
      logout: signOut,
    }),
    [user, org, status, start, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

/**
 * Only same-site paths are allowed as a post-login destination. Browsers read
 * "/\evil.com" as "//evil.com", so backslashes and control characters are refused too.
 */
export const safeNext = (next: string | null | undefined, fallback = "/app") =>
  next && next.startsWith("/") && !next.startsWith("//") && !/[\\\u0000-\u001f]/.test(next) ? next : fallback;
