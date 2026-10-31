/**
 * Git context from the GitHub event payload (T-03: fork detection, T-33:
 * public-repo detection).  The payload is untrusted input; only the fields
 * we need are read, and the core validates them.
 */
import type { GitContext } from "@nandee-ai/ci-core";
/** The subset of @actions/github's context this module reads. */
export interface GhContextLike {
    eventName: string;
    sha: string;
    ref: string;
    serverUrl: string;
    runId: number;
    repo: {
        owner: string;
        repo: string;
    };
    payload: {
        repository?: {
            private?: boolean;
            html_url?: string;
            clone_url?: string;
            default_branch?: string;
        } | undefined;
        pull_request?: {
            number: number;
            head: {
                sha: string;
                ref: string;
                repo: {
                    full_name?: string;
                    fork?: boolean;
                    html_url?: string;
                    clone_url?: string;
                } | null;
            };
            base: {
                ref: string;
                repo: {
                    full_name?: string;
                };
            };
        } | undefined;
    };
}
export interface ActionGit extends GitContext {
    /** True when the event is a pull request (comments and baselines make sense). */
    isPullRequest: boolean;
    /** Ref to attach SARIF to: refs/pull/N/head or the pushed ref. */
    sarifRef: string;
    /** Branch a fix PR should target: the PR's head branch, or the pushed branch. */
    fixBase: string | null;
}
export declare function gitContextFromGitHub(ctx: GhContextLike): ActionGit;
/**
 * Narrows @actions/github's loosely typed context to GhContextLike, checking
 * the fields this module relies on.  A malformed pull_request payload is
 * treated as "not a pull request" rather than trusted.
 */
export declare function fromActionsContext(ctx: {
    eventName: string;
    sha: string;
    ref: string;
    serverUrl: string;
    runId: number;
    repo: {
        owner: string;
        repo: string;
    };
    payload: Record<string, unknown>;
}): GhContextLike;
