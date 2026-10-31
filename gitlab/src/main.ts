#!/usr/bin/env node
/**
 * Nandee-AI Mobile Application Security Scan: GitLab CI/CD component runner.
 *
 * Runs inside ghcr.io/nandee-ai/scan.  Everything comes in through the
 * environment: the component template maps its spec inputs onto
 * NANDEE_<KEY> variables, the API key is the masked CI/CD variable
 * NANDEE_API_KEY, and git context comes from GitLab's CI_* variables.
 * Nothing from the user is ever interpolated into a shell (T-10).
 *
 * Writes into NANDEE_OUTPUT_DIR (default: the project directory):
 *   gl-sast-report.json, gl-dependency-scanning-report.json  (GitLab security reports)
 *   nandee.env                                              (dotenv report: NANDEE_* outputs)
 *   nandee-summary.md, nandee.sarif
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  allowedHostsFor, buildFixBranch, collectFixes, createHttpClient, createLogger, createNandeeApi, createScrubber, describeError, exec, ExitCode, NandeeError,
  parseInputs, RAW_INPUT_KEYS, realClock, runScan, Secret, stderrSink, toDotenv, toOutputs, TOOL_VERSION, type Logger, type NandeeApi, type Outputs, type RawInputs, type ScanResult,
} from "@nandee-ai/ci-core";
import { gitContextFromGitLab } from "./ci-env.js";
import { openFixMergeRequest, renderFixSection, upsertMergeRequestNote, type GitLabApiRef } from "./reporters/gitlab.js";

export interface RunnerIo {
  env: Record<string, string | undefined>;
  cwd: string;
  stderr: (s: string) => void;
  /** Test hooks. */
  api?: NandeeApi;
  gitlabHttp?: GitLabApiRef["http"];
}

const EMPTY_OUTPUTS: Outputs = { scan_id: "", findings_count: "0", critical_count: "0", high_count: "0", medium_count: "0", low_count: "0", report_url: "", passed: "unknown", platform: "unknown" };

