import type { Finding } from "./normalize.js";
export interface GitLabMeta {
    toolVersion: string;
    startedAt: Date;
    finishedAt: Date;
    dashboardUrl: string;
}
/** Findings that describe a third-party package go to the dependency report. */
export declare function isDependencyFinding(f: Finding): boolean;
export declare function toGitLabSast(findings: ReadonlyArray<Finding>, meta: GitLabMeta): object;
export declare function toGitLabDependencyScanning(findings: ReadonlyArray<Finding>, meta: GitLabMeta): object;
