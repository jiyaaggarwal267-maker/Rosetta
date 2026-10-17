import type {
  AiUsage,
  Digest,
  NotificationItem,
  ApiCode,
  AskResult,
  CardEdits,
  CardView,
  CommentView,
  ExplainEvent,
  Feed,
  Focus,
  Member,
  OrgSummary,
  Person,
  Role,
  TeamView,
  TicketDetail,
  TicketSummary,
  Verification,
  User,
} from "./types";

/** The backend (see backend/README.md). The app needs it running. */
const BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public code: ApiCode,
    public detail?: string,
  ) {
    super(code);
  }
}

/* ---------- session token, set by the SessionProvider ---------- */

let token: string | null = null;
export const setToken = (next: string | null) => {
  token = next;
};
const authHeaders = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

async function toError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { code?: ApiCode; message?: string } | null;
  if (body?.code) return new ApiError(body.code, body.message);
  if (res.status === 401) return new ApiError("unauthorized");
  if (res.status === 404) return new ApiError("not_found");
  return new ApiError("unavailable");
}

async function call<T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      // Never leave a button spinning: give up after 20 s and show an error.
      signal: AbortSignal.timeout(init?.timeoutMs ?? 20_000),
    });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}

const q = (params: Record<string, string | undefined | null>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return s ? `?${s}` : "";
};

/* ---------- accounts ---------- */

type Session = { token: string; user: User };

export type WorkspaceSignup = {
  name: string;
  email: string;
  password: string;
  role: "cmo" | "manager";
  orgName: string;
  teamName?: string;
  title?: string;
  githubLogin?: string;
  focus: Focus[];
  language: "en" | "hinglish";
  acceptTerms: boolean;
  marketingOptIn: boolean;
};

export const signup = (input: WorkspaceSignup) => call<Session>("/api/auth/signup", { method: "POST", body: input });
export const login = (email: string, password: string) =>
  call<Session>("/api/auth/login", { method: "POST", body: { email, password } });
export const forgotPassword = (email: string) => call<{ sent: true }>("/api/auth/forgot", { method: "POST", body: { email } });
export const resetPassword = (token: string, password: string) =>
  call<Session>("/api/auth/reset", { method: "POST", body: { token, password } });
export const getInvite = (code: string) =>
  call<{ name: string; email: string; role: Role; title?: string; githubLogin?: string; orgName: string; invitedBy: string | null }>(
    `/api/invites/${encodeURIComponent(code)}`,
  );
export const join = (input: {
  code: string;
  password: string;
  name?: string;
  githubLogin?: string;
  focus?: Focus[];
  language?: "en" | "hinglish";
  acceptTerms: boolean;
  marketingOptIn: boolean;
}) =>
  call<Session>("/api/auth/join", { method: "POST", body: input });
export const getMe = () => call<{ user: User; org: OrgSummary | null }>("/api/me");
export const updateMe = async (patch: Partial<Pick<User, "name" | "title" | "githubLogin" | "teamName" | "focus" | "language" | "marketingOptIn">>) =>
  (await call<{ user: User }>("/api/me", { method: "PATCH", body: patch })).user;

/* ---------- team ---------- */

export const getTeam = () => call<TeamView>("/api/team");
export const addMember = (input: { name: string; email: string; role: Role; title?: string; githubLogin?: string; teamName?: string; managerId?: string }) =>
  call<{ member: Person; inviteCode: string; emailed: boolean }>("/api/team/members", { method: "POST", body: input });
export const updateMember = (
  id: string,
  patch: { title?: string; githubLogin?: string; teamName?: string; role?: Role; managerId?: string },
) => call<{ member: Member }>(`/api/team/members/${id}`, { method: "PATCH", body: patch });
export const removeMember = (id: string) => call<{ removed: string }>(`/api/team/members/${id}`, { method: "DELETE" });
export const updateOrg = (patch: { name?: string; repos?: string[] }) => call<{ org: OrgSummary & { repos: string[] } }>("/api/org", { method: "PATCH", body: patch });
export const getNotifications = () => call<{ items: NotificationItem[]; unread: number }>("/api/notifications");
export const readNotifications = (input: { ids?: string[]; all?: boolean }) => call<{ marked: number }>("/api/notifications", { method: "POST", body: input });
export const getDigest = (week = 0) => call<Digest>(`/api/digest?week=${week}`);
export const changePassword = (current: string, next: string) =>
  call<{ changed: true }>("/api/me/password", { method: "POST", body: { current, next } });
export type ReportOptions = {
  engineers: { id: string; name: string; title: string; changes: number }[];
  owner: { name: string; isMe: boolean } | null;
  email: boolean;
  demo: boolean;
};
export const getReportOptions = () => call<ReportOptions>("/api/digest/report");
export const weeklyReport = (input: { engineerId: string; sample: boolean; send: boolean }) =>
  call<{ subject: string; html: string; sent: boolean; to: string }>("/api/digest/report", { method: "POST", body: input });
