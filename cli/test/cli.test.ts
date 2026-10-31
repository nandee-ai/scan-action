import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { main, type CliIo } from "../src/main.js";
import { resolveGitContext, toHttpsRepoUrl } from "../src/ci-env.js";
import { createMockNandeeApi, exec, ExitCode } from "@nandee-ai/ci-core";

let ws: string;
const SHA = "0123456789abcdef0123456789abcdef01234567";
const KEY = "ci_cliclicliclicliclicli0001";

function io(env: Record<string, string | undefined> = {}, api?: CliIo["api"]): CliIo & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { env: { NANDEE_API_KEY: KEY, ...env }, cwd: ws, stdout: (s) => out.push(s), stderr: (s) => err.push(s), out, err, ...(api ? { api } : {}) };
}
const gitFlags = ["--repo-url", "https://github.com/acme/app", "--branch", "main", "--commit", SHA];

beforeAll(async () => {
  ws = await mkdtemp(path.join(os.tmpdir(), "cli-"));
  await writeFile(path.join(ws, "pubspec.yaml"), "name: app");
  await writeFile(path.join(ws, "app.apk"), "x");
});
afterAll(() => rm(ws, { recursive: true, force: true }));

describe("nandee CLI", () => {
  it("prints usage and version", async () => {
    const a = io();
    expect(await main(["--help"], a)).toBe(0);
    expect(a.out.join("")).toContain("Usage:");
    const b = io();
    expect(await main(["version"], b)).toBe(0);
    expect(b.out[0]).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it("refuses to run without NANDEE_API_KEY and has no flag for it", async () => {
    const a = io({ NANDEE_API_KEY: undefined });
    expect(await main(["scan", "--project-id", "p", ...gitFlags], a)).toBe(ExitCode.INVALID_INPUT);
    expect(a.err.join("")).toContain("NANDEE_API_KEY is not set");
    const b = io();
    expect(await main(["scan", "--api-key", KEY], b)).toBe(ExitCode.INVALID_INPUT);
    expect(b.err.join("")).toMatch(/Unknown option '--api-key'/);
  });

  it("runs with --mock, writes every output file and exits 1 on the gate", async () => {
    const a = io();
    const outDir = path.join(ws, "out");
    const code = await main(["scan", "--mock", "--project-id", "acme/app", ...gitFlags, "--sarif", "out/r.sarif", "--gitlab-dir", "out/gl", "--summary", "out/s.md", "--dotenv", "out/o.env", "--json", "out/r.json"], a);
    expect(code).toBe(ExitCode.GATE_FAILED);
    expect(a.out.join("")).toContain("Nandee security scan");
    const sarif = JSON.parse(await readFile(path.join(outDir, "r.sarif"), "utf8"));
    expect(sarif.version).toBe("2.1.0");
    expect(JSON.parse(await readFile(path.join(outDir, "gl/gl-sast-report.json"), "utf8")).vulnerabilities).toHaveLength(3);
    expect(await readFile(path.join(outDir, "o.env"), "utf8")).toContain("NANDEE_PASSED=false");
    expect(JSON.parse(await readFile(path.join(outDir, "r.json"), "utf8")).outputs.platform).toBe("flutter");
    if (process.platform !== "win32") expect((await stat(path.join(outDir, "o.env"))).mode & 0o777).toBe(0o600);
    expect(a.err.join("")).not.toContain(KEY);
  });

  it("passes with fail-on-severity none and maps input errors to exit 2", async () => {
    const api = createMockNandeeApi({ sourceFindings: [] });
    expect(await main(["scan", "--project-id", "p", ...gitFlags, "--fail-on-severity", "none"], io({}, api))).toBe(ExitCode.PASSED);
    const a = io({}, api);
    expect(await main(["scan", "--project-id", "p", ...gitFlags, "--scan-types", "dast"], a)).toBe(ExitCode.INVALID_INPUT);
    expect(a.err.join("")).toContain("artifact_path");
  });

  it("reads inputs from NANDEE_* environment variables", async () => {
    const api = createMockNandeeApi({ sourceFindings: [] });
    const a = io({ NANDEE_PROJECT_ID: "from-env", NANDEE_FAIL_ON_SEVERITY: "none" }, api);
    expect(await main(["scan", ...gitFlags], a)).toBe(ExitCode.PASSED);
    expect(api.lastSourceRequest?.projectTitle).toBe("from-env");
  });
});

describe("CI environment detection", () => {
  it("maps Bitrise, CircleCI, Azure DevOps and Jenkins variables", async () => {
    const b = await resolveGitContext({ BITRISE_IO: "true", GIT_REPOSITORY_URL: "git@github.com:acme/app.git", BITRISE_GIT_BRANCH: "f", BITRISE_GIT_COMMIT: SHA, BITRISE_PULL_REQUEST: "9", BITRISEIO_GIT_BRANCH_DEST: "main" }, ws, {});
    expect(b.source).toBe("Bitrise");
    expect(b.git).toMatchObject({ repoUrl: "https://github.com/acme/app.git", branch: "f", prNumber: 9, baseBranch: "main" });
    const c = await resolveGitContext({ CIRCLECI: "true", CIRCLE_REPOSITORY_URL: "https://github.com/acme/app", CIRCLE_BRANCH: "f", CIRCLE_SHA1: SHA, CIRCLE_PULL_REQUEST: "https://github.com/acme/app/pull/4" }, ws, {});
    expect(c.git.prNumber).toBe(4);
    const z = await resolveGitContext({ TF_BUILD: "True", BUILD_REPOSITORY_URI: "https://dev.azure.com/o/p/_git/r", BUILD_SOURCEBRANCH: "refs/heads/main", BUILD_SOURCEVERSION: SHA, SYSTEM_PULLREQUEST_PULLREQUESTID: "12", SYSTEM_PULLREQUEST_TARGETBRANCH: "refs/heads/main", SYSTEM_PULLREQUEST_SOURCEBRANCH: "refs/heads/f" }, ws, {});
    expect(z.git).toMatchObject({ branch: "f", baseBranch: "main", prNumber: 12 });
    const j = await resolveGitContext({ JENKINS_URL: "http://j", GIT_URL: "https://user:pw@github.com/acme/app.git", GIT_BRANCH: "origin/f", GIT_COMMIT: SHA, CHANGE_ID: "3", CHANGE_TARGET: "main" }, ws, {});
    expect(j.git.repoUrl).toBe("https://github.com/acme/app.git");
    expect(j.git.branch).toBe("f");
  });

  it("falls back to git and lets flags override", async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), "cligit-"));
    const g = (args: string[]) => exec("git", args, { cwd: repo });
    await g(["init", "-q", "-b", "main"]);
    await g(["config", "user.email", "t@e.com"]);
    await g(["config", "user.name", "t"]);
    await g(["remote", "add", "origin", "git@github.com:acme/app.git"]);
    await writeFile(path.join(repo, "a"), "a");
    await g(["add", "."]);
    await g(["commit", "-q", "-m", "i"]);
    const r = await resolveGitContext({}, repo, {});
    expect(r.source).toBe("git");
    expect(r.git.repoUrl).toBe("https://github.com/acme/app.git");
    expect(r.git.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect((await resolveGitContext({}, repo, { branch: "x", pr: "7" })).git).toMatchObject({ branch: "x", prNumber: 7 });
    await rm(repo, { recursive: true, force: true });
  });

  it("converts ssh URLs and strips credentials", () => {
    expect(toHttpsRepoUrl("git@gitlab.com:g/p.git")).toBe("https://gitlab.com/g/p.git");
    expect(toHttpsRepoUrl("ssh://git@github.com/a/b")).toBe("https://github.com/a/b");
    expect(toHttpsRepoUrl("https://x:y@github.com/a/b")).toBe("https://github.com/a/b");
  });
});
