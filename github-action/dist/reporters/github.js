/**
 * GitHub-side reporting: SARIF upload to code scanning, the sticky PR
 * comment, and the fix pull request.  Octokit is injected so tests use a
 * fake; every failure here is reported as a warning with the permission
 * the step needs (T-50), and never fails the gate decision.
 */
import { gzipSync } from "node:zlib";
import { COMMENT_MARKER, escapeMarkdown, exec } from "@nandee-ai/ci-core";
function statusOf(err) {
    return err && typeof err === "object" && "status" in err && typeof err.status === "number" ? err.status : null;
}
export function encodeSarif(sarif) {
    return gzipSync(Buffer.from(JSON.stringify(sarif), "utf8")).toString("base64");
}
export async function uploadSarif(octokit, repo, args, log) {
    try {
        const r = await octokit.rest.codeScanning.uploadSarif({ ...repo, commit_sha: args.commitSha, ref: args.ref, sarif: encodeSarif(args.sarif), tool_name: "Nandee", checkout_uri: `file://${args.workspace}` });
        log.info(`SARIF uploaded to code scanning${r.data.id ? ` (upload ${r.data.id})` : ""}. Findings appear in the Security tab once GitHub processes it.`);
        return true;
    }
    catch (err) {
        const st = statusOf(err);
        if (st === 403 || st === 404)
            log.warn("SARIF upload skipped: the token lacks `security-events: write`, or code scanning is not enabled for this repository (GitHub Advanced Security on private repos).");
        else
            log.warn(`SARIF upload failed: ${err instanceof Error ? err.message : String(err)}`);
        return false;
    }
}
/** Finds the comment carrying the marker, updates it, or creates one. */
export async function upsertStickyComment(octokit, repo, prNumber, body, log) {
    if (!body.includes(COMMENT_MARKER))
        throw new Error("comment body is missing the marker");
    try {
        let existing = null;
        for (let page = 1; page <= 5 && existing === null; page++) {
            const { data } = await octokit.rest.issues.listComments({ ...repo, issue_number: prNumber, per_page: 100, page });
            existing = data.find((c) => c.body?.includes(COMMENT_MARKER))?.id ?? null;
            if (data.length < 100)
                break;
        }
        if (existing !== null)
            await octokit.rest.issues.updateComment({ ...repo, comment_id: existing, body });
        else
            await octokit.rest.issues.createComment({ ...repo, issue_number: prNumber, body });
        log.info(existing !== null ? "Updated the Nandee PR comment." : "Posted the Nandee PR comment.");
        return true;
    }
    catch (err) {
        const st = statusOf(err);
        if (st === 403)
            log.warn("PR comment skipped: the token lacks `pull-requests: write` (fork PRs get a read-only token).");
        else
            log.warn(`PR comment failed: ${err instanceof Error ? err.message : String(err)}`);
        return false;
    }
}
/**
 * Pushes the fix branch with the token passed through git's environment
 * config (never argv, T-30) and opens a draft PR against `base`.
 */
export async function openFixPullRequest(octokit, repo, plan, args, log) {
    if (!plan.commitSha || plan.applied.length === 0) {
        log.info("Green Agent: no patch applied, no PR opened.");
        return null;
    }
    if (plan.branchName === args.base)
        throw new Error("refusing to push the fix onto the source branch (T-15)");
    const remote = `${args.serverUrl}/${repo.owner}/${repo.repo}.git`;
    const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${args.token.expose()}`).toString("base64")}`;
    const push = await exec("git", ["push", "--quiet", "--", remote, `HEAD:refs/heads/${plan.branchName}`], {
        cwd: plan.repoDir,
        timeoutMs: 120_000,
        env: { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `http.${args.serverUrl}/.extraheader`, GIT_CONFIG_VALUE_0: header, GIT_TERMINAL_PROMPT: "0" },
    });
    if (push.code !== 0) {
        log.warn(`Green Agent: push of ${plan.branchName} failed (needs \`contents: write\`): ${push.stderr.replace(header, "[redacted]").slice(0, 300)}`);
        return null;
    }
    const title = `fix(security): ${plan.applied.length} Nandee Green Agent patch${plan.applied.length === 1 ? "" : "es"}`;
    const body = fixPrBody(plan, args.scanId, args.reportUrl);
    try {
        const pr = await octokit.rest.pulls.create({ ...repo, title, head: plan.branchName, base: args.base, body, draft: true, maintainer_can_modify: true });
        log.info(`Green Agent: opened ${pr.data.html_url}`);
        return { url: pr.data.html_url, number: pr.data.number };
    }
    catch (err) {
        const st = statusOf(err);
        log.warn(st === 403 ? "Green Agent: branch pushed but the PR could not be opened: the token lacks `pull-requests: write`, or 'Allow GitHub Actions to create pull requests' is off in the repository settings." : `Green Agent: PR creation failed: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
export function fixPrBody(plan, scanId, reportUrl) {
    const lines = [
        `${COMMENT_MARKER.replace("summary", "fix-pr")}`,
        `Patches written by Nandee Green Agent for scan \`${scanId.replace(/[^A-Za-z0-9_-]/g, "")}\` on commit \`${plan.baseSha.slice(0, 12)}\`.`,
        "",
        "**Review every change before merging.** These were generated by an AI agent; they compile only if your build says so.",
        "",
        "| Severity | Finding | Explanation |",
        "|---|---|---|",
        ...plan.applied.map((p) => `| ${escapeMarkdown(p.finding.severity)} | ${escapeMarkdown(p.finding.title, 120)} | ${escapeMarkdown(p.explanation ?? "", 300)} |`),
    ];
    if (plan.rejected.length) {
        lines.push("", "Not applied:", ...plan.rejected.map((r) => `- ${escapeMarkdown(r.patch.finding.title, 120)}: ${escapeMarkdown(r.reason, 200)}`));
    }
    lines.push("", `Report: ${reportUrl}`);
    return lines.join("\n");
}
/** Green Agent "comment" mode: patches rendered as fenced diffs, with fences inside the diff neutralised. */
export function renderFixSection(patches) {
    if (!patches.length)
        return "";
    const out = ["", "### Green Agent suggested fixes", ""];
    for (const p of patches) {
        const diff = p.diff.replace(/```/g, "`​`​`").slice(0, 20_000);
        out.push(`<details><summary>${escapeMarkdown(p.finding.severity)}: ${escapeMarkdown(p.finding.title, 120)}</summary>`, "", escapeMarkdown(p.explanation ?? "", 500), "", "```diff", diff, "```", "", "</details>", "");
    }
    return out.join("\n");
}
//# sourceMappingURL=github.js.map