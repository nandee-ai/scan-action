/**
 * T-31: the allow-list of values a run may export (action outputs, GitLab
 * dotenv).  Nothing else leaves the process as an output, so a secret cannot
 * be exported by accident.
 */
import type { ScanResult } from "./run.js";
export interface Outputs {
    scan_id: string;
    findings_count: string;
    critical_count: string;
    high_count: string;
    medium_count: string;
    low_count: string;
    report_url: string;
    passed: "true" | "false" | "unknown";
    platform: string;
}
export declare const OUTPUT_KEYS: ReadonlyArray<keyof Outputs>;
export declare function toOutputs(r: ScanResult): Outputs;
/** GitLab dotenv report format: KEY=value, one per line, values without newlines. */
export declare function toDotenv(o: Outputs): string;
