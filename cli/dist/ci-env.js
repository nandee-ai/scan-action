/**
 * Git context from the CI systems the CLI is meant for.  Values are data:
 * they are validated by the core (validateGitContext) and never shelled.
 * When no CI variables are present, `git` in the workspace is asked.
 */
import { exec } from "@nandee-ai/ci-core";
function fromEnv(env) {
    if (env.BITRISE_IO) {
        return {
            repoUrl: env.GIT_REPOSITORY_URL, branch: env.BITRISE_GIT_BRANCH, commitSha: env.BITRISE_GIT_COMMIT, prNumber: env.BITRISE_PULL_REQUEST,
            baseBranch: env.BITRISEIO_GIT_BRANCH_DEST, runUrl: env.BITRISE_BUILD_URL, source: "Bitrise",
        };
    }
    if (env.CIRCLECI) {
        const pr = env.CIRCLE_PULL_REQUEST?.split("/").pop();
        return { repoUrl: env.CIRCLE_REPOSITORY_URL, branch: env.CIRCLE_BRANCH, commitSha: env.CIRCLE_SHA1, prNumber: pr, runUrl: env.CIRCLE_BUILD_URL, source: "CircleCI" };
    }
    if (env.TF_BUILD) {
        const branch = env.SYSTEM_PULLREQUEST_SOURCEBRANCH ?? env.BUILD_SOURCEBRANCH;
        const base = env.SYSTEM_PULLREQUEST_TARGETBRANCH;
        const runUrl = env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI && env.SYSTEM_TEAMPROJECT && env.BUILD_BUILDID ? `${env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI}${encodeURIComponent(env.SYSTEM_TEAMPROJECT)}/_build/results?buildId=${env.BUILD_BUILDID}` : undefined;
        return {
            repoUrl: env.BUILD_REPOSITORY_URI, branch: branch?.replace(/^refs\/heads\//, ""), commitSha: env.BUILD_SOURCEVERSION, prNumber: env.SYSTEM_PULLREQUEST_PULLREQUESTNUMBER ?? env.SYSTEM_PULLREQUEST_PULLREQUESTID,
            baseBranch: base?.replace(/^refs\/heads\//, ""), runUrl, source: "Azure DevOps",
        };
    }
    if (env.JENKINS_URL) {
        return {
            repoUrl: env.GIT_URL, branch: (env.CHANGE_BRANCH ?? env.GIT_BRANCH)?.replace(/^origin\//, ""), commitSha: env.GIT_COMMIT, prNumber: env.CHANGE_ID,
            baseBranch: env.CHANGE_TARGET, runUrl: env.BUILD_URL, source: "Jenkins",
        };
    }
    return null;
}
async function fromGit(cwd) {
    const run = async (args) => {
        const r = await exec("git", args, { cwd, timeoutMs: 10_000 });
        return r.code === 0 ? r.stdout.trim() : undefined;
    };
    return {
        repoUrl: await run(["remote", "get-url", "origin"]),
        branch: await run(["rev-parse", "--abbrev-ref", "HEAD"]),
        commitSha: await run(["rev-parse", "HEAD"]),
        source: "git",
    };
}
/** git@host:org/repo → https://host/org/repo; strips credentials. */
export function toHttpsRepoUrl(url) {
    const ssh = url.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+)$/);
    if (ssh)
        return `https://${ssh[1]}/${ssh[2]}`;
    try {
        const u = new URL(url);
        u.username = "";
        u.password = "";
        return u.href;
    }
    catch {
        return url;
    }
}
export async function resolveGitContext(env, cwd, over) {
    const detected = fromEnv(env) ?? (await fromGit(cwd));
    const repoUrl = over.repoUrl ?? detected.repoUrl ?? "";
    const prRaw = over.pr ?? detected.prNumber;
    const pr = prRaw && /^\d+$/.test(prRaw) ? Number(prRaw) : null;
    const git = {
        repoUrl: toHttpsRepoUrl(repoUrl),
        branch: over.branch ?? detected.branch ?? "",
        commitSha: (over.commit ?? detected.commitSha ?? "").toLowerCase(),
        prNumber: pr,
        baseBranch: over.baseBranch ?? detected.baseBranch ?? null,
        isFork: false,
        isPublicRepo: false,
        runUrl: over.runUrl ?? detected.runUrl ?? null,
    };
    return { git, source: detected.source };
}
//# sourceMappingURL=ci-env.js.map