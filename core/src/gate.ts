/**
 * Severity gating (T-40).  Decides pass/fail from the findings that count:
 *   - open findings only (Resolved/Closed/accepted are skipped)
 *   - with ai_triage, findings Nandee judged false positives are skipped;
 *     "unknown" verdicts still count
 *   - with a baseline, only findings new relative to it count
 */
import { CLOSED_STATUSES, SEVERITY_RANK, type Finding } from "./convert/normalize.js";
import type { FailOn } from "./inputs.js";

export interface GateInputs {
  failOnSeverity: FailOn;
  aiTriage: boolean;
  /** Findings new relative to the baseline, or null when no baseline was used. */
  newOnly: ReadonlyArray<Finding> | null;
}

export interface GateResult {
  passed: boolean;
  threshold: FailOn;
  /** Findings that were evaluated against the threshold. */
  considered: Finding[];
  /** The ones at or above the threshold. */
  failing: Finding[];
  /** Why findings were left out, for the summary. */
  skipped: { closed: number; falsePositive: number; baseline: number };
  reason: string;
}

export function isOpen(f: Finding): boolean {
  return !CLOSED_STATUSES.has(f.status.trim().toLowerCase());
}

export function evaluateGate(all: ReadonlyArray<Finding>, opts: GateInputs): GateResult {
  const skipped = { closed: 0, falsePositive: 0, baseline: 0 };
  let considered = all.filter((f) => {
    if (!isOpen(f)) {
      skipped.closed++;
      return false;
    }
    return true;
  });
  if (opts.aiTriage) {
    considered = considered.filter((f) => {
      if (f.verdict === "false_positive") {
        skipped.falsePositive++;
        return false;
      }
      return true;
    });
  }
  if (opts.newOnly) {
    const newSet = new Set(opts.newOnly.map((f) => f.fingerprint));
    considered = considered.filter((f) => {
      if (!newSet.has(f.fingerprint)) {
        skipped.baseline++;
        return false;
      }
      return true;
    });
  }
  if (opts.failOnSeverity === "none") {
    return { passed: true, threshold: "none", considered, failing: [], skipped, reason: "fail_on_severity is none: findings are reported but never fail the job" };
  }
  const min = SEVERITY_RANK[opts.failOnSeverity];
  const failing = considered.filter((f) => SEVERITY_RANK[f.severity] >= min).sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const passed = failing.length === 0;
  const scope = opts.newOnly ? "new " : "";
  return {
    passed,
    threshold: opts.failOnSeverity,
    considered,
    failing,
    skipped,
    reason: passed
      ? `no ${scope}open findings at ${opts.failOnSeverity} or above`
      : `${failing.length} ${scope}open finding${failing.length === 1 ? "" : "s"} at ${opts.failOnSeverity} or above`,
  };
}
