/**
 * runScan: the one flow all three front ends call.
 *
 *   contain paths → detect platform → plan what leaves the runner → start
 *   scan(s) → poll → fetch findings → normalise → baseline → gate →
 *   convert (SARIF, GitLab) → summary
 *
 * Errors that mean "the scan did not complete" are turned into a result
 * with `passed: null` when fail_mode is open, and rethrown when it is
 * closed.  Input, auth and quota errors are always rethrown: nobody wants
 * a green job because the API key was wrong.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NandeeApi, ScanRef } from "./api/types.js";
import { pollUntilDone, realClock, type Clock } from "./api/poll.js";
import { diffAgainstBaseline } from "./baseline.js";
import { countBySeverity, normalize, type Finding } from "./convert/normalize.js";
import { isDependencyFinding, toGitLabDependencyScanning, toGitLabSast } from "./convert/gitlab.js";
import { toSarif } from "./convert/sarif.js";
import { ApiError, AuthError, InputError, NandeeError, QuotaError, ScanRejectedError, TimeoutError } from "./errors.js";
import { containPath, isRegularFile } from "./fs/paths.js";
import { evaluateGate, type GateResult } from "./gate.js";
import type { ScanInputs, Severity } from "./inputs.js";
import type { Logger } from "./log.js";
import { artifactPlatform, detectPlatform, type DetectedPlatform } from "./platform/detect.js";
import { renderSummary, type SummaryInput } from "./render/summary.js";
import { planUpload, type UploadPlan } from "./upload/plan.js";

export const TOOL_VERSION = "0.1.0";

export interface ScanResult {
  scanId: string;
  scanRef: ScanRef;
  reportUrl: string;
  dashboardOrigin: string;
  platform: DetectedPlatform | "unknown";
  findings: Finding[];
  counts: Record<Severity, number>;
  gate: GateResult | null;
  /** true/false from the gate; null when the scan did not complete (fail_mode: open). */
  passed: boolean | null;
  outcome: SummaryInput["outcome"];
  baseline: SummaryInput["baseline"];
  uploadPlan: UploadPlan;
  sarif: object;
  gitlab: { sast: object; dependencyScanning: object };
  summaryMarkdown: string;
  timing: { startedAt: Date; finishedAt: Date };
  /** Set when the run also started a binary scan next to a source scan; its findings are merged into `findings`. */
  secondaryScanIds: string[];
}

export interface RunDeps {
  api: NandeeApi;
  log: Logger;
  clock?: Clock;
  workspace: string;
}

function reportPath(ref: ScanRef): string {
  return ref.kind === "source" ? `/source-scans/${ref.id}` : `/scans/${ref.id}`;
}

