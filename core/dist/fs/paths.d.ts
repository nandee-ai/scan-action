export interface ContainedPath {
    /** Absolute, symlink-resolved path. */
    real: string;
    /** Path relative to the real workspace, with forward slashes, for display and reports. */
    relative: string;
}
/**
 * Resolves `input` against `workspace` and returns it only if the result,
 * after following symlinks, is the workspace or something under it.
 * Rejects absolute paths outside the workspace, `..` escapes, symlinks that
 * point out, `file://` URLs and anything that does not exist.
 */
export declare function containPath(workspace: string, input: string, what: string): Promise<ContainedPath>;
export declare function isRegularFile(p: string): Promise<boolean>;
