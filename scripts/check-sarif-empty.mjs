// Fails when any SARIF file in the directory has results. Used by the
// security workflow while the repository is private and code scanning
// cannot receive uploads.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2];
let total = 0;
for (const name of readdirSync(dir)) {
  if (!name.endsWith(".sarif")) continue;
  const sarif = JSON.parse(readFileSync(join(dir, name), "utf8"));
  for (const run of sarif.runs ?? []) {
    for (const r of run.results ?? []) {
      total++;
      const loc = r.locations?.[0]?.physicalLocation;
      console.error(`${r.ruleId}: ${loc?.artifactLocation?.uri}:${loc?.region?.startLine} ${r.message?.text ?? ""}`);
    }
  }
}
if (total) {
  console.error(`${total} CodeQL result(s)`);
  process.exit(1);
}
console.log("CodeQL: 0 results");
