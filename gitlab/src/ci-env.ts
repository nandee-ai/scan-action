/**
 * Git context from GitLab's predefined CI variables (T-03: fork detection,
 * T-33: public-project detection).  Every value is data: validated by the
 * core (validateGitContext) and never interpolated into a shell.
 *
 * Variables read (all set by GitLab, none by the user):
 *   CI_PROJECT_URL, CI_PROJECT_ID, CI_PROJECT_VISIBILITY, CI_COMMIT_SHA,
 *   CI_COMMIT_REF_NAME, CI_JOB_URL, CI_API_V4_URL, CI_SERVER_URL,
 *   CI_MERGE_REQUEST_IID, CI_MERGE_REQUEST_SOURCE_BRANCH_NAME,
 *   CI_MERGE_REQUEST_SOURCE_BRANCH_SHA, CI_MERGE_REQUEST_TARGET_BRANCH_NAME,
 *   CI_MERGE_REQUEST_SOURCE_PROJECT_ID, CI_MERGE_REQUEST_SOURCE_PROJECT_URL
 */
import type { GitContext } from "@nandee-ai/ci-core";

type Env = Record<string, string | undefined>;

export interface GitLabGit extends GitContext {
  isMergeRequest: boolean;
  /** Numeric project id used in API paths. */
  projectId: string;
  mergeRequestIid: number | null;
  /** https://gitlab.example.com/api/v4 */
  apiV4Url: string | null;
  /** https://gitlab.example.com */
  serverUrl: string | null;
  /** Branch a fix MR targets: the MR source branch, or the pushed branch. null for forks. */
  fixBase: string | null;
}

function num(v: string | undefined): number | null {
  return v && /^\d{1,12}$/.test(v) ? Number(v) : null;
}

export function gitContextFromGitLab(env: Env): GitLabGit {
  const projectId = env.CI_PROJECT_ID ?? "";
  const projectUrl = env.CI_PROJECT_URL ?? "";
  const mrIid = num(env.CI_MERGE_REQUEST_IID);
  const isMergeRequest = mrIid !== null;
  const sourceProjectId = env.CI_MERGE_REQUEST_SOURCE_PROJECT_ID;
  const isFork = isMergeRequest && sourceProjectId !== undefined && sourceProjectId !== projectId;
  const branch = (isMergeRequest ? env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME : undefined) ?? env.CI_COMMIT_BRANCH ?? env.CI_COMMIT_REF_NAME ?? "";
  // Merged-results pipelines put a merge commit in CI_COMMIT_SHA; the source branch head is what Nandee should scan.
  const commitSha = ((isMergeRequest ? env.CI_MERGE_REQUEST_SOURCE_BRANCH_SHA : undefined) || env.CI_COMMIT_SHA || "").toLowerCase();
  return {
    // For a fork MR, scan the fork at its own URL (the main project cannot serve the commit).
    repoUrl: isFork && env.CI_MERGE_REQUEST_SOURCE_PROJECT_URL ? env.CI_MERGE_REQUEST_SOURCE_PROJECT_URL : projectUrl,
    branch,
    commitSha,
    prNumber: mrIid,
    baseBranch: env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME ?? null,
    isFork,
    isPublicRepo: env.CI_PROJECT_VISIBILITY === "public",
    runUrl: env.CI_JOB_URL ?? null,
    isMergeRequest,
    projectId,
    mergeRequestIid: mrIid,
    apiV4Url: env.CI_API_V4_URL ?? null,
    serverUrl: env.CI_SERVER_URL ?? null,
    fixBase: isFork ? null : branch || null,
  };
}
