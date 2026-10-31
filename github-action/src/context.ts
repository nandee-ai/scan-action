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
  repo: { owner: string; repo: string };
  payload: {
    repository?: { private?: boolean; html_url?: string; clone_url?: string; default_branch?: string } | undefined;
    pull_request?: {
      number: number;
      head: { sha: string; ref: string; repo: { full_name?: string; fork?: boolean; html_url?: string; clone_url?: string } | null };
      base: { ref: string; repo: { full_name?: string } };
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

export function gitContextFromGitHub(ctx: GhContextLike): ActionGit {
  const repoFullName = `${ctx.repo.owner}/${ctx.repo.repo}`;
  const repoUrl = ctx.payload.repository?.html_url ?? `${ctx.serverUrl}/${repoFullName}`;
  const runUrl = `${ctx.serverUrl}/${repoFullName}/actions/runs/${ctx.runId}`;
  const isPublicRepo = ctx.payload.repository?.private === false;
  const pr = ctx.payload.pull_request;

  if (pr) {
    const headRepo = pr.head.repo;
    const isFork = !headRepo || headRepo.fork === true || (typeof headRepo.full_name === "string" && headRepo.full_name.toLowerCase() !== repoFullName.toLowerCase());
    return {
      // Scan the PR's own commit at the repository Nandee can clone: for a fork that is the fork's URL.
      repoUrl: isFork && headRepo?.html_url ? headRepo.html_url : repoUrl,
      branch: pr.head.ref,
      commitSha: pr.head.sha,
      prNumber: pr.number,
      baseBranch: pr.base.ref,
      isFork,
      isPublicRepo,
      runUrl,
      isPullRequest: true,
      sarifRef: `refs/pull/${pr.number}/head`,
      fixBase: isFork ? null : pr.head.ref,
    };
  }
  const branch = ctx.ref.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");
  return {
    repoUrl,
    branch,
    commitSha: ctx.sha,
    prNumber: null,
    baseBranch: null,
    isFork: false,
    isPublicRepo,
    runUrl,
    isPullRequest: false,
    sarifRef: ctx.ref,
    fixBase: ctx.ref.startsWith("refs/heads/") ? branch : null,
  };
}

/**
 * Narrows @actions/github's loosely typed context to GhContextLike, checking
 * the fields this module relies on.  A malformed pull_request payload is
 * treated as "not a pull request" rather than trusted.
 */
export function fromActionsContext(ctx: { eventName: string; sha: string; ref: string; serverUrl: string; runId: number; repo: { owner: string; repo: string }; payload: Record<string, unknown> }): GhContextLike {
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  const str = (v: unknown): v is string => typeof v === "string";
  const repoRaw = ctx.payload.repository;
  const repository = isObj(repoRaw)
    ? { ...(typeof repoRaw.private === "boolean" ? { private: repoRaw.private } : {}), ...(str(repoRaw.html_url) ? { html_url: repoRaw.html_url } : {}) }
    : undefined;
  let pull_request: GhContextLike["payload"]["pull_request"];
  const pr = ctx.payload.pull_request;
  if (isObj(pr) && typeof pr.number === "number" && isObj(pr.head) && isObj(pr.base) && str(pr.head.sha) && str(pr.head.ref) && str(pr.base.ref)) {
    const hr = pr.head.repo;
    const headRepo = isObj(hr)
      ? { ...(str(hr.full_name) ? { full_name: hr.full_name } : {}), ...(typeof hr.fork === "boolean" ? { fork: hr.fork } : {}), ...(str(hr.html_url) ? { html_url: hr.html_url } : {}) }
      : null;
    const br = pr.base.repo;
    pull_request = { number: pr.number, head: { sha: pr.head.sha, ref: pr.head.ref, repo: headRepo }, base: { ref: pr.base.ref, repo: isObj(br) && str(br.full_name) ? { full_name: br.full_name } : {} } };
  }
  return { eventName: ctx.eventName, sha: ctx.sha, ref: ctx.ref, serverUrl: ctx.serverUrl, runId: ctx.runId, repo: ctx.repo, payload: { repository, pull_request } };
}
