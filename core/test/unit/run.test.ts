import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runScan } from "../../src/run.js";
import { parseInputs, type GitContext } from "../../src/inputs.js";
import { createMockNandeeApi } from "../../src/api/mock.js";
import { createLogger, type LogSink } from "../../src/log.js";
import { toDotenv, toOutputs } from "../../src/outputs.js";
import { ApiError, AuthError, InputError, TimeoutError } from "../../src/errors.js";
import type { Clock } from "../../src/api/poll.js";
import type { NandeeApi } from "../../src/api/types.js";
import { loadBinaryFindings, loadSourceFindings } from "../fixtures/index.js";

let ws: string;
const lines: string[] = [];
const sink: LogSink = { write: (l, m) => lines.push(`${l}:${m}`) };
const log = createLogger(sink, (t) => t);
const clock: Clock = { now: () => 0, sleep: async () => {}, random: () => 0 };
const git: GitContext = { repoUrl: "https://github.com/acme/app", branch: "feature", commitSha: "0123456789abcdef0123456789abcdef01234567", prNumber: 5, baseBranch: "main", isFork: false, isPublicRepo: false, runUrl: "https://ci/run/1" };
const raw = { api_key: "ci_abcdefghijklmnopqrstuvwxyz", project_id: "acme/app" };

beforeAll(async () => {
  ws = await mkdtemp(path.join(os.tmpdir(), "run-"));
  await mkdir(path.join(ws, "app"), { recursive: true });
  await writeFile(path.join(ws, "settings.gradle"), "");
  await writeFile(path.join(ws, "app", "app-release.apk"), "PK\u0003\u0004");
});
afterAll(() => rm(ws, { recursive: true, force: true }));

describe("runScan", () => {
  it("source scan: detects android, gates, converts, summarises", async () => {
    const api = createMockNandeeApi({ sourceFindings: loadSourceFindings(), pollsUntilDone: 3 });
    const r = await runScan(parseInputs(raw, git), { api, log, clock, workspace: ws });
    expect(r.platform).toBe("android");
    expect(r.scanRef.kind).toBe("source");
    expect(r.findings).toHaveLength(5);
    expect(r.passed).toBe(false);
    expect(r.gate?.failing.map((f) => f.id)).toEqual(["101", "103"]);
    expect(r.reportUrl).toBe("https://app.nandee.ai/source-scans/mock-src-1");
    expect(r.summaryMarkdown).toContain("**Failed**");
    expect((r.sarif as { runs: unknown[] }).runs).toHaveLength(1);
    expect(api.lastSourceRequest?.ref).toBe(git.commitSha);
    expect(api.lastSourceRequest?.scanners).toEqual(["static", "secret", "dependency"]);
    const o = toOutputs(r);
    expect(o).toMatchObject({ scan_id: "mock-src-1", findings_count: "5", critical_count: "1", high_count: "2", passed: "false", platform: "android" });
    expect(toDotenv(o)).toContain("NANDEE_PASSED=false");
  });

  it("baseline: only new findings fail the gate", async () => {
    const all = loadSourceFindings();
    const api = createMockNandeeApi({ sourceFindings: all, baselineFindings: all.filter((f) => f.id === 101 || f.id === 103) });
    const r = await runScan(parseInputs(raw, git), { api, log, clock, workspace: ws });
    expect(r.baseline).toEqual({ used: true, newCount: 3, fixedCount: 0 });
    expect(r.passed).toBe(true);
    expect(api.calls.some((c) => c.method === "findBaselineScan" && c.args[1] === "main")).toBe(true);
  });

  it("dast: uploads exactly the artifact and merges binary findings", async () => {
    const api = createMockNandeeApi({ binaryFindings: loadBinaryFindings(), sourceFindings: [] });
    const r = await runScan(parseInputs({ ...raw, scan_types: "sast,dast", artifact_path: "app/app-release.apk" }, git), { api, log, clock, workspace: ws });
    const up = api.calls.find((c) => c.method === "uploadBinary");
    expect(up?.args[0]).toEqual({ name: "app-release.apk", size: 4 });
    expect(r.findings.map((f) => f.id)).toEqual(["201", "202", "203"]);
    expect(r.secondaryScanIds).toHaveLength(1);
    expect(r.passed).toBe(false); // 201 is high
  });

  it("rejects an artifact outside the workspace before contacting the API", async () => {
    const api = createMockNandeeApi();
    await expect(runScan(parseInputs({ ...raw, scan_types: "dast", artifact_path: "../x.apk" }, git), { api, log, clock, workspace: ws })).rejects.toBeInstanceOf(InputError);
    expect(api.calls).toHaveLength(0);
  });

  it("wait_for_completion: false returns after starting", async () => {
    const api = createMockNandeeApi({ pollsUntilDone: 99 });
    const r = await runScan(parseInputs({ ...raw, wait_for_completion: "false" }, git), { api, log, clock, workspace: ws });
    expect(r.outcome.kind).toBe("started");
    expect(r.passed).toBe(true);
    expect(api.calls.filter((c) => c.method === "getScan")).toHaveLength(0);
  });

  it("fail_mode closed: a timeout fails the run; open: passes with unknown (T-40)", async () => {
    const api = createMockNandeeApi({ pollsUntilDone: 1_000_000 });
    let t = 0;
    const ticking: Clock = { now: () => t, sleep: async (ms) => { t += ms; }, random: () => 0.5 };
    await expect(runScan(parseInputs({ ...raw, timeout_minutes: "1" }, git), { api, log, clock: ticking, workspace: ws })).rejects.toBeInstanceOf(TimeoutError);
    t = 0;
    const r = await runScan(parseInputs({ ...raw, timeout_minutes: "1", fail_mode: "open" }, git), { api, log, clock: ticking, workspace: ws });
    expect(r.passed).toBeNull();
    expect(toOutputs(r).passed).toBe("unknown");
    expect(r.summaryMarkdown).toContain("fail_mode: open");
  });

  it("auth errors are never swallowed by fail_mode open", async () => {
    const api: NandeeApi = { ...createMockNandeeApi(), async startSourceScan() { throw new AuthError(); } };
    await expect(runScan(parseInputs({ ...raw, fail_mode: "open" }, git), { api, log, clock, workspace: ws })).rejects.toBeInstanceOf(AuthError);
  });

  it("an API outage with fail_mode open gives passed=unknown; closed rethrows", async () => {
    const api: NandeeApi = { ...createMockNandeeApi(), async startSourceScan() { throw new ApiError("503", 503); } };
    await expect(runScan(parseInputs(raw, git), { api, log, clock, workspace: ws })).rejects.toBeInstanceOf(ApiError);
    const r = await runScan(parseInputs({ ...raw, fail_mode: "open" }, git), { api, log, clock, workspace: ws });
    expect(r.passed).toBeNull();
    expect(r.outcome).toMatchObject({ kind: "not-completed" });
  });
});
