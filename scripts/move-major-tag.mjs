// Moves the floating major tag (v1) to the released commit, using the GitHub
// API with the job's token: no git credentials touch the disk. Only the
// release workflow runs this; tag protection keeps people from doing it by hand.
import { execFileSync } from "node:child_process";
const [version, sha] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? "") || !/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("usage: move-major-tag <X.Y.Z> <sha>");
const major = `v${version.split(".")[0]}`;
const repo = process.env.GITHUB_REPOSITORY;
if (!repo) throw new Error("GITHUB_REPOSITORY is not set");
const gh = (args) => execFileSync("gh", args, { stdio: ["ignore", "pipe", "inherit"] }).toString().trim();
let exists = true;
try { gh(["api", `repos/${repo}/git/ref/tags/${major}`]); } catch { exists = false; }
if (exists) gh(["api", "-X", "PATCH", `repos/${repo}/git/refs/tags/${major}`, "-f", `sha=${sha}`, "-F", "force=true"]);
else gh(["api", "-X", "POST", `repos/${repo}/git/refs`, "-f", `ref=refs/tags/${major}`, "-f", `sha=${sha}`]);
console.log(`${major} -> ${sha}`);
