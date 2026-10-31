import { describe, expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { fromActionsContext, gitContextFromGitHub, type GhContextLike } from "../src/context.js";
import { encodeSarif, fixPrBody, openFixPullRequest, renderFixSection, upsertStickyComment, uploadSarif, type OctokitLike } from "../src/reporters/github.js";
import { COMMENT_MARKER, createLogger, Secret, type FixBranchPlan } from "@nandee-ai/ci-core";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const HEAD = "fedcba9876543210fedcba9876543210fedcba98";
const base: GhContextLike = {
  eventName: "push", sha: SHA, ref: "refs/heads/main", serverUrl: "https://github.com", runId: 42,
  repo: { owner: "Acme", repo: "App" },
  payload: { repository: { private: true, html_url: "https://github.com/Acme/App" } },
};
const pr = (head: GhContextLike["payload"]["pull_request"] extends infer T ? (T extends undefined ? never : T)["head"]["repo"] : never): GhContextLike => ({
  ...base, eventName: "pull_request", ref: "refs/pull/7/merge",
  payload: { ...base.payload, pull_request: { number: 7, head: { sha: HEAD, ref: "feature", repo: head }, base: { ref: "main", repo: { full_name: "Acme/App" } } } },
});
const lines: string[] = [];
const log = createLogger({ write: (l, m) => lines.push(`${l}:${m}`) }, (t) => t);

describe("gitContextFromGitHub (T-03)", () => {
  it("push: branch, sha, no PR", () => {
    const g = gitContextFromGitHub(base);
    expect(g).toMatchObject({ branch: "main", commitSha: SHA, prNumber: null, isFork: false, isPublicRepo: false, isPullRequest: false, sarifRef: "refs/heads/main", fixBase: "main", runUrl: "https://github.com/Acme/App/actions/runs/42" });
  });
  it("same-repo PR: head sha and branch, baseline from base", () => {
    const g = gitContextFromGitHub(pr({ full_name: "acme/app", fork: false, html_url: "https://github.com/Acme/App" }));
    expect(g).toMatchObject({ commitSha: HEAD, branch: "feature", prNumber: 7, baseBranch: "main", isFork: false, sarifRef: "refs/pull/7/head", fixBase: "feature" });
  });
  it("fork PR: flagged, fix base disabled, repo URL is the fork", () => {
    const g = gitContextFromGitHub(pr({ full_name: "mallory/App", fork: true, html_url: "https://github.com/mallory/App" }));
    expect(g.isFork).toBe(true);
    expect(g.fixBase).toBeNull();
    expect(g.repoUrl).toBe("https://github.com/mallory/App");
    expect(gitContextFromGitHub(pr(null)).isFork).toBe(true);
  });
  it("narrows a raw payload and ignores a malformed pull_request", () => {
    const rawCtx = { eventName: "pull_request", sha: SHA, ref: "r", serverUrl: "https://github.com", runId: 1, repo: { owner: "a", repo: "b" } };
    const good = fromActionsContext({ ...rawCtx, payload: { repository: { private: false, html_url: "https://github.com/a/b", extra: 1 }, pull_request: { number: 3, head: { sha: HEAD, ref: "f", repo: { fork: true, full_name: "m/b" } }, base: { ref: "main", repo: { full_name: "a/b" } } } } });
    expect(good.payload.pull_request?.head.repo).toEqual({ fork: true, full_name: "m/b" });
    expect(good.payload.repository).toEqual({ private: false, html_url: "https://github.com/a/b" });
    const bad = fromActionsContext({ ...rawCtx, payload: { pull_request: { number: "3", head: "x" } } });
    expect(bad.payload.pull_request).toBeUndefined();
    expect(gitContextFromGitHub(bad).isPullRequest).toBe(false);
  });
  it("public repo detection", () => {
    expect(gitContextFromGitHub({ ...base, payload: { repository: { private: false } } }).isPublicRepo).toBe(true);
  });
});

function fakeOctokit(over: Partial<{ comments: Array<{ id: number; body: string }>; failWith: number }> = {}) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const fail = () => {
    if (over.failWith) throw Object.assign(new Error("nope"), { status: over.failWith });
  };
  const ok: OctokitLike = {
    rest: {
      codeScanning: { async uploadSarif(p) { fail(); calls.push({ fn: "uploadSarif", args: p }); return { data: { id: "u1" } }; } },
      issues: {
        async listComments(p) { fail(); calls.push({ fn: "listComments", args: p }); return { data: over.comments ?? [] }; },
        async updateComment(p) { calls.push({ fn: "updateComment", args: p }); },
        async createComment(p) { calls.push({ fn: "createComment", args: p }); },
      },
      pulls: { async create(p) { fail(); calls.push({ fn: "createPR", args: p }); return { data: { html_url: "https://github.com/Acme/App/pull/8", number: 8 } }; } },
    },
  };
  return { ok, calls };
}

