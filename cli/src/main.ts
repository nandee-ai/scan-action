#!/usr/bin/env node
/**
 * nandee: the standalone CLI for CI systems without a native integration.
 *
 *   NANDEE_API_KEY=... nandee scan --project-id acme/app [options]
 *
 * The API key is read from the environment only (T-30): there is no flag
 * for it, so it cannot end up in a process list or a shell history.
 */
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  allowedHostsFor, createHttpClient, createLogger, createMockNandeeApi, createNandeeApi, createScrubber, describeError, ExitCode, InputError, NandeeError,
  parseInputs, RAW_INPUT_KEYS, runScan, Secret, stderrSink, toDotenv, toOutputs, TOOL_VERSION, type NandeeApi, type RawInputs, type ScanResult,
} from "@nandee-ai/ci-core";
import { resolveGitContext } from "./ci-env.js";

const USAGE = `nandee ${TOOL_VERSION}: Nandee-AI Mobile Application Security Scan

Usage:
  nandee scan [options]
  nandee version

The API key comes from the NANDEE_API_KEY environment variable (a CI token
from Nandee Admin → Settings → CI Tokens). There is no flag for it.

Scan options (every one can also be set as NANDEE_<UPPER_SNAKE> in the environment):
  --project-id <name>          Required. Project name shown in Nandee.
  --api-url <https url>        Default https://app.nandee.ai
  --scan-types <list>          sast,sca (default) and/or dast
  --source-path <dir>          Default: current directory
  --artifact-path <file>       APK, AAB or IPA; required for dast
  --platform <p>               auto (default), android, ios, react-native, flutter
  --fail-on-severity <s>       critical, high (default), medium, low, none
  --fail-mode <m>              closed (default) or open
  --ai-triage <bool>           Default true
  --wait-for-completion <bool> Default true
  --timeout-minutes <n>        Default 30
  --baseline-mode <bool>       Default: true when a PR number is known
  --comment-detail <d>         auto (default), counts, full
  --extra-allowed-hosts <list> Extra hosts the client may contact (self-hosted storage)

Git context (detected from Bitrise, CircleCI, Azure DevOps, Jenkins, or git):
  --repo-url <https url>  --branch <name>  --commit <sha>  --pr <number>  --base-branch <name>  --run-url <url>

Output files:
  --sarif <file>          Write SARIF 2.1.0
  --gitlab-dir <dir>      Write gl-sast-report.json and gl-dependency-scanning-report.json
  --summary <file>        Write the Markdown summary
  --dotenv <file>         Write NANDEE_* outputs as KEY=value lines
  --json <file>           Write the full result as JSON (findings included)

Other:
  --debug                 Verbose logging (secrets are still scrubbed)
  --mock                  Use an in-memory Nandee API with sample findings (for trying the CLI)
  -h, --help

Exit codes: 0 passed · 1 gate failed · 2 invalid input · 3 auth failed · 4 timeout · 5 API error · 6 quota or plan limit · 7 scan rejected
`;

const OPTIONS = {
  "project-id": { type: "string" }, "api-url": { type: "string" }, "scan-types": { type: "string" }, "source-path": { type: "string" },
  "artifact-path": { type: "string" }, platform: { type: "string" }, "fail-on-severity": { type: "string" }, "fail-mode": { type: "string" },
  "ai-triage": { type: "string" }, "wait-for-completion": { type: "string" }, "timeout-minutes": { type: "string" }, "baseline-mode": { type: "string" },
  "comment-detail": { type: "string" }, "extra-allowed-hosts": { type: "string" }, "green-agent": { type: "string" },
  "repo-url": { type: "string" }, branch: { type: "string" }, commit: { type: "string" }, pr: { type: "string" }, "base-branch": { type: "string" }, "run-url": { type: "string" },
  sarif: { type: "string" }, "gitlab-dir": { type: "string" }, summary: { type: "string" }, dotenv: { type: "string" }, json: { type: "string" },
  debug: { type: "boolean" }, mock: { type: "boolean" }, help: { type: "boolean", short: "h" },
} as const;

export interface CliIo {
  env: Record<string, string | undefined>;
  cwd: string;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  /** Test hook: replaces the real API. */
  api?: NandeeApi;
}

