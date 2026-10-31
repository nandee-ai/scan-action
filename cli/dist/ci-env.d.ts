/**
 * Git context from the CI systems the CLI is meant for.  Values are data:
 * they are validated by the core (validateGitContext) and never shelled.
 * When no CI variables are present, `git` in the workspace is asked.
 */
import { type GitContext } from "@nandee-ai/ci-core";
type Env = Record<string, string | undefined>;
/** git@host:org/repo → https://host/org/repo; strips credentials. */
export declare function toHttpsRepoUrl(url: string): string;
export interface GitOverrides {
    repoUrl?: string | undefined;
    branch?: string | undefined;
    commit?: string | undefined;
    pr?: string | undefined;
    baseBranch?: string | undefined;
    runUrl?: string | undefined;
}
export declare function resolveGitContext(env: Env, cwd: string, over: GitOverrides): Promise<{
    git: GitContext;
    source: string;
}>;
export {};
