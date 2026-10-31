/**
 * Baseline diffing: a finding is "new" when no finding in the baseline scan
 * has the same fingerprint.  Fingerprints ignore line numbers, so a finding
 * that merely moved is not new.
 */
import type { Finding } from "./convert/normalize.js";
export interface BaselineDiff {
    newFindings: Finding[];
    existing: Finding[];
    /** Findings in the baseline that are gone from the current scan. */
    fixed: Finding[];
}
export declare function diffAgainstBaseline(current: ReadonlyArray<Finding>, baseline: ReadonlyArray<Finding>): BaselineDiff;
