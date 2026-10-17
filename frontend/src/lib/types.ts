import type { LevelKey } from "./levels";

export type Risk = "low" | "medium" | "high";

/* ------------------------------------------------------------------ */
/* Flowcharts                                                          */
/* ------------------------------------------------------------------ */

/** start/end: rounded pill · step: box · decision: diamond · data: cylinder */
export type FlowNodeKind = "start" | "step" | "decision" | "data" | "end";
export type FlowNode = { id: string; key: string; kind?: FlowNodeKind; group?: string };
/** [from, to] or [from, to, labelKey]; the label text comes from the level's labels. */
export type FlowEdge = [string, string] | [string, string, string];
/** A box drawn around related nodes, e.g. "Server pool". */
export type FlowGroup = { id: string; key: string };
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[]; groups?: FlowGroup[] };

/** A worked example traced through the "after" graph, one path per step. */
export type Walkthrough = { steps: { path: string[] }[] };

export type LevelText = {
  summary: string;
  analogy: string;
  impact: string;
  /** Text for every node key, group key and edge label key. */
  labels: Record<string, string>;
  /** The worked example, told at this level: a title and one line per step. */
  walkthrough?: { title: string; steps: string[] };
};

export type Explanation = {
  title: string;
  risk: Risk;
  riskReason?: string;
  files: string[];
  flow: { before: FlowGraph | null; after: FlowGraph };
  walkthrough?: Walkthrough;
  levels: Record<LevelKey, LevelText>;
  verification?: Verification;
  evidence?: Record<string, Evidence>;
};

export type Verification = {
  score: number;
  confidence: "high" | "medium" | "low";
  checkedBy: "ai" | "code" | "sample";
  issues: string[];
  retried: boolean;
  needsReview: boolean;
  checkedAt: string;
};

/** A few diff lines behind one flowchart step. */
export type Evidence = { file: string; url?: string; line?: number; lines: { kind: "+" | "-" | " "; text: string }[] };

export type FileChange = { path: string; additions: number; deletions: number; url: string };

export type CardRef = { kind: "commit"; sha: string } | { kind: "pull"; number: number };

/** A card as the frontend sees it. */
export type Card = {
  id: string;
  repo: string;
  ref: CardRef;
  url: string;
  author: { name: string; login: string };
  committedAt: string;
  /** "draft" = not reviewed by the engineer yet; "approved" = reviewed. */
  status: "draft" | "approved";
  approvedBy?: string;
  files: FileChange[];
  truncated?: { shownFiles: number };
  explanation: Explanation;
};

export type EditableField = "summary" | "analogy" | "impact";

export type CardEdits = {
  title?: string;
  levels?: Partial<Record<LevelKey, Partial<Record<EditableField, string>>>>;
};

export type ExplainEvent =
  | { type: "start"; title: string }
  | { type: "finding"; text: string }
  | { type: "writing" }
  | { type: "checking" }
  | { type: "rewriting" };

export type ApiErrorCode =
  | "invalid_url"
  | "private"
  | "not_found"
  | "unavailable"
  | "sample_only"
  | "network";

/* ------------------------------------------------------------------ */
/* People and organisations                                            */
/* ------------------------------------------------------------------ */

export type Focus = "timelines" | "cost" | "risk" | "how-it-works" | "user-impact";

/** The role is also the person's reading level; it can't be switched in the app. */
export type Role = LevelKey;

