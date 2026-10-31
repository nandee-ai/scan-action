/**
 * The summary table rendered in PR comments, MR notes and job summaries.
 * Same Markdown everywhere; every untrusted string goes through escape.ts.
 */
import { type Finding } from "../convert/normalize.js";
import type { GateResult } from "../gate.js";
import type { FailMode } from "../inputs.js";
/** Hidden marker used to find and update the sticky comment. */
export declare const COMMENT_MARKER = "<!-- nandee-scan-summary -->";
export interface SummaryInput {
    scanId: string;
    scanKind: "source" | "binary";
    reportUrl: string;
    dashboardOrigin: string;
    commitSha: string;
    platform: string;
    scanTypes: string[];
    findings: ReadonlyArray<Finding>;
    gate: GateResult | null;
    failMode: FailMode;
    /** When the scan could not be completed (outage, timeout): what happened. */
    outcome: {
        kind: "completed";
    } | {
        kind: "not-completed";
        reason: string;
    } | {
        kind: "started";
        note: string;
    };
    baseline: {
        used: boolean;
        newCount: number;
        fixedCount: number;
    } | null;
    uploadPlan: ReadonlyArray<string>;
    detail: "counts" | "full";
    maxListed?: number;
}
export declare function renderSummary(s: SummaryInput): string;
