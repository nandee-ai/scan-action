export interface ExecResult {
    stdout: string;
    stderr: string;
    code: number;
}
export interface ExecOptions {
    cwd: string;
    env?: Record<string, string>;
    timeoutMs?: number;
    /** Input written to stdin, e.g. a patch for `git apply`. */
    stdin?: string;
}
export declare function exec(binary: string, args: ReadonlyArray<string>, opts: ExecOptions): Promise<ExecResult>;
