/**
 * Green Agent: collect patches for the findings that failed the gate.
 *
 * Assumption Q8: a finding may already carry `fix_diff`; otherwise we ask
 * Nandee to generate one and poll.  Patches are data: they are applied with
 * `git apply --check` first by the front end (fix/pr.ts), never executed.
 */
import type { NandeeApi, ScanRef } from "../api/types.js";
import { pollFix, type Clock } from "../api/poll.js";
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
  unavailable: Array<{ finding: Finding; reason: string }>;
}

const MAX_FIXES = 20;
const MAX_DIFF_BYTES = 512 * 1024;

export async function collectFixes(api: NandeeApi, ref: ScanRef, findings: ReadonlyArray<Finding>, clock: Clock, log: Logger, opts: { perFixTimeoutMs?: number } = {}): Promise<FixCollection> {
  const patches: FixPatch[] = [];
  const unavailable: FixCollection["unavailable"] = [];
  const timeout = opts.perFixTimeoutMs ?? 3 * 60_000;

  for (const f of findings.slice(0, MAX_FIXES)) {
    if (f.fix?.diff) {
      patches.push({ finding: f, diff: f.fix.diff, explanation: f.fix.explanation });
      continue;
    }
    if (ref.kind !== "source") {
      unavailable.push({ finding: f, reason: "binary scan findings have no source patch" });
      continue;
    }
    const id = Number(f.id);
    if (!Number.isInteger(id)) {
      unavailable.push({ finding: f, reason: "finding id is not numeric" });
      continue;
    }
    try {
      await api.requestFix(ref, id);
      const fix = await pollFix(api, ref, id, clock, timeout);
      if (fix.state === "ready" && fix.diff) {
        if (Buffer.byteLength(fix.diff) > MAX_DIFF_BYTES) {
          unavailable.push({ finding: f, reason: "patch is larger than 512 KB" });
          continue;
        }
        patches.push({ finding: f, diff: fix.diff, explanation: fix.explanation });
      } else {
        unavailable.push({ finding: f, reason: fix.error ?? "no patch returned" });
      }
    } catch (err) {
      log.warn(`Fix request for finding ${f.id} failed: ${err instanceof Error ? err.message : String(err)}`);
      unavailable.push({ finding: f, reason: "fix request failed" });
    }
  }
  for (const f of findings.slice(MAX_FIXES)) unavailable.push({ finding: f, reason: `more than ${MAX_FIXES} findings; fix the first ${MAX_FIXES} first` });
  return { patches, unavailable };
}
