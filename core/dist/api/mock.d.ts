/**
 * An in-memory NandeeApi for tests and for `nandee scan --mock`.
 * Scans complete after `pollsUntilDone` status checks so polling is exercised.
 */
import type { SourceFindingItem, VulnerabilityItem } from "./schemas.js";
import type { NandeeApi, StartSourceScanRequest } from "./types.js";
export interface MockFixtures {
    sourceFindings?: SourceFindingItem[];
    binaryFindings?: VulnerabilityItem[];
    baselineFindings?: SourceFindingItem[];
    pollsUntilDone?: number;
    reject?: string;
    fixes?: Record<number, {
        diff: string;
        explanation: string;
    }>;
}
export interface MockNandeeApi extends NandeeApi {
    calls: Array<{
        method: keyof NandeeApi;
        args: unknown[];
    }>;
    lastSourceRequest: StartSourceScanRequest | null;
}
export declare function createMockNandeeApi(fx?: MockFixtures): MockNandeeApi;
