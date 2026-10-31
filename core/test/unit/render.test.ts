import { describe, expect, it } from "vitest";
import { codeSpan, escapeMarkdown, safeLink } from "../../src/render/escape.js";
import { COMMENT_MARKER, renderSummary, type SummaryInput } from "../../src/render/summary.js";
import { normalize } from "../../src/convert/normalize.js";
import { evaluateGate } from "../../src/gate.js";
import { loadSourceFindings } from "../fixtures/index.js";

const INJECTIONS = [
  "[click me](https://evil.example)",
  "<img src=x onerror=alert(1)>",
  "<script>alert(1)</script>",
  "@everyone @org/team",
  "| col | breaker |",
  "# heading\n\n- list\n\n```js\ncode\n```",
  "![img](https://evil.example/x.png)",
  "<!-- hidden -->",
  "https://evil.example/phish",
  "\u0000\u001b[31mred\u001b[0m\u2028",
  "a\\`b`c",
];

describe("escapeMarkdown (T-12)", () => {
  it.each(INJECTIONS)("neutralises %j", (s) => {
    const out = escapeMarkdown(s);
    expect(out).not.toMatch(/(^|[^\\])[[\]()<>#*_`|!]/);
    expect(out).not.toMatch(/@(?!\u200b)/);
    expect(out).not.toMatch(/\n/);
    expect(out).not.toMatch(/[\u0000-\u001f\u2028]/);
    expect(out).not.toContain("://");
  });

  it("bounds the length", () => {
    expect(escapeMarkdown("x".repeat(1000), 50).length).toBeLessThanOrEqual(51);
  });

  it("codeSpan strips backticks and pipes", () => {
    expect(codeSpan("a`b|c")).toBe("`ab\\|c`");
    expect(codeSpan("")).toBe("` `");
  });

  it("safeLink only links to the allowed origin", () => {
    expect(safeLink("x", "https://app.nandee.ai/scans/1", "https://app.nandee.ai")).toBe("[x](https://app.nandee.ai/scans/1)");
    expect(safeLink("x", "https://evil.example/scans/1", "https://app.nandee.ai")).toBe("x");
    expect(safeLink("x", "javascript:alert(1)", "https://app.nandee.ai")).toBe("x");
    expect(safeLink("x", "https://app.nandee.ai/a b)", "https://app.nandee.ai")).not.toMatch(/\)\)$/);
  });
});

describe("renderSummary", () => {
  const findings = normalize(loadSourceFindings().map((item) => ({ kind: "source", item })));
  const base: SummaryInput = {
    scanId: "src_1",
    scanKind: "source",
    reportUrl: "https://app.nandee.ai/source-scans/src_1",
    dashboardOrigin: "https://app.nandee.ai",
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    platform: "android",
    scanTypes: ["sast", "sca"],
    findings,
    gate: evaluateGate(findings, { failOnSeverity: "high", aiTriage: true, newOnly: null }),
    failMode: "closed",
    outcome: { kind: "completed" },
    baseline: null,
    uploadPlan: ["Nothing is uploaded"],
    detail: "full",
  };

  it("renders the table, marker and dashboard link, with hostile titles escaped", () => {
    const md = renderSummary(base);
    expect(md.startsWith(COMMENT_MARKER)).toBe(true);
    expect(md).toContain("**Failed**");
    expect(md).toContain("| 🟥 critical | 1 | 1 |");
    expect(md).toContain("[Open in Nandee](https://app.nandee.ai/source-scans/src_1)");
    expect(md).not.toContain("https://evil.example");
    expect(md).not.toContain("<img");
    expect(md).not.toMatch(/@everyone/);
    expect(md).toContain("not an attestation");
  });

  it("hides titles in counts mode", () => {
    const md = renderSummary({ ...base, detail: "counts" });
    expect(md).not.toContain("Hard\\-coded");
    expect(md).toContain("repository is public");
  });

  it("renders the not-completed and started outcomes", () => {
    expect(renderSummary({ ...base, outcome: { kind: "not-completed", reason: "timed out" } })).toContain("fail_mode: closed");
    expect(renderSummary({ ...base, failMode: "open", outcome: { kind: "not-completed", reason: "timed out" } })).toContain("Passed with a warning");
    expect(renderSummary({ ...base, outcome: { kind: "started", note: "wait_for_completion is false" } })).toContain("not waited for");
  });
});
