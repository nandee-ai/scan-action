import { type FixBranchPlan, type Logger, type Secret } from "@nandee-ai/ci-core";
/** The slice of Octokit the reporters call; typed here so tests can fake it without the real client. */
export interface OctokitLike {
    rest: {
        codeScanning: {
            uploadSarif(p: {
                owner: string;
                repo: string;
                commit_sha: string;
                ref: string;
                sarif: string;
                tool_name?: string;
                checkout_uri?: string;
            }): Promise<{
                data: {
                    id?: string;
                    url?: string;
                };
            }>;
        };
        issues: {
            listComments(p: {
                owner: string;
                repo: string;
                issue_number: number;
                per_page: number;
                page: number;
            }): Promise<{
                data: Array<{
                    id: number;
                    body?: string;
                }>;
            }>;
            updateComment(p: {
                owner: string;
                repo: string;
                comment_id: number;
                body: string;
            }): Promise<unknown>;
            createComment(p: {
                owner: string;
                repo: string;
                issue_number: number;
                body: string;
            }): Promise<unknown>;
        };
        pulls: {
            create(p: {
                owner: string;
                repo: string;
                title: string;
                head: string;
                base: string;
                body: string;
                draft?: boolean;
                maintainer_can_modify?: boolean;
            }): Promise<{
                data: {
                    html_url: string;
                    number: number;
                };
            }>;
        };
    };
}
export interface RepoRef {
    owner: string;
    repo: string;
}
export declare function encodeSarif(sarif: object): string;
export declare function uploadSarif(octokit: OctokitLike, repo: RepoRef, args: {
    sarif: object;
    commitSha: string;
    ref: string;
    workspace: string;
}, log: Logger): Promise<boolean>;
/** Finds the comment carrying the marker, updates it, or creates one. */
export declare function upsertStickyComment(octokit: OctokitLike, repo: RepoRef, prNumber: number, body: string, log: Logger): Promise<boolean>;
/**
 * Pushes the fix branch with the token passed through git's environment
 * config (never argv, T-30) and opens a draft PR against `base`.
 */
export declare function openFixPullRequest(octokit: OctokitLike, repo: RepoRef, plan: FixBranchPlan, args: {
    base: string;
    token: Secret;
    serverUrl: string;
    scanId: string;
    reportUrl: string;
}, log: Logger): Promise<{
    url: string;
    number: number;
} | null>;
export declare function fixPrBody(plan: FixBranchPlan, scanId: string, reportUrl: string): string;
/** Green Agent "comment" mode: patches rendered as fenced diffs, with fences inside the diff neutralised. */
export declare function renderFixSection(patches: ReadonlyArray<{
    finding: {
        title: string;
        severity: string;
    };
    diff: string;
    explanation: string | null;
}>): string;
