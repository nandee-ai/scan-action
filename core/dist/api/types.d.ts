/**
 * What the rest of the core needs from Nandee.  `client.ts` maps this onto
 * the real endpoints; `mock.ts` serves it from fixtures.  Nothing above this
 * interface knows which one it is talking to.
 */
import type { SourceFindingItem, VulnerabilityItem } from "./schemas.js";
export type ScanKind = "binary" | "source";
export type ScanState = "running" | "completed" | "rejected";
export interface ScanRef {
    kind: ScanKind;
    id: string;
}
export interface ScanStatus extends ScanRef {
    state: ScanState;
    rejectionReason: string | null;
    completedAt: string | null;
    /** Binary scans: app metadata once known. */
    app?: {
        name: string | null;
        packageName: string | null;
        version: string | null;
        type: string | null;
    };
}
export interface GitMetadata {
    repoUrl: string;
    branch: string;
    commitSha: string;
    prNumber: number | null;
    runUrl: string | null;
}
export interface StartSourceScanRequest {
    repoUrl: string;
    /** Sent as `branch`; a commit SHA is accepted by git as a ref (assumption Q3). */
    ref: string;
    target: "mobile" | "web";
    scanners?: string[];
    projectTitle: string;
    git: GitMetadata;
}
export type RawFinding = {
    kind: "binary";
    item: VulnerabilityItem;
} | {
    kind: "source";
    item: SourceFindingItem;
};
export interface FixState {
    state: "pending" | "ready" | "failed";
    diff: string | null;
    explanation: string | null;
    error: string | null;
}
export interface NandeeApi {
    /** Three-step binary upload; returns the scan to poll. */
    uploadBinary(file: {
        name: string;
        bytes: Uint8Array;
    }, meta: {
        projectTitle: string;
        description: string;
    }): Promise<ScanRef>;
    startSourceScan(req: StartSourceScanRequest): Promise<ScanRef>;
    getScan(ref: ScanRef): Promise<ScanStatus>;
    getFindings(ref: ScanRef): Promise<RawFinding[]>;
    /** Latest completed source scan of the same repo on `branch`, for baselines (assumption Q6). */
    findBaselineScan(repoUrl: string, branch: string, target: "mobile" | "web"): Promise<ScanRef | null>;
    requestFix(ref: ScanRef, findingId: number): Promise<void>;
    getFix(ref: ScanRef, findingId: number): Promise<FixState>;
}
