import { createHash } from "node:crypto";

/** A pending password reset. Only a hash of the emailed token is stored. */
export type Reset = { id?: string; userId: string; expiresAt: number; createdAt: number };

export const resetId = (token: string) => createHash("sha256").update(token).digest("hex");

export const RESET_TTL_MS = 3_600_000;
