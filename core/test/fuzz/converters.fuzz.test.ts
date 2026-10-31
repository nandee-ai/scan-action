/**
 * T-43: converters and parsers must never throw on any shape the API schema
 * admits, and the escaper must never let Markdown syntax through.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { normalize } from "../../src/convert/normalize.js";
import { toSarif } from "../../src/convert/sarif.js";
import { toGitLabDependencyScanning, toGitLabSast } from "../../src/convert/gitlab.js";
import { evaluateGate } from "../../src/gate.js";
import { renderSummary } from "../../src/render/summary.js";
import { escapeMarkdown } from "../../src/render/escape.js";
import { parseInputs, type GitContext } from "../../src/inputs.js";
import { InputError } from "../../src/errors.js";
import type { RawFinding } from "../../src/api/types.js";

const str = fc.string({ maxLength: 400 });
const optStr = fc.option(str, { nil: null });

const sourceItem = fc.record({
  id: fc.integer({ min: 0, max: 1e9 }),
  issue_title: str,
  issue_detail: str,
  severity: str,
  status: str,
  file_path: optStr,
  line_number: fc.option(fc.oneof(str, fc.integer()), { nil: null }),
  code_snippet: optStr,
  suggestion: optStr,
  cwe: optStr,
  owasp_category: optStr,
  masvs: fc.array(str, { maxLength: 4 }),
  cluster_id: optStr,
  fix_diff: optStr,
  fix_explanation: optStr,
  validator_verdict: optStr,
});

const rawFinding: fc.Arbitrary<RawFinding> = sourceItem.map((item) => ({ kind: "source", item }));
const sarifMeta = { toolVersion: "0.0.0", dashboardOrigin: "https://app.nandee.ai", scanPath: "/source-scans/x", commitSha: "0".repeat(40), repoUrl: "https://github.com/a/b" };
const glMeta = { toolVersion: "0.0.0", startedAt: new Date(0), finishedAt: new Date(1000), dashboardUrl: "https://app.nandee.ai/source-scans/x" };

describe("fuzz: converters never throw and stay JSON-serialisable", () => {
  it("normalize → sarif / gitlab / gate / summary", () => {
    fc.assert(
      fc.property(fc.array(rawFinding, { maxLength: 30 }), fc.constantFrom("critical", "high", "medium", "low", "none" as const), fc.boolean(), (raw, failOn, triage) => {
        const findings = normalize(raw);
        const sarif = toSarif(findings, sarifMeta);
        const sast = toGitLabSast(findings, glMeta);
        const ds = toGitLabDependencyScanning(findings, glMeta);
        const gate = evaluateGate(findings, { failOnSeverity: failOn, aiTriage: triage, newOnly: null });
        const md = renderSummary({
          scanId: "x", scanKind: "source", reportUrl: "https://app.nandee.ai/source-scans/x", dashboardOrigin: "https://app.nandee.ai",
          commitSha: "0".repeat(40), platform: "android", scanTypes: ["sast"], findings, gate, failMode: "closed",
          outcome: { kind: "completed" }, baseline: null, uploadPlan: [], detail: "full",
        });
        JSON.stringify(sarif);
        JSON.stringify(sast);
        JSON.stringify(ds);
        expect(JSON.stringify(sarif)).not.toContain("javascript:");
        expect(md).not.toMatch(/<img|<script|javascript:/i);
        expect(gate.failing.length).toBeLessThanOrEqual(findings.length);
      }),
      { numRuns: 300 },
    );
  });
});

describe("fuzz: escapeMarkdown leaves no active syntax", () => {
  it("every output char that is Markdown syntax is backslash-escaped", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (s) => {
        const out = escapeMarkdown(s);
        // Walk the string: any syntax char must be preceded by an odd run of backslashes.
        for (let i = 0; i < out.length; i++) {
          const c = out[i]!;
          if ("[]()<>#*_`|!{}+-~".includes(c)) {
            let bs = 0;
            for (let j = i - 1; j >= 0 && out[j] === "\\"; j--) bs++;
            expect(bs % 2).toBe(1);
          }
        }
        expect(out).not.toMatch(/[\r\n]/);
        expect(out).not.toMatch(/@(?!\u200b)/);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("fuzz: parseInputs only ever throws InputError", () => {
  const git: GitContext = { repoUrl: "https://github.com/a/b", branch: "main", commitSha: "0".repeat(40), prNumber: null, baseBranch: null, isFork: false, isPublicRepo: false, runUrl: null };
  it("arbitrary strings", () => {
    const rawArb = fc.dictionary(
      fc.constantFrom("api_key", "api_url", "project_id", "scan_types", "platform", "fail_on_severity", "fail_mode", "ai_triage", "timeout_minutes", "green_agent", "artifact_path", "extra_allowed_hosts"),
      fc.string({ maxLength: 50 }),
    );
    fc.assert(
      fc.property(rawArb, (raw) => {
        try {
          const r = parseInputs({ api_key: "ci_defaultdefaultdefault", project_id: "p", ...raw }, git);
          expect(r.timeoutMinutes).toBeGreaterThanOrEqual(1);
          expect(r.apiUrl.protocol).toBe("https:");
        } catch (e) {
          expect(e).toBeInstanceOf(InputError);
          expect((e as Error).message).not.toContain("ci_defaultdefaultdefault");
        }
      }),
      { numRuns: 500 },
    );
  });
});