export async function runScan(inputs: ScanInputs, deps: RunDeps): Promise<ScanResult> {
  const { api, log } = deps;
  const clock = deps.clock ?? realClock;
  const startedAt = new Date(clock.now());
  const dashboardOrigin = inputs.apiUrl.origin;

  // 1. Paths (T-11)
  const source = await containPath(deps.workspace, inputs.sourcePath, "source_path");
  let artifact: { real: string; relative: string } | null = null;
  if (inputs.artifactPath) {
    artifact = await containPath(deps.workspace, inputs.artifactPath, "artifact_path");
    if (!(await isRegularFile(artifact.real))) throw new InputError(`artifact_path is not a file: ${inputs.artifactPath}`);
  }

  // 2. Platform
  let platform: DetectedPlatform | "unknown" = inputs.platform === "auto" ? "unknown" : inputs.platform;
  if (inputs.platform === "auto") {
    const d = await detectPlatform(source.real);
    if (d) {
      platform = d.platform;
      log.info(`Detected platform: ${d.platform} (${d.evidence.join(", ")})`);
    } else if (artifact) {
      platform = artifactPlatform(artifact.relative) ?? "unknown";
    }
    if (platform === "unknown") log.warn("Could not detect the platform from build files; set `platform` to pin it.");
  }

  // 3. Plan (T-32)
  const uploadPlan = planUpload(inputs, artifact?.relative ?? null);
  for (const line of uploadPlan.describe) log.info(line);

  // 4. Start
  const refs: ScanRef[] = [];
  const projectTitle = inputs.projectId;
  try {
    if (uploadPlan.source) {
      const ref = await api.startSourceScan({
        repoUrl: inputs.git.repoUrl,
        ref: inputs.git.commitSha,
        target: "mobile",
        scanners: uploadPlan.source.scanners,
        projectTitle,
        git: { repoUrl: inputs.git.repoUrl, branch: inputs.git.branch, commitSha: inputs.git.commitSha, prNumber: inputs.git.prNumber, runUrl: inputs.git.runUrl },
      });
      log.info(`Source scan started: ${ref.id}`);
      refs.push(ref);
    }
    if (uploadPlan.artifact && artifact) {
      const bytes = await readFile(artifact.real);
      log.info(`Uploading ${artifact.relative} (${bytes.byteLength} bytes)`);
      const ref = await api.uploadBinary({ name: path.basename(artifact.real), bytes }, { projectTitle, description: `commit ${inputs.git.commitSha}${inputs.git.runUrl ? ` · run ${inputs.git.runUrl}` : ""}` });
      log.info(`Binary scan started: ${ref.id}`);
      refs.push(ref);
    }
  } catch (err) {
    return handleNotCompleted(err, inputs, { refs, platform, uploadPlan, dashboardOrigin, startedAt, clock, log });
  }
  const primary = refs[0];
  if (!primary) throw new InputError("Nothing to scan: scan_types produced no work");
  const reportUrl = `${dashboardOrigin}${reportPath(primary)}`;

  // 5. Wait (or not)
  if (!inputs.waitForCompletion) {
    const outcome = { kind: "started" as const, note: "wait_for_completion is false; results are in the Nandee dashboard." };
    return finish({ inputs, refs, primary, reportUrl, dashboardOrigin, platform, uploadPlan, findings: [], gate: null, passed: true, outcome, baseline: null, startedAt, clock });
  }
  const timeoutMs = inputs.timeoutMinutes * 60_000;
  const deadline = clock.now() + timeoutMs;
  const findings: Finding[] = [];
  try {
    for (const ref of refs) {
      await pollUntilDone(api, ref, clock, {
        timeoutMs: Math.max(1_000, deadline - clock.now()),
        onTick: (s, n) => {
          if (n % 5 === 0) log.info(`Waiting for ${ref.kind} scan ${ref.id}: ${s?.state ?? "unknown"}`);
        },
      });
      findings.push(...normalize(await api.getFindings(ref)));
    }
  } catch (err) {
    return handleNotCompleted(err, inputs, { refs, platform, uploadPlan, dashboardOrigin, startedAt, clock, log });
  }

  // 6. Baseline (assumption Q6)
  let baseline: SummaryInput["baseline"] = null;
  let newOnly: Finding[] | null = null;
  if (inputs.baselineMode && inputs.git.baseBranch && primary.kind === "source") {
    try {
      const baseRef = await api.findBaselineScan(inputs.git.repoUrl, inputs.git.baseBranch, "mobile");
      if (baseRef) {
        const baseFindings = normalize(await api.getFindings(baseRef));
        const diff = diffAgainstBaseline(findings, baseFindings);
        newOnly = diff.newFindings;
        baseline = { used: true, newCount: diff.newFindings.length, fixedCount: diff.fixed.length };
        log.info(`Baseline ${baseRef.id} (${inputs.git.baseBranch}): ${diff.newFindings.length} new, ${diff.existing.length} existing, ${diff.fixed.length} fixed`);
      } else {
        log.warn(`No completed scan of ${inputs.git.baseBranch} found for a baseline; all findings count.`);
        baseline = { used: false, newCount: findings.length, fixedCount: 0 };
      }
    } catch (err) {
      log.warn(`Baseline lookup failed; all findings count. ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 7. Gate
  const gate = evaluateGate(findings, { failOnSeverity: inputs.failOnSeverity, aiTriage: inputs.aiTriage, newOnly });
  log.info(gate.passed ? `Gate passed: ${gate.reason}` : `Gate failed: ${gate.reason}`);
  return finish({ inputs, refs, primary, reportUrl, dashboardOrigin, platform, uploadPlan, findings, gate, passed: gate.passed, outcome: { kind: "completed" }, baseline, startedAt, clock });
}

interface FinishArgs {
  inputs: ScanInputs;
  refs: ScanRef[];
  primary: ScanRef;
  reportUrl: string;
  dashboardOrigin: string;
  platform: DetectedPlatform | "unknown";
  uploadPlan: UploadPlan;
  findings: Finding[];
  gate: GateResult | null;
  passed: boolean | null;
  outcome: SummaryInput["outcome"];
  baseline: SummaryInput["baseline"];
  startedAt: Date;
  clock: Clock;
}

function finish(a: FinishArgs): ScanResult {
  const finishedAt = new Date(a.clock.now());
  const { inputs } = a;
  const scanPath = reportPath(a.primary);
  const gl = { toolVersion: TOOL_VERSION, startedAt: a.startedAt, finishedAt, dashboardUrl: a.reportUrl };
  const deps = a.findings.filter(isDependencyFinding);
  const rest = a.findings.filter((f) => !isDependencyFinding(f));
  const detail = inputs.commentDetail === "auto" ? (inputs.git.isPublicRepo ? "counts" : "full") : inputs.commentDetail;
  const summaryMarkdown = renderSummary({
    scanId: a.primary.id,
    scanKind: a.primary.kind,
    reportUrl: a.reportUrl,
    dashboardOrigin: a.dashboardOrigin,
    commitSha: inputs.git.commitSha,
    platform: a.platform,
    scanTypes: inputs.scanTypes,
    findings: a.findings,
    gate: a.gate,
    failMode: inputs.failMode,
    outcome: a.outcome,
    baseline: a.baseline,
    uploadPlan: a.uploadPlan.describe,
    detail,
  });
  return {
    scanId: a.primary.id,
    scanRef: a.primary,
    reportUrl: a.reportUrl,
    dashboardOrigin: a.dashboardOrigin,
    platform: a.platform,
    findings: a.findings,
    counts: countBySeverity(a.findings),
    gate: a.gate,
    passed: a.passed,
    outcome: a.outcome,
    baseline: a.baseline,
    uploadPlan: a.uploadPlan,
    sarif: toSarif(a.findings, { toolVersion: TOOL_VERSION, dashboardOrigin: a.dashboardOrigin, scanPath, commitSha: inputs.git.commitSha, repoUrl: inputs.git.repoUrl }),
    gitlab: { sast: toGitLabSast(rest, gl), dependencyScanning: toGitLabDependencyScanning(deps, gl) },
    summaryMarkdown,
    timing: { startedAt: a.startedAt, finishedAt },
    secondaryScanIds: a.refs.slice(1).map((r) => r.id),
  };
}

/** T-40: decide whether an incomplete scan is a failure or a warning. */
function handleNotCompleted(err: unknown, inputs: ScanInputs, ctx: { refs: ScanRef[]; platform: DetectedPlatform | "unknown"; uploadPlan: UploadPlan; dashboardOrigin: string; startedAt: Date; clock: Clock; log: Logger }): ScanResult {
  // These never pass, whatever fail_mode says.
  if (err instanceof InputError || err instanceof AuthError || err instanceof QuotaError || err instanceof ScanRejectedError) throw err;
  if (!(err instanceof NandeeError)) throw err;
  if (inputs.failMode === "closed") throw err;
  const reason = err instanceof TimeoutError ? err.message : err instanceof ApiError ? err.message : String(err);
  ctx.log.warn(`fail_mode is open: passing with passed=unknown. ${reason}`);
  const primary: ScanRef = ctx.refs[0] ?? { kind: "source", id: "none" };
  return finish({
    inputs,
    refs: ctx.refs,
    primary,
    reportUrl: `${ctx.dashboardOrigin}${ctx.refs[0] ? reportPath(primary) : "/source-scans"}`,
    dashboardOrigin: ctx.dashboardOrigin,
    platform: ctx.platform,
    uploadPlan: ctx.uploadPlan,
    findings: [],
    gate: null,
    passed: null,
    outcome: { kind: "not-completed", reason },
    baseline: null,
    startedAt: ctx.startedAt,
    clock: ctx.clock,
  });
}
