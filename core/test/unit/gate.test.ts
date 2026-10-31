import { describe, expect, it } from "vitest";
import { normalize } from "../../src/convert/normalize.js";
import { diffAgainstBaseline } from "../../src/baseline.js";
import { evaluateGate } from "../../src/gate.js";
import { loadSourceFindings } from "../fixtures/index.js";

const findings = normalize(loadSourceFindings().map((item) => ({ kind: "source", item })));
// 101 critical exploitable, 102 high false_positive, 103 high unknown, 104 medium resolved, 105 low unknown

describe("evaluateGate (T-40)", () => {
  it("fails on high with triage on: 101 and 103 count, 102 and 104 are skipped", () => {
    const g = evaluateGate(findings, { failOnSeverity: "high", aiTriage: true, newOnly: null });
    expect(g.passed).toBe(false);
    expect(g.failing.map((f) => f.id)).toEqual(["101", "103"]);
    expect(g.skipped).toEqual({ closed: 1, falsePositive: 1, baseline: 0 });
    expect(g.reason).toMatch(/2 open findings at high or above/);
  });

  it("counts false positives when triage is off", () => {
    const g = evaluateGate(findings, { failOnSeverity: "high", aiTriage: false, newOnly: null });
    expect(g.failing.map((f) => f.id)).toEqual(["101", "102", "103"]);
  });

  it("passes at critical-only threshold when only lower findings are open", () => {
    const g = evaluateGate(findings.filter((f) => f.id !== "101"), { failOnSeverity: "critical", aiTriage: true, newOnly: null });
    expect(g.passed).toBe(true);
  });

  it("never fails with none", () => {
    const g = evaluateGate(findings, { failOnSeverity: "none", aiTriage: true, newOnly: null });
    expect(g.passed).toBe(true);
    expect(g.considered.length).toBe(3);
  });

  it("with a baseline, only new findings count", () => {
    const baseline = findings.filter((f) => f.id === "101");
    const diff = diffAgainstBaseline(findings, baseline);
    expect(diff.newFindings.map((f) => f.id)).toEqual(["102", "103", "104", "105"]);
    expect(diff.existing.map((f) => f.id)).toEqual(["101"]);
    const g = evaluateGate(findings, { failOnSeverity: "critical", aiTriage: true, newOnly: diff.newFindings });
    expect(g.passed).toBe(true);
    expect(g.skipped.baseline).toBe(1);
    expect(g.reason).toContain("new");
  });

  it("baseline reports fixed findings", () => {
    const diff = diffAgainstBaseline([], findings);
    expect(diff.fixed).toHaveLength(5);
  });
});
