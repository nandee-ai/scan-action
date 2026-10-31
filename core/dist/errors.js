/**
 * Error types with the exit code each one maps to (docs/ARCHITECTURE.md §2.8).
 *
 * Messages are written for the person reading the CI log: what went wrong
 * and what to do.  They must never carry secret values; the HTTP layer never
 * puts headers in an error, and the logger scrubs anyway (T-30).
 */
export const ExitCode = {
    PASSED: 0,
    GATE_FAILED: 1,
    INVALID_INPUT: 2,
    AUTH_FAILED: 3,
    TIMEOUT: 4,
    API_ERROR: 5,
    QUOTA: 6,
    SCAN_REJECTED: 7,
};
export class NandeeError extends Error {
    exitCode;
    constructor(message, exitCode, options) {
        super(message, options);
        this.name = new.target.name;
        this.exitCode = exitCode;
    }
}
export class InputError extends NandeeError {
    constructor(message) {
        super(message, ExitCode.INVALID_INPUT);
    }
}
export class AuthError extends NandeeError {
    constructor(message = "Nandee rejected the API key (401/403). Check that the secret holds a current CI token from Admin → Settings → CI Tokens.") {
        super(message, ExitCode.AUTH_FAILED);
    }
}
export class TimeoutError extends NandeeError {
    constructor(message) {
        super(message, ExitCode.TIMEOUT);
    }
}
export class ApiError extends NandeeError {
    status;
    constructor(message, status = null, options) {
        super(message, ExitCode.API_ERROR, options);
        this.status = status;
    }
}
export class QuotaError extends NandeeError {
    constructor(message) {
        super(message, ExitCode.QUOTA);
    }
}
export class ScanRejectedError extends NandeeError {
    constructor(reason) {
        super(`Nandee rejected the scan: ${reason}`, ExitCode.SCAN_REJECTED);
    }
}
/** T-01: a redirect to a host outside the allow-list. */
export class RedirectError extends ApiError {
    constructor(from, toHost) {
        super(`Refused a redirect from ${from} to ${toHost}: only the configured Nandee host is allowed.`);
    }
}
//# sourceMappingURL=errors.js.map