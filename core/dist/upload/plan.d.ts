import type { ScanInputs, ScanType } from "../inputs.js";
export interface UploadPlan {
    /** A source scan to start by URL, if any of sast/sca is requested. */
    source: {
        scanners: string[];
        types: ScanType[];
    } | null;
    /** The one artifact to upload, if dast is requested. */
    artifact: {
        relativePath: string;
    } | null;
    /** Human-readable list for the summary. */
    describe: string[];
}
/** Assumption Q10: scanner names per scan type. */
export declare const SCANNERS: Record<Exclude<ScanType, "dast">, string[]>;
export declare function planUpload(inputs: ScanInputs, artifactRelativePath: string | null): UploadPlan;
