// Bundles gitlab/src/main.ts into gitlab/dist/index.js for the container
// image.  Unlike the GitHub Action bundle this one is not committed: the
// image build runs it from the lockfile (T-14 is covered by the image
// digest, SBOM and provenance instead).
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "gitlab/dist");

execFileSync(process.execPath, [join(root, "node_modules/@vercel/ncc/dist/ncc/cli.js"), "build", "gitlab/src/main.ts", "-o", "gitlab/dist", "--minify", "--no-source-map-register", "--license", "licenses.txt"], {
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
console.log("gitlab/dist contains:", readdirSync(dist).join(", "));
