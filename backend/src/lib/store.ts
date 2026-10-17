import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * Document storage. Firestore when FIREBASE_* is set, otherwise a JSON file
 * in .data/ so the backend runs locally with no setup.
 */

export type Collection =
  | "orgs"
  | "users"
  | "invites"
  | "cards"
  | "explanations"
  | "notes"
  | "comments"
  | "tickets"
  | "resets"
  | "usage"
  | "notifications"
  | "checks"
  | "deleted";

interface Store {
  get<T>(collection: Collection, id: string): Promise<T | null>;
  set<T extends object>(collection: Collection, id: string, data: T): Promise<void>;
  remove(collection: Collection, id: string): Promise<void>;
  /** Every document where `field` equals `value` (one equality filter). */
  list<T>(collection: Collection, field: string, value: string): Promise<T[]>;
  /** Every document in a collection. Only for small ones, like orgs in the weekly job. */
  all<T>(collection: Collection): Promise<T[]>;
}

class FirestoreStore implements Store {
  private db: Promise<import("firebase-admin/firestore").Firestore>;

  constructor() {
    this.db = (async () => {
      const { initializeApp, getApps, cert } = await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");
      const app =
        getApps()[0] ??
        initializeApp({
          credential: cert({
            projectId: env.firebaseProjectId,
            clientEmail: env.firebaseClientEmail,
            privateKey: env.firebasePrivateKey,
          }),
        });
      const db = getFirestore(app);
      db.settings({ ignoreUndefinedProperties: true });
      return db;
    })();
  }

  /**
   * Firestore can't hold arrays inside arrays (our flowchart edges are
   * [from, to] pairs), so each document is stored as JSON in `_json`, with
   * its top-level text, number and boolean fields copied alongside for queries.
   */
  private encode(data: object) {
    const fields: Record<string, unknown> = { _json: JSON.stringify(data) };
    for (const [key, value] of Object.entries(data)) {
      if (["string", "number", "boolean"].includes(typeof value)) fields[key] = value;
    }
    return fields;
  }

  private decode<T>(raw: Record<string, unknown> | undefined): T | null {
    if (!raw) return null;
    return (typeof raw._json === "string" ? JSON.parse(raw._json) : raw) as T;
  }

  async get<T>(collection: Collection, id: string) {
    const snap = await (await this.db).collection(collection).doc(id).get();
    return snap.exists ? this.decode<T>(snap.data()) : null;
  }

  async set<T extends object>(collection: Collection, id: string, data: T) {
    await (await this.db).collection(collection).doc(id).set(this.encode(data));
  }

  async remove(collection: Collection, id: string) {
    await (await this.db).collection(collection).doc(id).delete();
  }

  async list<T>(collection: Collection, field: string, value: string) {
    const snap = await (await this.db).collection(collection).where(field, "==", value).get();
    return snap.docs.map((d) => this.decode<T>(d.data())!);
  }

  async all<T>(collection: Collection) {
    const snap = await (await this.db).collection(collection).get();
    return snap.docs.map((d) => this.decode<T>(d.data())!);
  }
}

class FileStore implements Store {
  private file = path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "store.json");
  private data: Record<string, Record<string, unknown>>;

  constructor() {
    this.data = existsSync(this.file) ? JSON.parse(readFileSync(this.file, "utf8")) : {};
  }

  private flush() {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  async get<T>(collection: Collection, id: string) {
    const doc = this.data[collection]?.[id];
    return doc ? (structuredClone(doc) as T) : null;
  }

  async set<T extends object>(collection: Collection, id: string, data: T) {
    (this.data[collection] ??= {})[id] = JSON.parse(JSON.stringify(data));
    this.flush();
  }

  async remove(collection: Collection, id: string) {
    delete this.data[collection]?.[id];
    this.flush();
  }

  async list<T>(collection: Collection, field: string, value: string) {
    return Object.values(this.data[collection] ?? {})
      .filter((doc) => (doc as Record<string, unknown>)[field] === value)
      .map((doc) => structuredClone(doc) as T);
  }

  async all<T>(collection: Collection) {
    return Object.values(this.data[collection] ?? {}).map((doc) => structuredClone(doc) as T);
  }
}

const usingFirestore = Boolean(env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey);

const globalStore = globalThis as unknown as { __rosettaStore?: Store };
export const store: Store = (globalStore.__rosettaStore ??= usingFirestore ? new FirestoreStore() : new FileStore());
export const storeKind = usingFirestore ? "firestore" : "file";
