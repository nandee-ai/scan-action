/**
 * Nandee-AI Mobile Application Security Scan: GitHub Action entry point.
 *
 * Reads inputs, masks secrets, refuses fork PRs unless opted in, runs the
 * shared core, then reports: SARIF to code scanning, a sticky PR comment,
 * the job summary, outputs, and optionally a Green Agent fix PR.
 */
import * as core from "@actions/core";
import * as github from "@actions/github";
import { allowedHostsFor, buildFixBranch, collectFixes, createHttpClient, createLogger, createNandeeApi, createScrubber, describeError, ExitCode, NandeeError, OUTPUT_KEYS, parseInputs, RAW_INPUT_KEYS, realClock, runScan, Secret, toOutputs, TOOL_VERSION, } from "@nandee-ai/ci-core";
import { fromActionsContext, gitContextFromGitHub } from "./context.js";
import { openFixPullRequest, renderFixSection, upsertStickyComment, uploadSarif } from "./reporters/github.js";
const actionsSink = {
    write(level, line) {
        if (level === "debug")
            core.debug(line);
        else if (level === "warn")
            core.warning(line);
        else if (level === "error")
            core.error(line);
        else
            core.info(line);
    },
    startGroup: (n) => core.startGroup(n),
    endGroup: () => core.endGroup(),
};
function setOutputs(r, passed) {
    const o = r ? toOutputs(r) : { scan_id: "", findings_count: "0", critical_count: "0", high_count: "0", medium_count: "0", low_count: "0", report_url: "", passed, platform: "unknown" };
    o.passed = passed;
    for (const k of OUTPUT_KEYS)
        core.setOutput(k, o[k]);
}
export async function run() {
    const apiKeyRaw = core.getInput("api_key");
    if (apiKeyRaw)
        core.setSecret(apiKeyRaw);
    const ghTokenRaw = core.getInput("github_token");
    if (ghTokenRaw)
        core.setSecret(ghTokenRaw);
    const secrets = [apiKeyRaw, ghTokenRaw].filter(Boolean).map((s) => new Secret(s));
    const log = createLogger(actionsSink, createScrubber(secrets), { debug: core.isDebug() });
    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
    try {
        const git = gitContextFromGitHub(fromActionsContext(github.context));
        const scanForks = core.getInput("scan_fork_prs").trim().toLowerCase() === "true";
        if (git.isFork && !scanForks) {
            core.notice("Nandee: pull request from a fork; scans that need the API key are skipped (set scan_fork_prs: true to opt in; see the README before you do).");
            setOutputs(null, "unknown");
            return;
        }
        if (git.isFork)
            log.warn("scan_fork_prs is on: scanning a fork PR. Green Agent fix PRs stay disabled for forks.");
        const raw = {};
        for (const k of RAW_INPUT_KEYS)
            raw[k] = core.getInput(k) || undefined;
        const inputs = parseInputs(raw, git);
        const http = createHttpClient({ allowedHosts: allowedHostsFor(inputs.apiUrl, inputs.extraAllowedHosts), userAgent: `nandee-github-action/${TOOL_VERSION}` });
        const api = createNandeeApi(http, inputs.apiKey, inputs.apiUrl);
        const result = await runScan(inputs, { api, log, workspace });
        const octokit = ghTokenRaw ? github.getOctokit(ghTokenRaw) : null;
        const repo = github.context.repo;
        // Green Agent
        let fixSection = "";
        if (inputs.greenAgent !== "off" && result.gate && !result.gate.passed && !git.isFork) {
            const fixes = await collectFixes(api, result.scanRef, result.gate.failing, realClock, log).catch((e) => {
                log.warn(`Green Agent: ${describeError(e)}`);
                return null;
            });
            if (fixes?.patches.length) {
                if (inputs.greenAgent === "comment")
                    fixSection = renderFixSection(fixes.patches);
                else if (octokit && git.fixBase) {
                    const plan = await buildFixBranch(workspace, git.commitSha, result.scanId, result.reportUrl, fixes.patches, log);
                    try {
                        const pr = await openFixPullRequest(octokit, repo, plan, { base: git.fixBase, token: new Secret(ghTokenRaw), serverUrl: github.context.serverUrl, scanId: result.scanId, reportUrl: result.reportUrl }, log);
                        if (pr)
                            fixSection = `\n\nGreen Agent opened a draft fix PR: #${pr.number}`;
                    }
                    finally {
                        await plan.cleanup();
                    }
                }
            }
            else if (fixes)
                log.info(`Green Agent: no patches available (${fixes.unavailable.map((u) => u.reason).join("; ")})`);
        }
        // Reports
        const body = result.summaryMarkdown + fixSection;
        await core.summary.addRaw(body).write();
        if (octokit) {
            if (result.findings.length)
                await uploadSarif(octokit, repo, { sarif: result.sarif, commitSha: git.commitSha, ref: git.sarifRef, workspace }, log);
            if (git.isPullRequest && git.prNumber !== null)
                await upsertStickyComment(octokit, repo, git.prNumber, body, log);
        }
        else
            log.warn("github_token is empty: SARIF upload and PR comment skipped.");
        setOutputs(result, result.passed === null ? "unknown" : result.passed ? "true" : "false");
        if (result.passed === false)
            core.setFailed(`Nandee: ${result.gate?.reason ?? "gate failed"}. ${result.reportUrl}`);
        else if (result.passed === null)
            log.warn("Scan did not complete; the job passes because fail_mode is open.");
    }
    catch (err) {
        setOutputs(null, "unknown");
        if (err instanceof NandeeError)
            core.setFailed(`Nandee (exit ${err.exitCode}): ${log.scrub(err.message)}`);
        else
            core.setFailed(`Nandee (exit ${ExitCode.API_ERROR}): ${log.scrub(describeError(err))}`);
    }
}
export function isFork(git) {
    return git.isFork;
}
if (process.env.NANDEE_ACTION_NO_AUTORUN !== "1")
    void run();
//# sourceMappingURL=main.js.map