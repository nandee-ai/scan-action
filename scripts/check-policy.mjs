// Repo policy checks that ESLint can't express.  Run in CI and `npm run lint`.
//  - T-53: pull_request_target must not appear in examples or READMEs
//          (except in the one "don't do this" warning, marked with DONT-USE).
//  - T-10: no `shell: true` anywhere in source.
//  - Every example workflow declares a `permissions:` block (T-50).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const problems = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

for (const file of walk(root)) {
  const rel = file.slice(root.length);
  const text = readFileSync(file, "utf8");
  if (/\.(md|yml|yaml)$/.test(rel) && !rel.startsWith("THREAT_MODEL")) {
    for (const [i, line] of text.split("\n").entries()) {
      if (line.includes("pull_request_target") && !line.includes("DONT-USE")) {
        problems.push(`${rel}:${i + 1}: pull_request_target (T-53)`);
      }
    }
  }
  if (/\.(ts|mjs|js)$/.test(rel) && rel !== "scripts/check-policy.mjs" && /shell:\s*true/.test(text)) {
    problems.push(`${rel}: shell: true (T-10)`);
  }
  if (rel.startsWith("examples/github/") && !/^\s*permissions:/m.test(text)) {
    problems.push(`${rel}: example without a permissions: block (T-50)`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("policy checks passed");
