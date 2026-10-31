/**
 * T-30: every line that leaves the process goes through the scrubber,
 * including debug output and error stacks.  The front ends supply the sink
 * (`@actions/core` on GitHub, stderr on GitLab and the CLI).
 */
import { Secret } from "./secret.js";
export type LogLevel = "debug" | "info" | "warn" | "error";
export interface LogSink {
    write(level: LogLevel, line: string): void;
    startGroup?(name: string): void;
    endGroup?(): void;
}
export interface Logger {
    debug(msg: string): void;
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
    group<T>(name: string, fn: () => Promise<T>): Promise<T>;
    /** Scrub any string the same way log lines are scrubbed (for error messages that go elsewhere). */
    scrub(text: string): string;
}
export type Scrubber = (text: string) => string;
/**
 * Replaces every known secret value, the URL-encoded form of it, and anything
 * that looks like a CI token.  Secrets shorter than 8 characters are not
 * scrubbed by value because that would redact ordinary words; the token
 * pattern still catches real tokens.
 */
export declare function createScrubber(secrets: ReadonlyArray<Secret>): Scrubber;
export declare function createLogger(sink: LogSink, scrub: Scrubber, opts?: {
    debug?: boolean;
}): Logger;
/** A sink that writes to stderr with a level prefix.  Used by the CLI and the GitLab wrapper. */
export declare const stderrSink: LogSink;
/** Formats an unknown thrown value for a log line without leaking more than its message. */
export declare function describeError(err: unknown): string;
