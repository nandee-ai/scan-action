// Release tag vX.Y.Z must equal the version in every package and TOOL_VERSION.
import { readFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const tag = process.argv[2] ?? "";
const m = /^v(\d+\.\d+\.\d+)$/.exec(tag);
if (!m) throw new Error(`not a release tag: ${tag}`);
const version = m[1];
const problems = [];
for (const p of ["core", "cli", "github-action", "gitlab", "npm/nandee"]) {
  const v = JSON.parse(readFileSync(`${root}${p}/package.json`, "utf8")).version;
  if (v !== version) problems.push(`${p}/package.json is ${v}`);
}
const tool = /TOOL_VERSION\s*=\s*"([^"]+)"/.exec(readFileSync(`${root}core/src/run.ts`, "utf8"))?.[1];
if (tool !== version) problems.push(`core/src/run.ts TOOL_VERSION is ${tool}`);
if (!readFileSync(`${root}CHANGELOG.md`, "utf8").includes(`## ${version}`)) problems.push(`CHANGELOG.md has no "## ${version}" section`);
if (problems.length) {
  console.error(`tag ${tag} does not match:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`version=${version}`);
