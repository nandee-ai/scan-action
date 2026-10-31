import type { NandeeApi, ScanRef } from "./api/types.js";
import { type Clock } from "./api/poll.js";
import { type Finding } from "./convert/normalize.js";
import { type GateResult } from "./gate.js";
import type { ScanInputs, Severity } from "./inputs.js";
import type { Logger } from "./log.js";
import { type DetectedPlatform } from "./platform/detect.js";
import { type SummaryInput } from "./render/summary.js";
import { type UploadPlan } from "./upload/plan.js";
export declare const TOOL_VERSION = "1.0.0";
export interface ScanResult {
    scanId: string;
    scanRef: ScanRef;
    reportUrl: string;
    dashboardOrigin: string;
    platform: DetectedPlatform | "unknown";
    findings: Finding[];
    counts: Record<Severity, number>;
    gate: GateResult | null;
    /** true/false from the gate; null when the scan did not complete (fail_mode: open). */
    passed: boolean | null;
    outcome: SummaryInput["outcome"];
    baseline: SummaryInput["baseline"];
    uploadPlan: UploadPlan;
    sarif: object;
    gitlab: {
        sast: object;
        dependencyScanning: object;
    };
    summaryMarkdown: string;
    timing: {
        startedAt: Date;
        finishedAt: Date;
    };
    /** Set when the run also started a binary scan next to a source scan; its findings are merged into `findings`. */
    secondaryScanIds: string[];
}
export interface RunDeps {
    api: NandeeApi;
    log: Logger;
    clock?: Clock;
    workspace: string;
}
export declare function runScan(inputs: ScanInputs, deps: RunDeps): Promise<ScanResult>;
