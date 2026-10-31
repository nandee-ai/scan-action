// Bundles cli/src/main.ts into cli/bundle/main.js: the published npm package
// is one file with no runtime dependencies (the core and zod are inlined), so
// `npm install -g @nandee-ai/cli` pulls nothing else.
import { execFileSync } from "node:child_process";
import { chmodSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "cli/bundle");
rmSync(out, { recursive: true, force: true });
// ncc resolves @nandee-ai/ci-core through core/dist, so build the core first.
execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-b", "core"], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, [join(root, "node_modules/@vercel/ncc/dist/ncc/cli.js"), "build", "cli/src/main.ts", "-o", "cli/bundle", "--minify", "--no-source-map-register", "--license", "licenses.txt"], { cwd: root, stdio: "inherit" });
function prune(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      prune(p);
      if (readdirSync(p).length === 0) rmSync(p, { recursive: true });
    } else if (name.endsWith(".d.ts") || name.endsWith(".map")) rmSync(p);
  }
}
prune(out);
const main = join(out, "index.js");
writeFileSync(join(out, "main.js"), `#!/usr/bin/env node\nimport { main } from "./index.js";\nmain(process.argv.slice(2), { env: process.env, cwd: process.cwd(), stdout: (s) => process.stdout.write(s), stderr: (s) => process.stderr.write(s) }).then((code) => process.exit(code), (err) => { process.stderr.write(String(err) + "\\n"); process.exit(5); });\n`);
chmodSync(join(out, "main.js"), 0o755);
chmodSync(main, 0o755);
console.log("cli/bundle contains:", readdirSync(out).join(", "));
