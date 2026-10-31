import type { RawFinding } from "../api/types.js";
import type { Severity } from "../inputs.js";
export type Verdict = "exploitable" | "false_positive" | "unknown";
export interface Finding {
    id: string;
    fingerprint: string;
    ruleId: string;
    title: string;
    detail: string;
    severity: Severity;
    location: {
        path: string;
        line: number | null;
    } | null;
    snippet: string | null;
    suggestion: string | null;
    cwe: string | null;
    owasp: string | null;
    masvs: string[];
    verdict: Verdict;
    status: string;
    fix: {
        diff: string;
        explanation: string | null;
    } | null;
}
export declare function normalizeSeverity(raw: string): Severity;
export declare function normalizeVerdict(raw: string | null | undefined): Verdict;
/** Findings a person has already dealt with are not gated again. */
export declare const CLOSED_STATUSES: Set<string>;
export declare function normalizePath(p: string | null | undefined): string | null;
export declare function ruleIdFor(title: string, cwe: string | null, owasp: string | null): string;
/** Stable across runs and line shifts: rule, path, and the snippet (or title). */
export declare function fingerprintOf(ruleId: string, path: string | null, snippet: string | null, title: string): string;
export declare function normalize(raw: RawFinding[]): Finding[];
export declare const SEVERITY_RANK: Record<Severity, number>;
export declare function countBySeverity(findings: ReadonlyArray<Finding>): Record<Severity, number>;
