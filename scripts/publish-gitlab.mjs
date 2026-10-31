// Assembles the gitlab.com/nandee-ai/scan project tree from this repo and
// pushes it as a tag (which publishes to the CI/CD Catalog) and to main.
//   templates/        from gitlab/templates, image pinned by digest
//   .gitlab-ci.yml    from gitlab/mirror
//   README.md, LICENSE, CHANGELOG.md, selftest/
// The token is passed to git through environment config, never argv.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { VERSION, DIGEST, DIGEST_GIT, GITLAB_MIRROR_TOKEN, GITLAB_PROJECT } = process.env;
for (const [k, v] of Object.entries({ VERSION, DIGEST, DIGEST_GIT, GITLAB_MIRROR_TOKEN, GITLAB_PROJECT })) if (!v) throw new Error(`${k} is not set`);
if (!/^\d+\.\d+\.\d+$/.test(VERSION) || !/^sha256:[0-9a-f]{64}$/.test(DIGEST) || !/^sha256:[0-9a-f]{64}$/.test(DIGEST_GIT)) throw new Error("bad VERSION or DIGEST");

const root = new URL("..", import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), "nandee-gitlab-"));
const git = (args, env = {}) => execFileSync("git", args, { cwd: work, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: "0" } });

try {
  mkdirSync(join(work, "templates/legacy"), { recursive: true });
  const pinned = (text) => text
    .replace(/ghcr\.io\/nandee-ai\/scan:1-git/g, `ghcr.io/nandee-ai/scan:${VERSION}-git@${DIGEST_GIT}`)
    .replace(/ghcr\.io\/nandee-ai\/scan:1"/g, `ghcr.io/nandee-ai/scan:${VERSION}@${DIGEST}"`);
  writeFileSync(join(work, "templates/scan.yml"), pinned(readFileSync(`${root}gitlab/templates/scan.yml`, "utf8")));
  writeFileSync(join(work, "templates/legacy/Nandee.gitlab-ci.yml"), pinned(readFileSync(`${root}gitlab/templates/legacy/Nandee.gitlab-ci.yml`, "utf8")));
  cpSync(`${root}gitlab/mirror/.gitlab-ci.yml`, join(work, ".gitlab-ci.yml"));
  cpSync(`${root}gitlab/README.md`, join(work, "README.md"));
  cpSync(`${root}LICENSE`, join(work, "LICENSE"));
  cpSync(`${root}CHANGELOG.md`, join(work, "CHANGELOG.md"));
  cpSync(`${root}gitlab/mirror/selftest`, join(work, "selftest"), { recursive: true });

  const remote = `https://gitlab.com/${GITLAB_PROJECT}.git`;
  const header = `AUTHORIZATION: basic ${Buffer.from(`oauth2:${GITLAB_MIRROR_TOKEN}`).toString("base64")}`;
  const auth = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://gitlab.com/.extraheader", GIT_CONFIG_VALUE_0: header };
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.name", "nandee-release-bot"]);
  git(["config", "user.email", "release@nandee.ai"]);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", `release ${VERSION}\n\nFrom github.com/nandee-ai/scan-action v${VERSION}; image ${DIGEST}`]);
  git(["tag", "-a", `${VERSION}`, "-m", `v${VERSION}`]);
  git(["push", "--quiet", "--force", "--", remote, "HEAD:refs/heads/main"], auth);
  git(["push", "--quiet", "--", remote, `refs/tags/${VERSION}`], auth);
  console.log(`pushed ${GITLAB_PROJECT} main and tag ${VERSION}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