export async function main(argv: string[], io: CliIo): Promise<number> {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (err) {
    io.stderr(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
    return ExitCode.INVALID_INPUT;
  }
  const { values: v, positionals } = parsed;
  const command = positionals[0];
  if (v.help || !command || command === "help") {
    io.stdout(USAGE);
    return ExitCode.PASSED;
  }
  if (command === "version") {
    io.stdout(`${TOOL_VERSION}\n`);
    return ExitCode.PASSED;
  }
  if (command !== "scan") {
    io.stderr(`Unknown command: ${command}\n\n${USAGE}`);
    return ExitCode.INVALID_INPUT;
  }

  // Inputs: flag, else NANDEE_<KEY> from the environment.
  const raw: RawInputs = {};
  for (const key of RAW_INPUT_KEYS) {
    if (key === "api_key") continue;
    const flag = key.replace(/_/g, "-") as keyof typeof v;
    const fromFlag = v[flag];
    raw[key] = typeof fromFlag === "string" ? fromFlag : io.env[`NANDEE_${key.toUpperCase()}`];
  }
  const apiKey = v.mock ? "ci_mock_mock_mock_mock_mock" : io.env.NANDEE_API_KEY;
  if (!apiKey) {
    io.stderr("NANDEE_API_KEY is not set. Export it from your CI secret store; there is no flag for it.\n");
    return ExitCode.INVALID_INPUT;
  }
  raw.api_key = apiKey;

  const secret = new Secret(apiKey);
  const log = createLogger(stderrSinkTo(io.stderr), createScrubber([secret]), { debug: v.debug === true });

  try {
    const { git, source } = await resolveGitContext(io.env, io.cwd, { repoUrl: v["repo-url"], branch: v.branch, commit: v.commit, pr: v.pr, baseBranch: v["base-branch"], runUrl: v["run-url"] });
    log.info(`Git context from ${source}: ${git.repoUrl} @ ${git.commitSha.slice(0, 12)} (${git.branch}${git.prNumber ? `, PR #${git.prNumber}` : ""})`);
    const inputs = parseInputs(raw, git);

    let api: NandeeApi;
    if (io.api) api = io.api;
    else if (v.mock) {
      const { sourceFindings } = await import("./mock-fixtures.js");
      api = createMockNandeeApi({ sourceFindings, pollsUntilDone: 2 });
      log.warn("--mock: using sample findings, nothing is sent to Nandee");
    } else {
      const http = createHttpClient({ allowedHosts: allowedHostsFor(inputs.apiUrl, inputs.extraAllowedHosts), userAgent: `nandee-cli/${TOOL_VERSION}` });
      api = createNandeeApi(http, inputs.apiKey, inputs.apiUrl);
    }

    const result = await runScan(inputs, { api, log, workspace: io.cwd });
    await writeOutputs(result, v, io);
    io.stdout(`${result.summaryMarkdown}\n`);
    if (result.passed === null) {
      log.warn("Scan did not complete; passing because fail_mode is open.");
      return ExitCode.PASSED;
    }
    return result.passed ? ExitCode.PASSED : ExitCode.GATE_FAILED;
  } catch (err) {
    if (err instanceof NandeeError) {
      log.error(err.message);
      return err.exitCode;
    }
    log.error(`Unexpected error: ${describeError(err)}`);
    return ExitCode.API_ERROR;
  }
}

async function writeOutputs(r: ScanResult, v: Record<string, string | boolean | undefined>, io: CliIo): Promise<void> {
  const out = async (file: string | boolean | undefined, content: string) => {
    if (typeof file !== "string" || !file) return;
    const p = path.resolve(io.cwd, file);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, content, { mode: 0o600 });
  };
  await out(v.sarif, JSON.stringify(r.sarif, null, 2));
  if (typeof v["gitlab-dir"] === "string" && v["gitlab-dir"]) {
    await out(path.join(v["gitlab-dir"], "gl-sast-report.json"), JSON.stringify(r.gitlab.sast, null, 2));
    await out(path.join(v["gitlab-dir"], "gl-dependency-scanning-report.json"), JSON.stringify(r.gitlab.dependencyScanning, null, 2));
  }
  await out(v.summary, r.summaryMarkdown);
  await out(v.dotenv, toDotenv(toOutputs(r)));
  await out(v.json, JSON.stringify({ outputs: toOutputs(r), gate: r.gate && { passed: r.gate.passed, threshold: r.gate.threshold, reason: r.gate.reason, skipped: r.gate.skipped }, findings: r.findings, baseline: r.baseline, timing: r.timing }, null, 2));
}

function stderrSinkTo(write: (s: string) => void): typeof stderrSink {
  return {
    write(level, line) {
      write(`${level === "info" ? "" : `[${level}] `}${line}\n`);
    },
    startGroup(name) {
      write(`── ${name}\n`);
    },
  };
}

// Entry point when run as a binary (not when imported by tests).
const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMain) {
  main(process.argv.slice(2), { env: process.env, cwd: process.cwd(), stdout: (s) => process.stdout.write(s), stderr: (s) => process.stderr.write(s) })
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`${describeError(err)}\n`);
      process.exit(err instanceof InputError ? ExitCode.INVALID_INPUT : ExitCode.API_ERROR);
    });
}
