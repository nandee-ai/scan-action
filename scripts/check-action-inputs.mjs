// action.yml must declare exactly the core's raw input keys plus the two
// action-only inputs; the template must map every key onto NANDEE_<KEY>.
// Keeps the three front ends from drifting apart.
import { readFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const inputsTs = readFileSync(`${root}core/src/inputs.ts`, "utf8");
const keys = /RAW_INPUT_KEYS\s*=\s*\[([^\]]*)\]/.exec(inputsTs)?.[1].match(/"([a-z_]+)"/g)?.map((k) => k.replace(/"/g, "")) ?? [];
if (!keys.length) throw new Error("RAW_INPUT_KEYS not found in core/src/inputs.ts");

const action = readFileSync(`${root}action.yml`, "utf8");
const inputsSection = action.slice(action.indexOf("\ninputs:\n"), action.indexOf("\noutputs:\n"));
const actionInputs = [...inputsSection.matchAll(/^  ([a-z_]+):\n    description:/gm)].map((m) => m[1]);
const actionOnly = ["scan_fork_prs", "github_token"];
const problems = [];
for (const k of keys) if (!actionInputs.includes(k)) problems.push(`action.yml is missing input ${k}`);
for (const k of actionInputs) if (!keys.includes(k) && !actionOnly.includes(k)) problems.push(`action.yml declares ${k}, which the core does not know`);

const template = readFileSync(`${root}gitlab/templates/scan.yml`, "utf8");
const legacy = readFileSync(`${root}gitlab/templates/legacy/Nandee.gitlab-ci.yml`, "utf8");
for (const k of keys) {
  if (k === "api_key") continue;
  const v = `NANDEE_${k.toUpperCase()}`;
  if (!template.includes(`${v}:`)) problems.push(`gitlab/templates/scan.yml does not map ${v}`);
  if (!legacy.includes(`${v}:`)) problems.push(`legacy template does not declare ${v}`);
}
if (template.includes("NANDEE_API_KEY:") || legacy.includes("NANDEE_API_KEY:")) problems.push("templates must not declare NANDEE_API_KEY (it is a masked CI/CD variable)");
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`inputs consistent (${keys.length} keys)`);
