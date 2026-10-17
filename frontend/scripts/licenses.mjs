#!/usr/bin/env node
/**
 * Writes src/lib/licenses.json: every direct dependency of the frontend and
 * backend, with its version and licence as declared in its own package.json.
 * Run after changing dependencies: npm run licenses
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const out = [];
for (const app of ["frontend", "backend"]) {
  const pkg = JSON.parse(readFileSync(path.join(root, app, "package.json"), "utf8"));
  for (const [kind, deps] of [["runtime", pkg.dependencies ?? {}], ["development", pkg.devDependencies ?? {}]]) {
    for (const name of Object.keys(deps)) {
      const file = path.join(root, app, "node_modules", name, "package.json");
      const meta = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
      const license = typeof meta.license === "string" ? meta.license : meta.license?.type ?? "See package";
      const repo = typeof meta.repository === "string" ? meta.repository : meta.repository?.url ?? "";
      out.push({ name, version: meta.version ?? deps[name], license, app, kind, homepage: meta.homepage ?? repo.replace(/^git\+/, "").replace(/\.git$/, "") });
    }
  }
}
// One row per package: the same library used by both apps is listed once.
const merged = new Map();
for (const p of out) {
  const prev = merged.get(p.name);
  merged.set(p.name, prev ? { ...prev, app: prev.app === p.app ? prev.app : "both", kind: prev.kind === "runtime" || p.kind === "runtime" ? "runtime" : "development" } : p);
}
const list = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(path.join(root, "frontend", "src", "lib", "licenses.json"), `${JSON.stringify(list, null, 2)}\n`);
console.log(`Wrote ${list.length} packages.`);
