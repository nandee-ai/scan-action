import { describe, expect, it } from "vitest";
import { normalize } from "../../src/convert/normalize.js";
import { toSarif } from "../../src/convert/sarif.js";
import { isDependencyFinding, toGitLabDependencyScanning, toGitLabSast } from "../../src/convert/gitlab.js";
import { loadSourceFindings } from "../fixtures/index.js";

const findings = normalize(loadSourceFindings().map((item) => ({ kind: "source", item })));
const meta = { toolVersion: "1.0.0", dashboardOrigin: "https://app.nandee.ai", scanPath: "/source-scans/src_1", commitSha: "0123456789abcdef0123456789abcdef01234567", repoUrl: "https://github.com/acme/app" };

describe("toSarif (T-13)", () => {
  const sarif = toSarif(findings, meta) as { runs: Array<{ tool: { driver: { rules: Array<{ id: string; helpUri: string; properties: { "security-severity": string } }> } }; results: Array<Record<string, unknown>> }> };
  const run = sarif.runs[0]!;

  it("has one rule per ruleId and one result per finding", () => {
    expect(run.tool.driver.rules.map((r) => r.id).slice(0, 4)).toEqual(["CWE-798", "CWE-79", "CWE-295", "CWE-319"]);
    expect(run.tool.driver.rules[4]!.id).toMatch(/^nandee-logging-of-sensitive-data[a-z0-9-]*$/);
    expect(run.results).toHaveLength(5);
  });

  it("maps severities to levels and scores", () => {
    expect(run.results[0]!.level).toBe("error");
    expect(run.tool.driver.rules[0]!.properties["security-severity"]).toBe("9.5");
    expect(run.results[3]!.level).toBe("warning");
    expect(run.results[4]!.level).toBe("note");
  });

  it("only links to the dashboard and sanitises location URIs", () => {
    for (const r of run.tool.driver.rules) expect(r.helpUri).toBe("https://app.nandee.ai/source-scans/src_1");
    const loc = run.results[4]!.locations as Array<{ physicalLocation: { artifactLocation: { uri: string } } }>;
    expect(loc[0]!.physicalLocation.artifactLocation.uri).not.toContain("..");
    // Hostile text may appear only as plain message text, never as a URI.
    const uris = JSON.stringify(sarif).match(/"(uri|helpUri|informationUri)":"[^"]*"/g) ?? [];
    expect(uris.join()).not.toContain("evil.example");
    expect(uris.join()).not.toContain("..");
  });

  it("carries fingerprints for GitHub de-duplication", () => {
    expect((run.results[0]!.partialFingerprints as Record<string, string>)["nandee/v1"]).toBe(findings[0]!.fingerprint);
  });
});

describe("GitLab reports", () => {
  const gl = { toolVersion: "1.0.0", startedAt: new Date("2026-01-01T00:00:00Z"), finishedAt: new Date("2026-01-01T00:05:00Z"), dashboardUrl: "https://app.nandee.ai/source-scans/src_1" };

  it("splits dependency findings from the rest", () => {
    const deps = findings.filter(isDependencyFinding);
    expect(deps.map((f) => f.id)).toEqual(["103"]);
  });

  it("produces a v15 SAST report", () => {
    const r = toGitLabSast(findings.filter((f) => !isDependencyFinding(f)), gl) as { version: string; vulnerabilities: Array<Record<string, unknown>>; scan: Record<string, unknown> };
    expect(r.version).toBe("15.2.2");
    expect(r.vulnerabilities).toHaveLength(4);
    const v = r.vulnerabilities[0]!;
    expect(v.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(v.severity).toBe("Critical");
    expect(v.confidence).toBe("Confirmed");
    expect((v.location as { file: string }).file).toBe("app/src/main/java/com/acme/app/Config.kt");
    expect(r.scan.start_time).toBe("2026-01-01T00:00:00");
    expect(r.scan).toHaveProperty("analyzer");
  });

  it("produces a v15 dependency scanning report with package names", () => {
    const r = toGitLabDependencyScanning(findings.filter(isDependencyFinding), gl) as { vulnerabilities: Array<{ location: { dependency: { package: { name: string }; version?: string } } }>; dependency_files: Array<{ path: string }> };
    expect(r.vulnerabilities[0]!.location.dependency.package.name).toBe("okhttp");
    expect(r.vulnerabilities[0]!.location.dependency.version).toBe("3.12.0");
    expect(r.dependency_files[0]!.path).toBe("app/build.gradle");
  });

  it("is deterministic", () => {
    expect(JSON.stringify(toGitLabSast(findings, gl))).toBe(JSON.stringify(toGitLabSast(findings, gl)));
  });
});
