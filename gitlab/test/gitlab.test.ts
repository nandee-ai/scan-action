import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { main, type RunnerIo } from "../src/main.js";
import { gitContextFromGitLab } from "../src/ci-env.js";
import { fixMrDescription, openFixMergeRequest, renderFixSection, upsertMergeRequestNote, type GitLabApiRef } from "../src/reporters/gitlab.js";
import { COMMENT_MARKER, createLogger, createMockNandeeApi, ExitCode, Secret, type FixBranchPlan, type HttpClient } from "@nandee-ai/ci-core";
import { loadBinaryFindings } from "../../core/test/fixtures/index.js";

// GitLab-hosted source cannot be SAST-scanned today (OPEN_QUESTIONS Q2), so the runner tests scan an artifact.
const binaryFindings = loadBinaryFindings();
const dast = { NANDEE_SCAN_TYPES: "dast", NANDEE_ARTIFACT_PATH: "app.apk" };

let ws: string;
const SHA = "0123456789abcdef0123456789abcdef01234567";
const HEAD = "fedcba9876543210fedcba9876543210fedcba98";
const KEY = "ci_gitlabgitlabgitlabgitlab0001";
const GL_TOKEN = "glpat-gitlabtokentokentoken";

const branchEnv = {
  CI: "true", CI_PROJECT_ID: "123", CI_PROJECT_URL: "https://gitlab.com/acme/app", CI_PROJECT_VISIBILITY: "private", CI_COMMIT_SHA: SHA,
  CI_COMMIT_BRANCH: "main", CI_COMMIT_REF_NAME: "main", CI_JOB_URL: "https://gitlab.com/acme/app/-/jobs/9", CI_API_V4_URL: "https://gitlab.com/api/v4", CI_SERVER_URL: "https://gitlab.com",
};
const mrEnv = {
  ...branchEnv, CI_COMMIT_BRANCH: undefined, CI_COMMIT_REF_NAME: "refs/merge-requests/7/head", CI_PIPELINE_SOURCE: "merge_request_event", CI_MERGE_REQUEST_IID: "7",
  CI_MERGE_REQUEST_SOURCE_BRANCH_NAME: "feature", CI_MERGE_REQUEST_SOURCE_BRANCH_SHA: HEAD, CI_MERGE_REQUEST_TARGET_BRANCH_NAME: "main", CI_MERGE_REQUEST_SOURCE_PROJECT_ID: "123",
};
const forkEnv = { ...mrEnv, CI_MERGE_REQUEST_SOURCE_PROJECT_ID: "999", CI_MERGE_REQUEST_SOURCE_PROJECT_URL: "https://gitlab.com/mallory/app" };

const lines: string[] = [];
const log = createLogger({ write: (l, m) => lines.push(`${l}:${m}`) }, (t) => t);

function io(env: Record<string, string | undefined>, over: Partial<RunnerIo> = {}): RunnerIo & { err: string[] } {
  const err: string[] = [];
  return { env: { NANDEE_API_KEY: KEY, NANDEE_PROJECT_ID: "acme/app", ...env }, cwd: ws, stderr: (s) => err.push(s), err, ...over };
}

/** A fake GitLab REST API behind the core HttpClient interface. */
function fakeGitLab(notes: Array<{ id: number; body: string }> = []) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const http: HttpClient = {
    async json(req, schema) {
      calls.push({ method: req.method, path: req.url.pathname + req.url.search, body: req.body });
      if (req.method === "GET") return schema.parse(notes);
      if (req.url.pathname.endsWith("/merge_requests")) return schema.parse({ iid: 8, web_url: "https://gitlab.com/acme/app/-/merge_requests/8" });
      return schema.parse({ id: 77 });
    },
    async putBytes() {},
  };
  const gl: GitLabApiRef = { http, apiV4Url: "https://gitlab.com/api/v4", projectId: "123", token: new Secret(GL_TOKEN) };
  return { gl, http, calls };
}