describe("reporters", () => {
  it("uploads gzipped base64 SARIF to the PR head ref", async () => {
    const { ok, calls } = fakeOctokit();
    const sarif = { version: "2.1.0", runs: [] };
    expect(await uploadSarif(ok, { owner: "Acme", repo: "App" }, { sarif, commitSha: HEAD, ref: "refs/pull/7/head", workspace: "/w" }, log)).toBe(true);
    const p = calls[0]!.args as { sarif: string; ref: string; commit_sha: string };
    expect(JSON.parse(gunzipSync(Buffer.from(p.sarif, "base64")).toString())).toEqual(sarif);
    expect(p.ref).toBe("refs/pull/7/head");
    expect(encodeSarif(sarif)).toBe(p.sarif);
  });

  it("a 403 on upload is a warning naming the permission, not a failure", async () => {
    const { ok } = fakeOctokit({ failWith: 403 });
    expect(await uploadSarif(ok, { owner: "a", repo: "b" }, { sarif: {}, commitSha: SHA, ref: "refs/heads/main", workspace: "/w" }, log)).toBe(false);
    expect(lines.at(-1)).toContain("security-events: write");
  });

  it("updates the existing marked comment instead of creating a second one", async () => {
    const { ok, calls } = fakeOctokit({ comments: [{ id: 1, body: "unrelated" }, { id: 2, body: `${COMMENT_MARKER}\nold` }] });
    await upsertStickyComment(ok, { owner: "a", repo: "b" }, 7, `${COMMENT_MARKER}\nnew`, log);
    expect(calls.map((c) => c.fn)).toEqual(["listComments", "updateComment"]);
    expect((calls[1]!.args as { comment_id: number }).comment_id).toBe(2);
    const fresh = fakeOctokit();
    await upsertStickyComment(fresh.ok, { owner: "a", repo: "b" }, 7, `${COMMENT_MARKER}\nnew`, log);
    expect(fresh.calls.map((c) => c.fn)).toEqual(["listComments", "createComment"]);
  });

  it("refuses a body without the marker", async () => {
    await expect(upsertStickyComment(fakeOctokit().ok, { owner: "a", repo: "b" }, 7, "no marker", log)).rejects.toThrow(/marker/);
  });

  it("fix PR: never targets the source branch, and does nothing without a commit (T-15)", async () => {
    const plan: FixBranchPlan = { branchName: "nandee/fix-s-01234567", baseSha: SHA, applied: [], rejected: [], repoDir: "/nowhere", commitSha: null, cleanup: async () => {} };
    const args = { base: "feature", token: new Secret("ghs_tokentokentoken"), serverUrl: "https://github.com", scanId: "s", reportUrl: "https://app.nandee.ai/source-scans/s" };
    expect(await openFixPullRequest(fakeOctokit().ok, { owner: "a", repo: "b" }, plan, args, log)).toBeNull();
    const onSource = { ...plan, branchName: "feature", commitSha: SHA, applied: [{ finding: { title: "t", severity: "high" } as never, diff: "", explanation: null }] };
    await expect(openFixPullRequest(fakeOctokit().ok, { owner: "a", repo: "b" }, onSource, args, log)).rejects.toThrow(/source branch/);
  });

  it("renders fix PR body and comment section with escaped text and neutralised fences", () => {
    const finding = { title: "Evil [x](https://evil.example) @everyone", severity: "high" } as never;
    const plan: FixBranchPlan = { branchName: "b", baseSha: SHA, applied: [{ finding, diff: "d", explanation: "<script>" }], rejected: [{ patch: { finding, diff: "", explanation: null }, reason: "no" }], repoDir: "", commitSha: SHA, cleanup: async () => {} };
    const body = fixPrBody(plan, "s", "https://app.nandee.ai/source-scans/s");
    expect(body).not.toContain("](https://evil");
    expect(body).not.toContain("<script>");
    expect(body).toContain("Not applied");
    const section = renderFixSection([{ finding, diff: "--- a\n+++ b\n```\nescape me\n```", explanation: null }]);
    expect(section.match(/```/g)?.length).toBe(2);
  });
});
