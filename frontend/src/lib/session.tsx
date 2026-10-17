"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "./api";
import type { OrgSummary, User } from "./types";

const TOKEN_KEY = "rosetta:token";

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
  renameWorkspace: (name: string) => Promise<void>;
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const signOut = useCallback(() => {
    api.setToken(null);
    writeToken(null);
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
      renameWorkspace: async (name) => {
        const { org: next } = await api.updateOrg({ name });
        setOrg((o) => (o ? { ...o, name: next.name } : o));
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

/** Only same-site paths are allowed as a post-login destination. */
export const safeNext = (next: string | null | undefined, fallback = "/app") =>
  next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
