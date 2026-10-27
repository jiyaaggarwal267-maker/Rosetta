import { createHmac, createPrivateKey, sign as rsaSign, timingSafeEqual, type KeyObject } from "node:crypto";
import { env } from "./env";
import { ApiError } from "./http";

/**
 * The Rosetta GitHub App. A company installs it once on its repos (private
 * ones too); GitHub then sends every push to one webhook, and Rosetta reads
 * the code with a short-lived installation token instead of a personal one.
 *
 * Auth, with no SDK: the App signs a 10-minute JWT (RS256) with its private
 * key, trades it for an installation token (an hour), and the token is reused
 * until 5 minutes before it expires. Tokens never leave this file's callers.
 */

export const appConfigured = () => Boolean(env.githubAppId && env.githubAppPrivateKey);
/** "Link your GitHub account" and confirming installs need the App's OAuth client. */
export const oauthConfigured = () => Boolean(env.githubAppClientId && env.githubAppClientSecret);

export class GitHubAppError extends Error {
  constructor(public status: number) {
    super(`GitHub responded ${status}`);
  }
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

let cachedKey: { pem: string; key: KeyObject } | undefined;
function privateKey() {
  if (cachedKey?.pem !== env.githubAppPrivateKey) {
    // PKCS#1 ("BEGIN RSA PRIVATE KEY", what GitHub hands out) and PKCS#8 both load.
    cachedKey = { pem: env.githubAppPrivateKey, key: createPrivateKey(env.githubAppPrivateKey) };
  }
  return cachedKey.key;
}

/** A JWT that proves we are the App. Backdated a minute for clock drift; GitHub allows 10 minutes at most. */
export function appJwt(now = Math.floor(Date.now() / 1000)) {
  if (!appConfigured()) throw new ApiError("unavailable", "The GitHub App isn't set up on this server.");
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.githubAppId }));
  const signature = rsaSign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey());
  return `${header}.${payload}.${b64url(signature)}`;
}

async function call(url: string, auth: string | undefined, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "rosetta-devlympics",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) throw new GitHubAppError(res.status);
  return res;
}

const api = async <T>(path: string, auth: string | undefined, init?: RequestInit) =>
  (await call(`${env.githubApiUrl}${path}`, auth, init)).json() as Promise<T>;

/* ------------------------------------------------------------------ */
/* Installations                                                       */
/* ------------------------------------------------------------------ */

export type Installation = {
  id: number;
  account: { login: string; type?: string } | null;
  created_at?: string;
  updated_at?: string;
  suspended_at?: string | null;
};

/** The installation, as GitHub tells the App about it. 404 when it isn't one of ours. */
export const getInstallation = (id: string | number) => api<Installation>(`/app/installations/${encodeURIComponent(String(id))}`, appJwt());

/** Installation tokens, by installation id, until 5 minutes before they expire. */
const tokens = new Map<string, { token: string; until: number }>();
const EARLY_MS = 5 * 60_000;

export async function installationToken(installationId: string) {
  const hit = tokens.get(installationId);
  if (hit && hit.until > Date.now()) return hit.token;
  const res = await api<{ token: string; expires_at: string }>(
    `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    appJwt(),
    { method: "POST" },
  );
  const expires = Date.parse(res.expires_at);
  tokens.set(installationId, { token: res.token, until: (Number.isNaN(expires) ? Date.now() + 3_600_000 : expires) - EARLY_MS });
  if (tokens.size > 1_000) tokens.delete(tokens.keys().next().value!);
  return res.token;
}

/** Forgets a cached token, e.g. after the installation was removed. */
export const dropInstallationToken = (installationId: string) => tokens.delete(installationId);

export type InstallationRepo = { fullName: string; private: boolean; defaultBranch: string };

/** Every repo the installation can read, at most 1,000. */
export async function listInstallationRepos(installationId: string): Promise<InstallationRepo[]> {
  const token = await installationToken(installationId);
  const out: InstallationRepo[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await api<{ total_count: number; repositories: { full_name: string; private: boolean; default_branch: string }[] }>(
      `/installation/repositories?per_page=100&page=${page}`,
      token,
    );
    out.push(...batch.repositories.map((r) => ({ fullName: r.full_name.toLowerCase(), private: r.private, defaultBranch: r.default_branch })));
    if (batch.repositories.length < 100 || out.length >= batch.total_count) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Pages on github.com                                                 */
/* ------------------------------------------------------------------ */

/** Where a workspace owner installs the App. GitHub sends `state` back to the Setup URL. */
export const installUrl = (state: string) =>
  `${env.githubWebUrl}/apps/${encodeURIComponent(env.githubAppSlug)}/installations/new?state=${encodeURIComponent(state)}`;

/** GitHub's login page for the App. It returns to the App's Callback URL (/api/github/link/callback). */
export const authorizeUrl = (state: string) =>
  `${env.githubWebUrl}/login/oauth/authorize?client_id=${encodeURIComponent(env.githubAppClientId)}&state=${encodeURIComponent(state)}&allow_signup=false`;

/* ------------------------------------------------------------------ */
/* Acting as a GitHub user (OAuth)                                     */
/* ------------------------------------------------------------------ */

/** Trades the code GitHub sent back for a user token. Used once and dropped, never stored. */
export async function exchangeCode(code: string) {
  const res = await call(`${env.githubWebUrl}/login/oauth/access_token`, undefined, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: env.githubAppClientId, client_secret: env.githubAppClientSecret, code }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new GitHubAppError(401);
  return data.access_token;
}

export const githubUser = (userToken: string) => api<{ login: string; id: number }>("/user", userToken);

/** Whether the user behind this token can see the installation (they installed it, or administer it). */
export async function userCanSeeInstallation(userToken: string, installationId: string) {
  for (let page = 1; page <= 10; page++) {
    const batch = await api<{ installations: { id: number }[] }>(`/user/installations?per_page=100&page=${page}`, userToken);
    if (batch.installations.some((i) => String(i.id) === installationId)) return true;
    if (batch.installations.length < 100) return false;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Webhook                                                             */
/* ------------------------------------------------------------------ */

/** X-Hub-Signature-256 against the raw body, in constant time. */
export function signatureOk(secret: string, body: string, signature: string | null) {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
