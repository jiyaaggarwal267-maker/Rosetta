#!/usr/bin/env node
/**
 * Creates a ready-to-show demo workspace on any Rosetta server: a CMO, a
 * manager, an engineer, a senior dev and an intern, three explained changes,
 * comments, a question and notifications. Prints every login.
 *
 *   npm run demo                                  against http://localhost:4000
 *   npm run demo -- https://rosetta-api.vercel.app
 *
 * Emails use @demo.rosetta.dev, which Rosetta never sends mail to.
 */
const api = (process.argv[2] || process.env.API_URL || "http://localhost:4000").replace(/\/$/, "");
const stamp = Date.now().toString(36);
const password = `demo-${Math.random().toString(36).slice(2, 8)}-cmo`;

async function call(method, path, body, token) {
  const res = await fetch(api + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data.message ?? data.code ?? ""}`);
  return data;
}

const health = await call("GET", "/api/health");
console.log(`Server: ${api} (store: ${health.store}${health.warnings?.length ? `, ${health.warnings.length} warning(s)` : ""})`);
for (const w of health.warnings ?? []) console.log(`  ! ${w}`);

const cmo = await call("POST", "/api/auth/signup", {
  name: "Kavya Rao",
  email: `kavya.${stamp}@demo.rosetta.dev`,
  password,
  role: "cmo",
  orgName: "Acme Retail",
  title: "Chief Marketing Officer",
  focus: ["timelines", "user-impact"],
  language: "en",
  acceptTerms: true,
});
const seed = await call("POST", "/api/demo/seed", null, cmo.token);

console.log("\nDemo workspace: Acme Retail\n");
console.log(`  CMO          kavya.${stamp}@demo.rosetta.dev   password: ${password}`);
for (const l of seed.logins) console.log(`  ${l.role.padEnd(12)} ${l.email.padEnd(42)} password: ${seed.password}`);
console.log("\nLog in at the frontend with any of these. Each person sees their own version.");