export async function main(io: RunnerIo): Promise<number> {
  const apiKey = io.env.NANDEE_API_KEY;
  const glToken = io.env.NANDEE_GITLAB_TOKEN;
  const secrets = [apiKey, glToken, io.env.CI_JOB_TOKEN].filter((s): s is string => Boolean(s)).map((s) => new Secret(s));
  const log: Logger = createLogger(sinkTo(io.stderr), createScrubber(secrets), { debug: io.env.NANDEE_DEBUG === "true" });
  const outDir = path.resolve(io.cwd, io.env.NANDEE_OUTPUT_DIR || ".");
  const write = async (name: string, content: string) => {
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, name), content, { mode: 0o600 });
  };
  // The dotenv file is best-effort on the early exits: an unwritable output
  // directory must not replace the real exit code with an API error.
  const writeEmptyOutputs = () => write("nandee.env", toDotenv(EMPTY_OUTPUTS)).catch((e: unknown) => log.warn(`Could not write nandee.env: ${describeError(e)}`));

  try {
    const git = gitContextFromGitLab(io.env);
    const scanForks = io.env.NANDEE_SCAN_FORK_MRS === "true";
    if (git.isFork && !scanForks) {
      log.warn("Nandee: merge request from a fork; scans that need the API key are skipped (set NANDEE_SCAN_FORK_MRS: \"true\" to opt in; read the README section on forks first).");
      await writeEmptyOutputs();
      return ExitCode.PASSED;
    }
    if (git.isFork) log.warn("NANDEE_SCAN_FORK_MRS is on: scanning a fork MR. Green Agent fix MRs stay disabled for forks.");
    if (!apiKey) {
      log.error("NANDEE_API_KEY is not set. Add it as a masked (and protected) CI/CD variable; see the README.");
      await writeEmptyOutputs();
      return ExitCode.INVALID_INPUT;
    }

    const raw: RawInputs = { api_key: apiKey };
    for (const key of RAW_INPUT_KEYS) {
      if (key === "api_key") continue;
      raw[key] = io.env[`NANDEE_${key.toUpperCase()}`] || undefined;
    }
    log.info(`Git context: ${git.repoUrl} @ ${git.commitSha.slice(0, 12)} (${git.branch}${git.mergeRequestIid ? `, MR !${git.mergeRequestIid}` : ""})`);
    const inputs = parseInputs(raw, git);

    const extraHosts = [...inputs.extraAllowedHosts];
    const glHost = git.apiV4Url ? safeHost(git.apiV4Url) : null;
    if (glHost) extraHosts.push(glHost);
    const http = createHttpClient({ allowedHosts: allowedHostsFor(inputs.apiUrl, extraHosts), userAgent: `nandee-gitlab/${TOOL_VERSION}` });
    const api = io.api ?? createNandeeApi(http, inputs.apiKey, inputs.apiUrl);
    const gl: GitLabApiRef | null = glToken && git.apiV4Url && git.projectId ? { http: io.gitlabHttp ?? http, apiV4Url: git.apiV4Url, projectId: git.projectId, token: new Secret(glToken) } : null;

    const result = await runScan(inputs, { api, log, workspace: io.cwd });

    // Green Agent
    let fixSection = "";
    if (inputs.greenAgent !== "off" && result.gate && !result.gate.passed && !git.isFork) {
      const fixes = await collectFixes(api, result.scanRef, result.gate.failing, realClock, log).catch((e) => {
        log.warn(`Green Agent: ${describeError(e)}`);
        return null;
      });
      if (fixes?.patches.length) {
        const canOpenMr = inputs.greenAgent !== "comment" && gl !== null && git.fixBase !== null && git.serverUrl !== null && (await gitAvailable());
        if (!canOpenMr) {
          if (inputs.greenAgent !== "comment") log.warn("Green Agent: merge-request mode needs NANDEE_GITLAB_TOKEN and the ghcr.io/nandee-ai/scan:1-git image; showing the patches in the note instead.");
          fixSection = renderFixSection(fixes.patches);
        } else if (gl && git.fixBase && git.serverUrl) {
          const plan = await buildFixBranch(io.cwd, git.commitSha, result.scanId, result.reportUrl, fixes.patches, log);
          try {
            const mr = await openFixMergeRequest(gl, plan, { base: git.fixBase, serverUrl: git.serverUrl, projectUrl: io.env.CI_PROJECT_URL ?? "", scanId: result.scanId, reportUrl: result.reportUrl }, log);
            if (mr) fixSection = `\n\nGreen Agent opened a draft fix merge request: !${mr.iid}`;
          } finally {
            await plan.cleanup();
          }
        }
      } else if (fixes) log.info(`Green Agent: no patches available (${fixes.unavailable.map((u) => u.reason).join("; ")})`);
    }

    await writeReports(result, fixSection, write);
    if (git.isMergeRequest && git.mergeRequestIid !== null) {
      if (gl) await upsertMergeRequestNote(gl, git.mergeRequestIid, result.summaryMarkdown + fixSection, log);
      else log.info("NANDEE_GITLAB_TOKEN not set: no merge request note (reports and the dotenv artifact are still produced).");
    }
    io.stderr(`${result.summaryMarkdown}\n`);

    if (result.passed === null) {
      log.warn("Scan did not complete; passing because fail_mode is open.");
      return ExitCode.PASSED;
    }
    if (!result.passed) log.error(`Nandee: ${result.gate?.reason ?? "gate failed"}. ${result.reportUrl}`);
    return result.passed ? ExitCode.PASSED : ExitCode.GATE_FAILED;
  } catch (err) {
    await writeEmptyOutputs();
    if (err instanceof NandeeError) {
      log.error(`Nandee (exit ${err.exitCode}): ${err.message}`);
      return err.exitCode;
    }
    log.error(`Nandee (exit ${ExitCode.API_ERROR}): ${describeError(err)}`);
    return ExitCode.API_ERROR;
  }
}

async function writeReports(r: ScanResult, fixSection: string, write: (name: string, content: string) => Promise<void>): Promise<void> {
  await write("gl-sast-report.json", JSON.stringify(r.gitlab.sast, null, 2));
  await write("gl-dependency-scanning-report.json", JSON.stringify(r.gitlab.dependencyScanning, null, 2));
  await write("nandee.sarif", JSON.stringify(r.sarif, null, 2));
  await write("nandee-summary.md", r.summaryMarkdown + fixSection);
  await write("nandee.env", toDotenv(toOutputs(r)));
}

/** The distroless image has no git; merge-request mode needs the :1-git image. */
async function gitAvailable(): Promise<boolean> {
  try {
    return (await exec("git", ["--version"], { cwd: process.cwd(), timeoutMs: 5_000 })).code === 0;
  } catch {
    return false;
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function sinkTo(write: (s: string) => void): typeof stderrSink {
  return {
    write(level, line) {
      write(`${level === "info" ? "" : `[${level}] `}${line}\n`);
    },
    startGroup(name) {
      write(`── ${name}\n`);
    },
  };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMain) {
  main({ env: process.env, cwd: process.env.CI_PROJECT_DIR ?? process.cwd(), stderr: (s) => process.stderr.write(s) })
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`${describeError(err)}\n`);
      process.exit(ExitCode.API_ERROR);
    });
}
