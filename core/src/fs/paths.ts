/**
 * T-11: every path that comes from an input is resolved against the
 * workspace and must stay inside it after symlinks are followed.
 */
import { realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { InputError } from "../errors.js";

export interface ContainedPath {
  /** Absolute, symlink-resolved path. */
  real: string;
  /** Path relative to the real workspace, with forward slashes, for display and reports. */
  relative: string;
}

function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Resolves `input` against `workspace` and returns it only if the result,
 * after following symlinks, is the workspace or something under it.
 * Rejects absolute paths outside the workspace, `..` escapes, symlinks that
 * point out, `file://` URLs and anything that does not exist.
 */
export async function containPath(workspace: string, input: string, what: string): Promise<ContainedPath> {
  if (typeof input !== "string" || input.length === 0) {
    throw new InputError(`${what} is empty`);
  }
  if (input.includes("\0")) throw new InputError(`${what} contains a NUL byte`);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    throw new InputError(`${what} must be a path inside the workspace, not a URL: ${input}`);
  }
  let rootReal: string;
  try {
    rootReal = await realpath(workspace);
  } catch {
    throw new InputError(`workspace does not exist: ${workspace}`);
  }
  const joined = path.resolve(rootReal, input);
  if (!isInside(rootReal, joined)) {
    throw new InputError(`${what} resolves outside the workspace: ${input}`);
  }
  let real: string;
  try {
    real = await realpath(joined);
  } catch {
    throw new InputError(`${what} does not exist: ${input}`);
  }
  if (!isInside(rootReal, real)) {
    throw new InputError(`${what} is a link to a location outside the workspace: ${input}`);
  }
  return { real, relative: path.relative(rootReal, real).split(path.sep).join("/") || "." };
}

export async function isRegularFile(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isFile();
  } catch {
    return false;
  }
}
