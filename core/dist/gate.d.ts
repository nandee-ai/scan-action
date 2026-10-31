/**
 * Severity gating (T-40).  Decides pass/fail from the findings that count:
 *   - open findings only (Resolved/Closed/accepted are skipped)
 *   - with ai_triage, findings Nandee judged false positives are skipped;
 *     "unknown" verdicts still count
 *   - with a baseline, only findings new relative to it count
 */
import { type Finding } from "./convert/normalize.js";
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
    skipped: {
        closed: number;
        falsePositive: number;
        baseline: number;
    };
    reason: string;
}
export declare function isOpen(f: Finding): boolean;
export declare function evaluateGate(all: ReadonlyArray<Finding>, opts: GateInputs): GateResult;
