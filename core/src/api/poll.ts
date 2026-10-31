/**
 * T-41: exponential backoff with full jitter, a hard deadline, and no
 * retry on errors that will not get better (auth, input, rejection).
 */
import { ApiError, NandeeError, ScanRejectedError, TimeoutError } from "../errors.js";
import type { NandeeApi, ScanRef, ScanStatus } from "./types.js";

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
  random(): number;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: Math.random,
};

export interface PollOptions {
  timeoutMs: number;
  initialDelayMs?: number; // default 2 s
  maxDelayMs?: number; // default 30 s
  /** Transient API errors tolerated in a row before giving up. */
  maxConsecutiveErrors?: number; // default 5
  onTick?: (status: ScanStatus | null, attempt: number) => void;
}

export function nextDelay(attempt: number, initial: number, max: number, random: () => number): number {
  const cap = Math.min(max, initial * 2 ** attempt);
  return Math.floor(random() * cap) + Math.min(initial, cap) / 2;
}

export async function pollUntilDone(api: NandeeApi, ref: ScanRef, clock: Clock, opts: PollOptions): Promise<ScanStatus> {
  const start = clock.now();
  const initial = opts.initialDelayMs ?? 2_000;
  const max = opts.maxDelayMs ?? 30_000;
  const maxErrors = opts.maxConsecutiveErrors ?? 5;
  let errors = 0;
  for (let attempt = 0; ; attempt++) {
    let status: ScanStatus | null = null;
    try {
      status = await api.getScan(ref);
      errors = 0;
    } catch (err) {
      if (err instanceof NandeeError && !(err instanceof ApiError)) throw err; // auth, timeout of a single call is ApiError? no: TimeoutError -> rethrow below
      if (err instanceof TimeoutError) throw err;
      errors++;
      if (errors >= maxErrors) throw err;
    }
    opts.onTick?.(status, attempt);
    if (status?.state === "completed") return status;
    if (status?.state === "rejected") throw new ScanRejectedError(status.rejectionReason ?? "no reason given");
    const elapsed = clock.now() - start;
    if (elapsed >= opts.timeoutMs) {
      throw new TimeoutError(`Scan ${ref.id} did not finish within ${Math.round(opts.timeoutMs / 60_000)} min. Raise timeout_minutes, or set wait_for_completion: false and read the result from the Nandee dashboard.`);
    }
    const delay = Math.min(nextDelay(attempt, initial, max, clock.random), opts.timeoutMs - elapsed);
    await clock.sleep(delay);
  }
}

/** Same loop for a Green Agent fix, which is usually quicker. */
export async function pollFix(api: NandeeApi, ref: ScanRef, findingId: number, clock: Clock, timeoutMs: number) {
  const start = clock.now();
  for (let attempt = 0; ; attempt++) {
    const fix = await api.getFix(ref, findingId);
    if (fix.state !== "pending") return fix;
    if (clock.now() - start >= timeoutMs) return { ...fix, state: "failed" as const, error: "timed out waiting for the fix" };
    await clock.sleep(nextDelay(attempt, 2_000, 15_000, clock.random));
  }
}
