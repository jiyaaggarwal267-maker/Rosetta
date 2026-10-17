#!/usr/bin/env node
/**
 * Copies the local file store (.data/store.json) into Firestore, in the same
 * format the app writes: the whole document as JSON in `_json`, with its
 * top-level text, number and boolean fields copied alongside for queries.
 *
 *   npm run migrate              dry run: shows what would be copied
 *   npm run migrate -- --write   copies; documents already in Firestore are kept
 *   npm run migrate -- --write --overwrite   replaces those too
 *
 * Reads FIREBASE_* from .env.local. DATA_DIR picks a different store folder.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const overwrite = args.has("--overwrite");

const envFile = path.join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const file = path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "store.json");
if (!existsSync(file)) {
  console.error(`No file store at ${file}. Nothing to migrate.`);
  process.exit(1);
}

const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
  console.error("Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env.local first.");
  process.exit(1);
}

const encode = (data) => {
  const fields = { _json: JSON.stringify(data) };
  for (const [key, value] of Object.entries(data)) {
    if (["string", "number", "boolean"].includes(typeof value)) fields[key] = value;
  }
  return fields;
};

const data = JSON.parse(readFileSync(file, "utf8"));
const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }));

console.log(`${write ? "Copying" : "Dry run:"} ${file} → Firestore project ${projectId}\n`);

let copied = 0;
let kept = 0;
for (const [collection, docs] of Object.entries(data)) {
  const entries = Object.entries(docs ?? {});
  let c = 0;
  let k = 0;
  // Firestore batches hold at most 500 writes.
  for (let i = 0; i < entries.length; i += 400) {
    const chunk = entries.slice(i, i + 400);
    const refs = chunk.map(([id]) => db.collection(collection).doc(id));
    const existing = overwrite ? [] : await db.getAll(...refs);
    const batch = db.batch();
    chunk.forEach(([, doc], n) => {
      if (!overwrite && existing[n]?.exists) return void k++;
      c++;
      if (write) batch.set(refs[n], encode(doc));
    });
    if (write) await batch.commit();
  }
  copied += c;
  kept += k;
  console.log(`  ${collection.padEnd(13)} ${String(c).padStart(4)} to copy${k ? `, ${k} already there (kept)` : ""}`);
}

console.log(`\n${write ? "Copied" : "Would copy"} ${copied} documents${kept ? `, kept ${kept} existing` : ""}.`);
if (!write) console.log("Run again with --write to copy.");
