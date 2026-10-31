/**
 * Green Agent: collect patches for the findings that failed the gate.
 *
 * Assumption Q8: a finding may already carry `fix_diff`; otherwise we ask
 * Nandee to generate one and poll.  Patches are data: they are applied with
 * `git apply --check` first by the front end (fix/pr.ts), never executed.
 */
import type { NandeeApi, ScanRef } from "../api/types.js";
import { type Clock } from "../api/poll.js";
import type { Finding } from "../convert/normalize.js";
import type { Logger } from "../log.js";
export interface FixPatch {
    finding: Finding;
    diff: string;
    explanation: string | null;
}
export interface FixCollection {
    patches: FixPatch[];
    /** Findings for which no patch could be produced, with the reason. */
    unavailable: Array<{
        finding: Finding;
        reason: string;
    }>;
}
export declare function collectFixes(api: NandeeApi, ref: ScanRef, findings: ReadonlyArray<Finding>, clock: Clock, log: Logger, opts?: {
    perFixTimeoutMs?: number;
}): Promise<FixCollection>;