export type User = {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: Role;
  /** Who they report to. Empty for the person at the top. */
  managerId?: string;
  /** Managers name their team, e.g. "Payments". */
  teamName?: string;
  title?: string;
  /** Maps GitHub commits and comments to this person. */
  githubLogin?: string;
  focus: Focus[];
  language: "en" | "hinglish";
  status: "active" | "invited";
  termsAcceptedAt?: string;
  termsVersion?: string;
  privacyVersion?: string;
  marketingOptIn?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoredUser = User & { passwordHash?: string; inviteCode?: string };

export type Org = {
  id: string;
  name: string;
  ownerId: string;
  /** owner/repo names Rosetta watches for new commits. */
  repos: string[];
  webhookSecret: string;
  lastSyncAt?: string;
  createdAt: string;
};

/** A card as stored. Diffs are never stored. */
export type StoredCard = Card & {
  orgId: string;
  /** The org member who wrote the change, matched by GitHub username. */
  authorUserId?: string;
  headSha: string;
  reading: string;
  findings: string[];
  createdBy?: string;
  source: "manual" | "sync" | "webhook" | "demo";
  createdAt: string;
  approvedAt?: string;
};

/** Text written once and stored at every reading level. */
export type Translated = { text: string; levels?: Partial<Record<LevelKey, string>> };

/** An engineer's comment: written in Rosetta or synced from GitHub. */
export type Comment = Translated & {
  id: string;
  orgId: string;
  cardId?: string;
  authorId: string;
  source: "rosetta" | "github";
  githubUrl?: string;
  repo?: string;
  createdAt: string;
};

export type TicketMessage = Translated & { id: string; authorId: string; createdAt: string };

/** A question between two people, e.g. a manager asking an intern what they're working on. */
export type Ticket = {
  id: string;
  orgId: string;
  fromId: string;
  toId: string;
  subject: string;
  /** Set when the question is about one step of one card (Ask Why). */
  context?: { cardId: string; nodeKey: string; technicalQuestion?: string };
  status: "open" | "answered" | "closed";
  messages: TicketMessage[];
  /** People who haven't seen the latest message. */
  unreadBy: string[];
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ */
/* API views (what the backend sends the browser)                      */
/* ------------------------------------------------------------------ */

export type ApiCode =
  | ApiErrorCode
  | "unauthorized"
  | "invalid_credentials"
  | "conflict"
  | "forbidden"
  | "bad_request"
  | "rate_limited"
  | "terms_required";

export type AiUsage = {
  date: string;
  gemini: ProviderUsage;
  fallback: ProviderUsage;
  tasks: Record<string, number>;
};
export type ProviderUsage = { configured: boolean; used: number; limit: number; left: number; exhausted: boolean };

export type OrgSummary = { id: string; name: string; ownerId: string };

export type Person = {
  id: string;
  name: string;
  role: Role;
  title?: string;
  githubLogin?: string;
  status: "active" | "invited";
  managerId?: string;
  team: { id: string; name: string } | null;
  /** Made by "Add a sample team": not a real person. */
  sample?: boolean;
};

export type Member = Person & {
  email?: string;
  reports: number;
  manages: boolean;
  canMessage: boolean;
  inviteCode?: string;
};

export type TeamView = {
  me: Person;
  canAdd: Role[];
  /** The person who created the workspace: may change roles and remove people. */
  isOwner: boolean;
  members: Member[];
  org: OrgSummary & { repos: string[]; lastSyncAt: string | null; webhookPath?: string; webhookSecret?: string };
};

export type FeedItem = {
  id: string;
  title: string;
  summary: string;
  impact: string;
  risk: Risk;
  status: "draft" | "approved";
  repo: string;
  ref: string;
  committedAt: string;
  source: StoredCard["source"];
  author: Person | null;
  authorName: string;
  files: number;
  sample?: boolean;
  confidence: { score: number; level: Verification["confidence"]; checkedBy: Verification["checkedBy"]; needsReview: boolean } | null;
  reports: number;
  comments: number;
  openQuestions: number;
};

export type Feed = {
  items: FeedItem[];
  page: { offset: number; limit: number; total: number; more: boolean };
  repos: string[];
  people: Person[];
  teams: { id: string; name: string; lead: string }[];
  myTeam: { id: string; name: string } | null;
  stats: { total: number; thisWeek: number; notReviewed: number; highRisk: number; openQuestions: number };
  sync: { repos: number; lastSyncAt: string | null };
};

export type NotificationItem = {
  id: string;
  kind: "question" | "reply" | "report" | "change" | "reviewed" | "joined";
  title: string;
  href: string;
  read: boolean;
  createdAt: string;
};

export type DigestCard = {
  id: string;
  title: string;
  summary: string;
  impact: string;
  risk: Risk;
  status: "draft" | "approved";
  committedAt: string;
  author: Person | null;
  authorName: string;
  confidence: { score: number; level: Verification["confidence"] } | null;
};

export type Digest = {
  org: { name: string };
  range: { from: string; to: string; week: number };
  headline: string;
  stats: { changes: number; reviewed: number; risky: number; questions: number; comments: number };
  highlights: DigestCard[];
  attention: (DigestCard & { reason: string })[];
  people: { person: Person; changes: number; reviewed: number }[];
  waiting: { id: string; subject: string; to: Person; since: string }[];
};

export type Shown = { text: string; original: string; translated: boolean };

export type CommentView = Shown & {
  id: string;
  author: Person | null;
  source: "rosetta" | "github";
  githubUrl?: string;
  createdAt: string;
  card?: { id: string; title: string } | null;
  repo?: string;
};

export type CardView = Card & {
  orgId: string;
  source: StoredCard["source"];
  authorUserId?: string;
  authorPerson: Person | null;
  viewer: { level: Role; canReview: boolean; canAsk: boolean; canComment: boolean };
  comments: CommentView[];
  reports?: number;
  /** A ready question to offer in Ask Why (the pitch commit has one). */
  suggestedQuestion?: string;
};

export type TicketSummary = {
  id: string;
  subject: string;
  kind: "question" | "report";
  status: Ticket["status"];
  direction: "sent" | "received";
  from: Person | null;
  to: Person | null;
  other: Person | null;
  unread: boolean;
  updatedAt: string;
  createdAt: string;
  preview: string;
  context: { cardId: string; nodeKey: string; cardTitle: string; technicalQuestion?: string } | null;
};

export type TicketDetail = TicketSummary & {
  stepLabel: string | null;
  messages: (Shown & { id: string; author: Person | null; mine: boolean; createdAt: string })[];
};

export type AskResult =
  | { answerable: true; answer: string }
  | { answerable: false; technicalQuestion: string; askTo: Person | null };