beforeAll(async () => {
  ws = await mkdtemp(path.join(os.tmpdir(), "gl-"));
  await writeFile(path.join(ws, "pubspec.yaml"), "name: app");
  await writeFile(path.join(ws, "app.apk"), "PK\u0003\u0004 not really an apk");
});
afterAll(() => rm(ws, { recursive: true, force: true }));

describe("gitContextFromGitLab (T-03, T-33)", () => {
  it("branch pipeline", () => {
    expect(gitContextFromGitLab(branchEnv)).toMatchObject({ repoUrl: "https://gitlab.com/acme/app", branch: "main", commitSha: SHA, prNumber: null, isFork: false, isPublicRepo: false, isMergeRequest: false, fixBase: "main", projectId: "123" });
  });
  it("merge request pipeline uses the source branch head, not the merge commit", () => {
    const g = gitContextFromGitLab(mrEnv);
    expect(g).toMatchObject({ branch: "feature", commitSha: HEAD, prNumber: 7, baseBranch: "main", isFork: false, isMergeRequest: true, mergeRequestIid: 7, fixBase: "feature" });
  });
  it("fork MR: flagged, fix base disabled, repo URL is the fork", () => {
    const g = gitContextFromGitLab(forkEnv);
    expect(g.isFork).toBe(true);
    expect(g.fixBase).toBeNull();
    expect(g.repoUrl).toBe("https://gitlab.com/mallory/app");
  });
  it("public project detection and malformed IIDs", () => {
    expect(gitContextFromGitLab({ ...branchEnv, CI_PROJECT_VISIBILITY: "public" }).isPublicRepo).toBe(true);
    expect(gitContextFromGitLab({ ...mrEnv, CI_MERGE_REQUEST_IID: "7; rm -rf /" }).isMergeRequest).toBe(false);
  });
});

