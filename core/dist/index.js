/**
 * Public surface of @nandee-ai/ci-core.  The CLI, the GitHub Action and the
 * GitLab wrapper import from here only.
 */
export { runScan, TOOL_VERSION } from "./run.js";
export { parseInputs, validateGitContext, RAW_INPUT_KEYS } from "./inputs.js";
export { Secret, CI_TOKEN_PATTERN } from "./secret.js";
export { createLogger, createScrubber, describeError, stderrSink } from "./log.js";
export { createHttpClient, assertTlsNotWeakened, hostAllowed } from "./http/client.js";
export { createNandeeApi, API_PREFIX } from "./api/client.js";
export { createMockNandeeApi } from "./api/mock.js";
export { realClock } from "./api/poll.js";
export { ExitCode, NandeeError, InputError, AuthError, TimeoutError, ApiError, QuotaError, ScanRejectedError, RedirectError } from "./errors.js";
export { toOutputs, toDotenv, OUTPUT_KEYS } from "./outputs.js";
export { renderSummary, COMMENT_MARKER } from "./render/summary.js";
export { escapeMarkdown, codeSpan, safeLink } from "./render/escape.js";
export { normalize, countBySeverity } from "./convert/normalize.js";
export { evaluateGate } from "./gate.js";
export { collectFixes } from "./fix/request.js";
export { buildFixBranch, fixBranchName, commitMessage } from "./fix/pr.js";
export { exec } from "./exec.js";
export { containPath } from "./fs/paths.js";
export { withTempDir, createTempDir } from "./fs/tmp.js";
/** Hosts the HTTP client may contact for a given API URL (T-34). */
export function allowedHostsFor(apiUrl, extra = []) {
    return [apiUrl.hostname, "*.blob.core.windows.net", ...extra];
}
//# sourceMappingURL=index.js.map