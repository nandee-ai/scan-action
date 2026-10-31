import type { NandeeApi, ScanRef, ScanStatus } from "./types.js";
export interface Clock {
    now(): number;
    sleep(ms: number): Promise<void>;
    random(): number;
}
export declare const realClock: Clock;
export interface PollOptions {
    timeoutMs: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    /** Transient API errors tolerated in a row before giving up. */
    maxConsecutiveErrors?: number;
    onTick?: (status: ScanStatus | null, attempt: number) => void;
}
export declare function nextDelay(attempt: number, initial: number, max: number, random: () => number): number;
export declare function pollUntilDone(api: NandeeApi, ref: ScanRef, clock: Clock, opts: PollOptions): Promise<ScanStatus>;
/** Same loop for a Green Agent fix, which is usually quicker. */
export declare function pollFix(api: NandeeApi, ref: ScanRef, findingId: number, clock: Clock, timeoutMs: number): Promise<import("./types.js").FixState>;
