/**
 * T-10: the only module in the repo that may start a process.
 * ESLint's no-restricted-imports blocks `child_process` everywhere else.
 *
 * Rules enforced here, not left to callers:
 *  - argument arrays only, never a command string; no shell
 *  - the binary is an allow-listed name, resolved by PATH, never user data
 *  - untrusted data (branch names, titles) is passed as arguments or env,
 *    and arguments that start with "-" are guarded with "--" by callers
 *    where the tool supports it (git does)
 *  - a timeout on every call
 */
import { execFile } from "node:child_process";

const ALLOWED_BINARIES = new Set(["git"]);

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

export async function exec(binary: string, args: ReadonlyArray<string>, opts: ExecOptions): Promise<ExecResult> {
  if (!ALLOWED_BINARIES.has(binary)) {
    throw new Error(`exec: "${binary}" is not an allowed binary`);
  }
  for (const a of args) {
    if (typeof a !== "string") throw new TypeError("exec: arguments must be strings");
    if (a.includes("\0")) throw new Error("exec: argument contains NUL");
  }
  return new Promise((resolve, reject) => {
    const child = execFile(
      binary,
      [...args],
      {
        cwd: opts.cwd,
        // A minimal environment: PATH to find the binary, HOME for git config, plus what the caller adds.
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...(opts.env ?? {}) },
        timeout: opts.timeoutMs ?? 60_000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error && !("code" in error && typeof error.code === "number")) {
          reject(error);
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr), code: error ? Number(error.code) : 0 });
      },
    );
    if (opts.stdin !== undefined) {
      child.stdin?.end(opts.stdin);
    }
  });
}
