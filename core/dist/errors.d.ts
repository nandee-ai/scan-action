/**
 * Error types with the exit code each one maps to (docs/ARCHITECTURE.md §2.8).
 *
 * Messages are written for the person reading the CI log: what went wrong
 * and what to do.  They must never carry secret values; the HTTP layer never
 * puts headers in an error, and the logger scrubs anyway (T-30).
 */
export declare const ExitCode: {
    readonly PASSED: 0;
    readonly GATE_FAILED: 1;
    readonly INVALID_INPUT: 2;
    readonly AUTH_FAILED: 3;
    readonly TIMEOUT: 4;
    readonly API_ERROR: 5;
    readonly QUOTA: 6;
    readonly SCAN_REJECTED: 7;
};
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
export declare class NandeeError extends Error {
    readonly exitCode: ExitCode;
    constructor(message: string, exitCode: ExitCode, options?: {
        cause?: unknown;
    });
}
export declare class InputError extends NandeeError {
    constructor(message: string);
}
export declare class AuthError extends NandeeError {
    constructor(message?: string);
}
export declare class TimeoutError extends NandeeError {
    constructor(message: string);
}
export declare class ApiError extends NandeeError {
    readonly status: number | null;
    constructor(message: string, status?: number | null, options?: {
        cause?: unknown;
    });
}
export declare class QuotaError extends NandeeError {
    constructor(message: string);
}
export declare class ScanRejectedError extends NandeeError {
    constructor(reason: string);
}
/** T-01: a redirect to a host outside the allow-list. */
export declare class RedirectError extends ApiError {
    constructor(from: string, toHost: string);
}
