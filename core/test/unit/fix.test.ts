import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exec } from "../../src/exec.js";
import { buildFixBranch, fixBranchName } from "../../src/fix/pr.js";
import { collectFixes } from "../../src/fix/request.js";
import { createMockNandeeApi } from "../../src/api/mock.js";
import { createLogger } from "../../src/log.js";
import { normalize } from "../../src/convert/normalize.js";
import { loadSourceFindings } from "../fixtures/index.js";
import type { Clock } from "../../src/api/poll.js";

const log = createLogger({ write: () => {} }, (t) => t);
const clock: Clock = { now: () => 0, sleep: async () => {}, random: () => 0 };
let repo: string;
let baseSha: string;

beforeAll(async () => {
  repo = await mkdtemp(path.join(os.tmpdir(), "fixrepo-"));
  await mkdir(path.join(repo, "app/src/main/java/com/acme/app"), { recursive: true });
  await writeFile(path.join(repo, "app/src/main/java/com/acme/app/Config.kt"), 'package com.acme.app\n\nobject Config {\n    const val API_KEY = "AIzaSyD-example"\n}\n');
  await mkdir(path.join(repo, ".github/workflows"), { recursive: true });
  await writeFile(path.join(repo, ".github/workflows/ci.yml"), "name: ci\n");
  const g = (args: string[]) => exec("git", args, { cwd: repo });
  await g(["init", "-q", "-b", "main"]);
  await g(["config", "user.email", "t@example.com"]);
  await g(["config", "user.name", "t"]);
  await g(["add", "."]);
  await g(["commit", "-q", "-m", "init"]);
  baseSha = (await g(["rev-parse", "HEAD"])).stdout.trim();
});
afterAll(() => rm(repo, { recursive: true, force: true }));

const goodPatch = `--- a/app/src/main/java/com/acme/app/Config.kt
+++ b/app/src/main/java/com/acme/app/Config.kt
@@ -2,4 +2,4 @@
 
 object Config {
-    const val API_KEY = "AIzaSyD-example"
+    val API_KEY: String get() = BuildConfig.API_KEY
 }
`;
const ciPatch = `--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -1 +1,2 @@
 name: ci
+on: pull_request_target
`;

describe("collectFixes", () => {
  it("uses embedded diffs, asks Nandee for the rest, and reports what it could not get", async () => {
    const findings = normalize(loadSourceFindings().map((item) => ({ kind: "source", item })));
    const api = createMockNandeeApi({ fixes: { 103: { diff: goodPatch, explanation: "upgrade" } } });
    const c = await collectFixes(api, { kind: "source", id: "s" }, findings.filter((f) => ["101", "103", "105"].includes(f.id)), clock, log);
    expect(c.patches.map((p) => p.finding.id)).toEqual(["101", "103"]);
    expect(c.unavailable.map((u) => u.finding.id)).toEqual(["105"]);
    expect(api.calls.filter((x) => x.method === "requestFix")).toHaveLength(2);
  });
});

describe("buildFixBranch (T-15, T-54)", () => {
  it("applies clean patches on a new branch from the base sha and refuses CI config changes", async () => {
    const findings = normalize(loadSourceFindings().map((item) => ({ kind: "source", item })));
    const plan = await buildFixBranch(repo, baseSha, "src_1", "https://app.nandee.ai/source-scans/src_1", [
      { finding: findings[0]!, diff: goodPatch, explanation: null },
      { finding: findings[1]!, diff: ciPatch, explanation: null },
      { finding: findings[2]!, diff: "garbage", explanation: null },
    ], log);
    try {
      expect(plan.branchName).toBe(fixBranchName("src_1", baseSha));
      expect(plan.branchName).toMatch(/^nandee\/fix-src_1-[0-9a-f]{8}$/);
      expect(plan.applied).toHaveLength(1);
      expect(plan.rejected.map((r) => r.reason)).toEqual([expect.stringContaining("CI configuration"), expect.stringContaining("does not apply")]);
      expect(plan.commitSha).toMatch(/^[0-9a-f]{40}$/);
      const head = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: plan.repoDir });
      expect(head.stdout.trim()).toBe(plan.branchName);
      const parent = await exec("git", ["rev-parse", "HEAD~1"], { cwd: plan.repoDir });
      expect(parent.stdout.trim()).toBe(baseSha);
      // The runner's checkout is untouched.
      expect(await readFile(path.join(repo, "app/src/main/java/com/acme/app/Config.kt"), "utf8")).toContain("AIzaSyD-example");
      const msg = await exec("git", ["log", "-1", "--format=%B"], { cwd: plan.repoDir });
      expect(msg.stdout).toContain("written by an AI agent");
    } finally {
      await plan.cleanup();
    }
  });
});
