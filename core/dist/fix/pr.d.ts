import type { Logger } from "../log.js";
import type { FixPatch } from "./request.js";
export interface FixBranchPlan {
    branchName: string;
    baseSha: string;
    /** Patches that applied cleanly, in order. */
    applied: FixPatch[];
    rejected: Array<{
        patch: FixPatch;
        reason: string;
    }>;
    /** Path of the scratch clone holding the commit; valid until `cleanup()`. */
    repoDir: string;
    commitSha: string | null;
    cleanup(): Promise<void>;
}
export declare function fixBranchName(scanId: string, commitSha: string): string;
export declare function commitMessage(applied: ReadonlyArray<FixPatch>, scanId: string, reportUrl: string): string;
/**
 * Builds the fix commit in a scratch clone of `sourceDir` at `baseSha`.
 * The caller pushes `branchName` from `repoDir` using its own credentials
 * and must call `cleanup()`.
 */
export declare function buildFixBranch(sourceDir: string, baseSha: string, scanId: string, reportUrl: string, patches: ReadonlyArray<FixPatch>, log: Logger): Promise<FixBranchPlan>;
/** Convenience for callers that only need the plan and will push elsewhere. */
export declare function withFixBranch<T>(args: Parameters<typeof buildFixBranch>, fn: (plan: FixBranchPlan) => Promise<T>): Promise<T>;
