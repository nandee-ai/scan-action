import { describe, expect, it } from "vitest";
import { parseInputs, type GitContext } from "../../src/inputs.js";
import { InputError } from "../../src/errors.js";

const git: GitContext = {
  repoUrl: "https://github.com/acme/app",
  branch: "feature/x",
  commitSha: "0123456789abcdef0123456789abcdef01234567",
  prNumber: 12,
  baseBranch: "main",
  isFork: false,
  isPublicRepo: false,
  runUrl: null,
};
const ok = { api_key: "ci_abcdefghijklmnopqrstuvwxyz", project_id: "acme/app" };

describe("parseInputs", () => {
  it("applies defaults", () => {
    const i = parseInputs(ok, git);
    expect(i.scanTypes).toEqual(["sast", "sca"]);
    expect(i.failOnSeverity).toBe("high");
    expect(i.failMode).toBe("closed");
    expect(i.aiTriage).toBe(true);
    expect(i.timeoutMinutes).toBe(30);
    expect(i.baselineMode).toBe(true); // PR context
    expect(parseInputs(ok, { ...git, prNumber: null }).baselineMode).toBe(false);
    expect(i.apiUrl.href).toBe("https://app.nandee.ai/");
    expect(String(i.apiKey)).toBe("[redacted]");
  });

  it.each([
    [{ api_key: "" }, /api_key is required/],
    [{ api_url: "http://app.nandee.ai" }, /must use https/],
    [{ api_url: "https://u:p@app.nandee.ai" }, /credentials/],
    [{ api_url: "https://app.nandee.ai/?x=1" }, /query/],
    [{ api_url: "nonsense" }, /not a URL/],
    [{ scan_types: "sast,evil" }, /scan_types accepts/],
    [{ scan_types: "dast" }, /artifact_path is not set/],
    [{ platform: "windows" }, /platform accepts/],
    [{ fail_on_severity: "info" }, /fail_on_severity accepts/],
    [{ fail_mode: "maybe" }, /fail_mode accepts/],
    [{ ai_triage: "sometimes" }, /ai_triage must be true or false/],
    [{ timeout_minutes: "0" }, /at least 1/],
    [{ timeout_minutes: "999" }, /at most 180/],
    [{ timeout_minutes: "abc" }, /must be a number/],
    [{ timeout_minutes: "2.5" }, /whole number/],
    [{ green_agent: "merge" }, /green_agent accepts/],
    [{ project_id: "x".repeat(300) }, /at most 255/],
    [{ project_id: "bad\u0007id" }, /control characters/],
    [{ extra_allowed_hosts: "evil host" }, /extra_allowed_hosts/],
  ])("rejects %o", (over, re) => {
    expect(() => parseInputs({ ...ok, ...over }, git)).toThrow(re);
    expect(() => parseInputs({ ...ok, ...over }, git)).toThrow(InputError);
  });

  it("never echoes the api key in an error", () => {
    const err = (() => {
      try {
        parseInputs({ ...ok, api_key: "ci_secretsecretsecretsecret", platform: "bad" }, git);
      } catch (e) {
        return e as Error;
      }
      return null;
    })();
    expect(err?.message).not.toContain("secretsecret");
  });

  it("parses lists, booleans and hosts", () => {
    const i = parseInputs({ ...ok, scan_types: " SAST , dast,sast", artifact_path: "app.apk", ai_triage: "No", extra_allowed_hosts: "*.blob.core.usgovcloudapi.net, Storage.Example.com" }, git);
    expect(i.scanTypes).toEqual(["sast", "dast"]);
    expect(i.aiTriage).toBe(false);
    expect(i.extraAllowedHosts).toEqual(["*.blob.core.usgovcloudapi.net", "storage.example.com"]);
  });

  it("validates the git context", () => {
    expect(() => parseInputs(ok, { ...git, commitSha: "abc" })).toThrow(/commit SHA/);
    expect(() => parseInputs(ok, { ...git, repoUrl: "git@github.com:acme/app" })).toThrow(/not a URL/);
    expect(() => parseInputs(ok, { ...git, branch: "x\ny" })).toThrow(/branch name/);
    expect(() => parseInputs(ok, { ...git, prNumber: -1 })).toThrow(/PR number/);
  });
});
