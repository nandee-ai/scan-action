// Builds dist/index.js for the GitHub Action with ncc and drops the stray
// declaration files.  CI runs this and fails if dist/ differs from the
// commit (T-14: a tampered bundle cannot get in unnoticed).
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");

// ncc resolves @nandee-ai/ci-core through core/dist, so build the core first.
execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-b", "core"], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, [join(root, "node_modules/@vercel/ncc/dist/ncc/cli.js"), "build", "github-action/src/main.ts", "-o", "dist", "--minify", "--no-source-map-register", "--license", "licenses.txt"], {
  cwd: root,
  stdio: "inherit",
});

function prune(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      prune(p);
      if (readdirSync(p).length === 0) rmSync(p, { recursive: true });
    } else if (name.endsWith(".d.ts")) rmSync(p);
  }
}
prune(dist);
console.log("dist/ contains:", readdirSync(dist).join(", "));
