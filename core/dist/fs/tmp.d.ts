export interface TempDir {
    path: string;
    cleanup(): Promise<void>;
}
export declare function createTempDir(prefix?: string): Promise<TempDir>;
/** Runs `fn` with a temp dir and removes the dir afterwards whatever happens. */
export declare function withTempDir<T>(fn: (dir: string) => Promise<T>, prefix?: string): Promise<T>;
