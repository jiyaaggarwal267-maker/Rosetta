import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { env, isProduction } from "./env";
import { ApiError } from "./http";
import { store } from "./store";
import type { StoredUser, User } from "./types";

/**
 * Email + password accounts. Passwords are hashed with scrypt; sessions are
 * an HMAC-signed `{ sub, exp, iat, v }` token sent as `Authorization: Bearer …`,
 * which works across the frontend and backend origins without cookie rules.
 *
 * A token stops working when the user's `sessionVersion` moves past its `v`
 * (password change or reset), when the account isn't active, or when it was
 * issued before the account was created (a deleted account re-added with the
 * same email gets the same id, so an old token must not carry over).
 */

const TTL_SECONDS = 30 * 24 * 3600;
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const globalSecret = globalThis as unknown as { __rosettaDevSecret?: string };
function secret() {
  if (env.sessionSecret) return env.sessionSecret;
  if (isProduction) throw new Error("SESSION_SECRET must be set in production.");
  return (globalSecret.__rosettaDevSecret ??= randomBytes(32).toString("hex"));
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export const userIdFor = (email: string) =>
  `u_${createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16)}`;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Hashed against when there is no real hash, so an unknown email takes as long as a wrong password. */
const DUMMY_SALT = randomBytes(16);

export async function checkPassword(password: string, stored: string) {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) {
    await scryptAsync(password, DUMMY_SALT, 64);
    return false;
  }
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

/** `sessionVersion` is bumped to log out every existing session. Missing means 0. */
type Versioned = { id: string; sessionVersion?: number };
export type VersionedUser = StoredUser & { sessionVersion?: number };

/** The user as sent to the browser: no password hash. */
export function publicUser(user: StoredUser | User): User {
  const { passwordHash: _hash, inviteCode: _code, sessionVersion: _v, ...rest } = user as StoredUser & Versioned;
  return rest;
}

/** The next session version, for a password change or reset. Older tokens stop working. */
export const nextSessionVersion = (user: Versioned) => (user.sessionVersion ?? 0) + 1;

/** A token for this user. Pass the stored user so the token carries their session version. */
export function issueToken(user: string | Versioned) {
  const { id, sessionVersion = 0 } = typeof user === "string" ? { id: user } : user;
  const iat = Math.floor(Date.now() / 1000);
  const payload = b64(JSON.stringify({ sub: id, iat, exp: iat + TTL_SECONDS, v: sessionVersion }));
  return `${payload}.${sign(payload)}`;
}

type Claims = { sub: string; exp: number; iat: number; v: number };

function verify(token: string): Claims | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<Claims>;
    if (typeof claims.sub !== "string" || typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000) return null;
    // Tokens from before versions existed: version 0, issued TTL before they expire.
    return { sub: claims.sub, exp: claims.exp, iat: claims.iat ?? claims.exp - TTL_SECONDS, v: claims.v ?? 0 };
  } catch {
    return null;
  }
}

/**
 * A signed, expiring value for a round trip through another site (the GitHub
 * install and login pages hand it back as `state`). Tied to one purpose, so a
 * state made for linking an account can't be replayed to connect an installation.
 */
export function sealState(purpose: string, data: Record<string, string | number>, ttlMs: number) {
  const payload = b64(JSON.stringify({ ...data, p: purpose, exp: Date.now() + ttlMs, n: randomBytes(8).toString("hex") }));
  return `${payload}.${sign(`state:${payload}`)}`;
}

/** The data inside a state from `sealState`, or null when it's forged, expired or for another purpose. */
export function openState(state: string | null, purpose: string): Record<string, string | number> | null {
  const [payload, signature, extra] = (state ?? "").split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(`state:${payload}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, string | number>;
    if (data.p !== purpose || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export async function optionalUser(req: Request): Promise<User | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const claims = token ? verify(token) : null;
  if (!claims) return null;
  const user = await store.get<StoredUser & Versioned>("users", claims.sub);
  if (!user || user.status !== "active") return null;
  if ((user.sessionVersion ?? 0) !== claims.v) return null;
  // Issued before this account existed: it belonged to an earlier account with the same email.
  const created = Math.floor(Date.parse(user.createdAt) / 1000);
  if (Number.isFinite(created) && claims.iat < created) return null;
  return publicUser(user);
}

export async function requireUser(req: Request): Promise<User> {
  const user = await optionalUser(req);
  if (!user) throw new ApiError("unauthorized", "Log in to do this.");
  return user;
}
