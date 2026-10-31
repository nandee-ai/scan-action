import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startMockServer, type MockServer } from "./server.js";
import { createHttpClient } from "../../src/http/client.js";
import { createNandeeApi } from "../../src/api/client.js";
import { runScan } from "../../src/run.js";
import { parseInputs, type GitContext } from "../../src/inputs.js";
import { createLogger, createScrubber } from "../../src/log.js";
import { Secret } from "../../src/secret.js";
import { AuthError } from "../../src/errors.js";
import type { Clock } from "../../src/api/poll.js";

const TOKEN = "ci_integrationintegration0001";
let server: MockServer;
let ws: string;
const lines: string[] = [];
const clock: Clock = { now: () => 0, sleep: async () => {}, random: () => 0 };
const git: GitContext = { repoUrl: "https://github.com/acme/app", branch: "feature", commitSha: "0123456789abcdef0123456789abcdef01234567", prNumber: 3, baseBranch: "main", isFork: false, isPublicRepo: false, runUrl: null };

function makeApi(token: string) {
  const http = createHttpClient({ allowedHosts: [], allowLoopbackHttp: true });
  return createNandeeApi(http, new Secret(token), server.url);
}

beforeAll(async () => {
  server = await startMockServer({ token: TOKEN, pollsUntilDone: 2 });
  ws = await mkdtemp(path.join(os.tmpdir(), "integ-"));
  await mkdir(path.join(ws, "ios/App.xcodeproj"), { recursive: true });
  await writeFile(path.join(ws, "Podfile"), "");
  await writeFile(path.join(ws, "App.ipa"), "ipa");
});
afterAll(async () => {
  await server.close();
  await rm(ws, { recursive: true, force: true });
});

describe("end to end over HTTP against the mock server", () => {
  it("runs a source + binary scan with a baseline and logs nothing secret", async () => {
    const log = createLogger({ write: (l, m) => lines.push(`${l}:${m}`) }, createScrubber([new Secret(TOKEN)]), { debug: true });
    const inputs = parseInputs({ api_key: TOKEN, project_id: "acme/app", scan_types: "sast,sca,dast", artifact_path: "App.ipa" }, git);
    // api_url in inputs is https; the test API client points at the loopback server directly.
    const r = await runScan(inputs, { api: makeApi(TOKEN), log, clock, workspace: ws });

    expect(r.platform).toBe("ios");
    expect(r.scanRef.kind).toBe("source");
    expect(r.secondaryScanIds).toHaveLength(1);
    expect(r.findings.length).toBe(8); // 5 source + 3 binary
    expect(r.baseline?.used).toBe(true);
    expect(r.passed).toBe(false);

    const paths = server.requests.map((q) => `${q.method} ${q.path}`);
    expect(paths).toContain("POST /api/v2/source-scans/github");
    expect(paths).toContain("POST /api/v2/scans/upload-init");
    expect(paths).toContain("PUT /blob/App.ipa");
    expect(paths).toContain("POST /api/v2/scans/upload-finalize");
    expect(paths.filter((p) => p === "GET /api/v2/source-scans/src_1")).toHaveLength(2);
    expect(paths).toContain("GET /api/v2/source-scans/src_base/findings");
    expect(server.requests.find((q) => q.path.startsWith("/blob/"))?.auth).toBeUndefined();
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("a wrong token is an AuthError, not a pass", async () => {
    const log = createLogger({ write: () => {} }, (t) => t);
    const inputs = parseInputs({ api_key: "ci_wrongwrongwrongwrong", project_id: "p", fail_mode: "open" }, git);
    await expect(runScan(inputs, { api: makeApi("ci_wrongwrongwrongwrong"), log, clock, workspace: ws })).rejects.toBeInstanceOf(AuthError);
  });
});
