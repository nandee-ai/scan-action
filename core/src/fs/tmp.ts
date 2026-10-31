/**
 * T-31: scratch space that nobody else on the runner can read and that is
 * always removed, including when the run throws.
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface TempDir {
  path: string;
  cleanup(): Promise<void>;
}

export async function createTempDir(prefix = "nandee-"): Promise<TempDir> {
  // mkdtemp creates with 0700 on POSIX.
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    path: dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/** Runs `fn` with a temp dir and removes the dir afterwards whatever happens. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>, prefix?: string): Promise<T> {
  const tmp = await createTempDir(prefix);
  try {
    return await fn(tmp.path);
  } finally {
    await tmp.cleanup();
  }
}