/** Downloads everything Rosetta holds about you as a JSON file. */
export async function exportMyData() {
  const res = await fetch(`${BASE}/api/me/export`, { headers: authHeaders(), signal: AbortSignal.timeout(30_000) }).catch(() => {
    throw new ApiError("network");
  });
  if (!res.ok) throw await toError(res);
  return res.blob();
}
export const deleteAccount = (confirm: string, deleteWorkspace = false) =>
  call<{ deleted: string; workspaceDeleted: boolean }>("/api/me", { method: "DELETE", body: { confirm, deleteWorkspace } });
export const transferOwnership = (userId: string) => call<{ ownerId: string }>("/api/org/owner", { method: "POST", body: { userId } });
export const getUsage = () => call<AiUsage>("/api/usage");
export const syncNow = () => call<{ commits: number; comments: number }>("/api/sync", { method: "POST" });
export const seedDemo = () =>
  call<{ added: number; password: string; logins: { name: string; role: Role; email: string }[] }>("/api/demo/seed", { method: "POST" });

/* ---------- work ---------- */

export type FeedFilters = {
  author?: string;
  team?: string;
  status?: string;
  q?: string;
  risk?: string;
  repo?: string;
  days?: string;
  offset?: string;
  limit?: string;
};
export const getFeed = (filters: FeedFilters = {}) => call<Feed>(`/api/feed${q(filters)}`);
export const getCard = (id: string) => call<CardView>(`/api/cards/${encodeURIComponent(id)}`);
export const deleteCard = (id: string) => call<{ deleted: string }>(`/api/cards/${encodeURIComponent(id)}`, { method: "DELETE" });
export const reexplain = (id: string) =>
  call<{ card: CardView }>(`/api/cards/${encodeURIComponent(id)}/reexplain`, { method: "POST", timeoutMs: 240_000 });
export const getForMe = (id: string) => call<{ note: string | null }>(`/api/cards/${encodeURIComponent(id)}/for-me`);
export const approve = (cardId: string, edits: CardEdits) =>
  call<{ card: CardView }>("/api/approve", { method: "POST", body: { cardId, edits } });
export const addComment = (cardId: string, text: string) =>
  call<{ comment: CommentView }>(`/api/cards/${encodeURIComponent(cardId)}/comments`, { method: "POST", body: { text } });
export const getComments = (filters: { author?: string; team?: string } = {}) =>
  call<{ items: CommentView[] }>(`/api/comments${q(filters)}`);
export const ask = (input: { cardId: string; nodeKey: string; question: string }) =>
  call<AskResult>("/api/ask", { method: "POST", body: input });

/* ---------- questions ---------- */

export const reportMistake = (cardId: string, input: { text: string; nodeKey?: string }) =>
  call<{ ticket: TicketSummary }>(`/api/cards/${encodeURIComponent(cardId)}/report`, { method: "POST", body: input });
export const getTickets = () => call<{ received: TicketSummary[]; sent: TicketSummary[]; unread: number }>("/api/tickets");
export const createTicket = (input: {
  toId: string;
  subject: string;
  text: string;
  context?: { cardId: string; nodeKey: string; technicalQuestion?: string };
}) => call<{ ticket: TicketSummary }>("/api/tickets", { method: "POST", body: input });
export const getTicket = (id: string) => call<{ ticket: TicketDetail }>(`/api/tickets/${id}`);
export const replyTicket = (id: string, text: string) =>
  call<{ ticket: TicketDetail }>(`/api/tickets/${id}`, { method: "POST", body: { text } });
export const setTicketStatus = (id: string, status: "open" | "closed") =>
  call<{ ticket: TicketDetail }>(`/api/tickets/${id}`, { method: "PATCH", body: { status } });

/* ---------- explain a link ---------- */

/** POST /api/explain: NDJSON lines of ExplainEvent, then { type: "card" }. */
export async function explain(url: string, onEvent: (event: ExplainEvent) => void): Promise<CardView> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ url }),
      // Explaining a new commit with the model can take a while.
      signal: AbortSignal.timeout(240_000),
    });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) throw await toError(res);
  if (!res.headers.get("content-type")?.includes("ndjson") || !res.body) return res.json() as Promise<CardView>;

  type Line = ExplainEvent | { type: "card"; card: CardView } | { type: "error"; code: ApiCode };
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const line = JSON.parse(raw) as Line;
      if (line.type === "card") return line.card;
      if (line.type === "error") throw new ApiError(line.code);
      onEvent(line);
    }
    if (done) throw new ApiError("unavailable");
  }
}

export type CheckStep = { type: "step"; key: "read" | "evidence" | "words" | "names" | "judge"; state: "running" | "pass" | "warn" | "fail"; detail?: string };

/** Re-checks a card against its real diff, one visible step at a time. */
export async function checkAccuracy(cardId: string, onStep: (step: CheckStep) => void): Promise<Verification> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/cards/${encodeURIComponent(cardId)}/check`, {
      method: "POST",
      headers: authHeaders(),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok || !res.body) throw await toError(res);
  type Line = CheckStep | { type: "card"; card: { verification: Verification } } | { type: "error"; code: ApiCode };
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const line = JSON.parse(raw) as Line;
      if (line.type === "card") return line.card.verification;
      if (line.type === "error") throw new ApiError(line.code);
      onStep(line);
    }
    if (done) throw new ApiError("unavailable");
  }
}
