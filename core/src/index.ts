/**
 * Public surface of @nandee-ai/ci-core.  The CLI, the GitHub Action and the
 * GitLab wrapper import from here only.
 */
export { runScan, TOOL_VERSION, type RunDeps, type ScanResult } from "./run.js";
export { parseInputs, validateGitContext, RAW_INPUT_KEYS, type ScanInputs, type RawInputs, type GitContext, type ScanType, type Platform, type Severity, type FailOn, type FailMode, type GreenAgentMode } from "./inputs.js";
export { Secret, CI_TOKEN_PATTERN } from "./secret.js";
export { createLogger, createScrubber, describeError, stderrSink, type Logger, type LogSink, type Scrubber } from "./log.js";
export { createHttpClient, assertTlsNotWeakened, hostAllowed, type HttpClient } from "./http/client.js";
export { createNandeeApi, API_PREFIX } from "./api/client.js";
export { createMockNandeeApi, type MockFixtures } from "./api/mock.js";
export type { NandeeApi, ScanRef, ScanStatus } from "./api/types.js";
export { realClock, type Clock } from "./api/poll.js";
export { ExitCode, NandeeError, InputError, AuthError, TimeoutError, ApiError, QuotaError, ScanRejectedError, RedirectError } from "./errors.js";
export { toOutputs, toDotenv, OUTPUT_KEYS, type Outputs } from "./outputs.js";
export { renderSummary, COMMENT_MARKER } from "./render/summary.js";
export { escapeMarkdown, codeSpan, safeLink } from "./render/escape.js";
export { type Finding, normalize, countBySeverity } from "./convert/normalize.js";
export { evaluateGate, type GateResult } from "./gate.js";
export { collectFixes, type FixPatch, type FixCollection } from "./fix/request.js";
export { buildFixBranch, fixBranchName, commitMessage, type FixBranchPlan } from "./fix/pr.js";
export { exec } from "./exec.js";
export { containPath } from "./fs/paths.js";
export { withTempDir, createTempDir } from "./fs/tmp.js";

/** Hosts the HTTP client may contact for a given API URL (T-34). */
export function allowedHostsFor(apiUrl: URL, extra: ReadonlyArray<string> = []): string[] {
  return [apiUrl.hostname, "*.blob.core.windows.net", ...extra];
}
