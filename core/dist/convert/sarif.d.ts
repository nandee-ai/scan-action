/**
 * Finding[] → SARIF 2.1.0 for GitHub code scanning (T-13).
 * Built from typed objects only.  `helpUri` is the Nandee dashboard, nothing
 * from a finding becomes a URI.  Messages are plain text; no markdown.
 */
import type { Finding } from "./normalize.js";
export interface SarifMeta {
    toolVersion: string;
    /** e.g. https://app.nandee.ai */
    dashboardOrigin: string;
    scanPath: string;
    commitSha: string;
    repoUrl: string;
}
export declare function toSarif(findings: ReadonlyArray<Finding>, meta: SarifMeta): object;