describe("reporters", () => {
  it("updates the existing marked note instead of posting a second one", async () => {
    const { gl, calls } = fakeGitLab([{ id: 1, body: "unrelated" }, { id: 2, body: `${COMMENT_MARKER}\nold` }]);
    await upsertMergeRequestNote(gl, 7, `${COMMENT_MARKER}\nnew`, log);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /api/v4/projects/123/merge_requests/7/notes?per_page=100&page=1", "PUT /api/v4/projects/123/merge_requests/7/notes/2"]);
    const fresh = fakeGitLab();
    await upsertMergeRequestNote(fresh.gl, 7, `${COMMENT_MARKER}\nnew`, log);
    expect(fresh.calls[1]).toMatchObject({ method: "POST", path: "/api/v4/projects/123/merge_requests/7/notes" });
  });

  it("refuses a note without the marker, and a failure is a warning naming the scope", async () => {
    await expect(upsertMergeRequestNote(fakeGitLab().gl, 7, "no marker", log)).rejects.toThrow(/marker/);
    const failing: HttpClient = { async json() { throw new Error("403 Forbidden"); }, async putBytes() {} };
    expect(await upsertMergeRequestNote({ ...fakeGitLab().gl, http: failing }, 7, `${COMMENT_MARKER}\nx`, log)).toBe(false);
    expect(lines.at(-1)).toContain("api");
  });

  it("fix MR: never targets the source branch, nothing without a commit (T-15)", async () => {
    const plan: FixBranchPlan = { branchName: "nandee/fix-s-01234567", baseSha: SHA, applied: [], rejected: [], repoDir: "/nowhere", commitSha: null, cleanup: async () => {} };
    const args = { base: "feature", serverUrl: "https://gitlab.com", projectUrl: "https://gitlab.com/acme/app", scanId: "s", reportUrl: "https://app.nandee.ai/source-scans/s" };
    expect(await openFixMergeRequest(fakeGitLab().gl, plan, args, log)).toBeNull();
    const onSource = { ...plan, branchName: "feature", commitSha: SHA, applied: [{ finding: { title: "t", severity: "high" } as never, diff: "", explanation: null }] };
    await expect(openFixMergeRequest(fakeGitLab().gl, onSource, args, log)).rejects.toThrow(/source branch/);
  });

  it("renders the MR description and comment section with escaped text and neutralised fences", () => {
    const finding = { title: "Evil [x](https://evil.example) @everyone", severity: "high" } as never;
    const plan: FixBranchPlan = { branchName: "b", baseSha: SHA, applied: [{ finding, diff: "d", explanation: "<script>" }], rejected: [], repoDir: "", commitSha: SHA, cleanup: async () => {} };
    const body = fixMrDescription(plan, "s", "https://app.nandee.ai/source-scans/s");
    expect(body).not.toContain("](https://evil");
    expect(body).not.toContain("<script>");
    const section = renderFixSection([{ finding, diff: "--- a\n+++ b\n```\nescape me\n```", explanation: null }]);
    expect(section.match(/```/g)?.length).toBe(2);
  });
});

describe("runner", () => {
  it("skips fork MRs by default with passed=unknown and exit 0 (T-03)", async () => {
    const a = io(forkEnv);
    expect(await main(a)).toBe(ExitCode.PASSED);
    expect(a.err.join("")).toContain("from a fork");
    expect(await readFile(path.join(ws, "nandee.env"), "utf8")).toContain("NANDEE_PASSED=unknown");
  });

  it("fails fast without NANDEE_API_KEY and never prints the key", async () => {
    const a = io({ ...branchEnv, NANDEE_API_KEY: undefined });
    expect(await main(a)).toBe(ExitCode.INVALID_INPUT);
    expect(a.err.join("")).toContain("NANDEE_API_KEY is not set");
  });

  it("runs a branch scan, writes every report with mode 0600 and gates on severity", async () => {
    const api = createMockNandeeApi({ binaryFindings, pollsUntilDone: 1 });
    const out = path.join(ws, "reports");
    const a = io({ ...branchEnv, ...dast, NANDEE_OUTPUT_DIR: "reports", NANDEE_FAIL_ON_SEVERITY: "critical", NANDEE_DEBUG: "true" }, { api });
    const code = await main(a);
    const text = a.err.join("");
    expect(text).not.toContain(KEY);
    for (const f of ["gl-sast-report.json", "gl-dependency-scanning-report.json", "nandee.env", "nandee-summary.md", "nandee.sarif"]) {
      expect(((await stat(path.join(out, f))).mode & 0o777).toString(8)).toBe("600");
    }
    const sast = z.object({ version: z.string(), vulnerabilities: z.array(z.unknown()) }).parse(JSON.parse(await readFile(path.join(out, "gl-sast-report.json"), "utf8")));
    expect(sast.vulnerabilities.length).toBeGreaterThan(0);
    expect(text).toContain("app.apk");
    const env = await readFile(path.join(out, "nandee.env"), "utf8");
    expect(env).toMatch(/^NANDEE_SCAN_ID=/m);
    expect(env).toContain(`NANDEE_PASSED=${code === 0 ? "true" : "false"}`);
    expect([ExitCode.PASSED, ExitCode.GATE_FAILED]).toContain(code);
  });

  it("posts the MR note with the GitLab token and reaches GitLab only through the allow-listed client", async () => {
    const api = createMockNandeeApi({ binaryFindings, pollsUntilDone: 1 });
    const fake = fakeGitLab();
    const a = io({ ...mrEnv, ...dast, NANDEE_GITLAB_TOKEN: GL_TOKEN, NANDEE_FAIL_ON_SEVERITY: "none" }, { api, gitlabHttp: fake.http });
    expect(await main(a)).toBe(ExitCode.PASSED);
    expect(fake.calls.map((c) => c.method)).toEqual(["GET", "POST"]);
    expect(JSON.stringify(fake.calls[1]!.body)).toContain(COMMENT_MARKER);
    expect(a.err.join("")).not.toContain(GL_TOKEN);
  });

  it("without a GitLab token the MR note is skipped but the gate still decides", async () => {
    const api = createMockNandeeApi({ binaryFindings, pollsUntilDone: 1 });
    const a = io({ ...mrEnv, ...dast, NANDEE_FAIL_ON_SEVERITY: "low", NANDEE_BASELINE_MODE: "false" }, { api });
    expect(await main(a)).toBe(ExitCode.GATE_FAILED);
    expect(a.err.join("")).toContain("NANDEE_GITLAB_TOKEN not set");
  });
});
