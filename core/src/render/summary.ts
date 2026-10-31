/**
 * The summary table rendered in PR comments, MR notes and job summaries.
 * Same Markdown everywhere; every untrusted string goes through escape.ts.
 */
import { countBySeverity, SEVERITY_RANK, type Finding } from "../convert/normalize.js";
import type { GateResult } from "../gate.js";
import type { FailMode, Severity } from "../inputs.js";
import { codeSpan, escapeMarkdown, safeLink } from "./escape.js";

/** Hidden marker used to find and update the sticky comment. */
export const COMMENT_MARKER = "<!-- nandee-scan-summary -->";

export interface SummaryInput {
  scanId: string;
  scanKind: "source" | "binary";
  reportUrl: string;
  dashboardOrigin: string;
  commitSha: string;
  platform: string;
  scanTypes: string[];
  findings: ReadonlyArray<Finding>;
  gate: GateResult | null;
  failMode: FailMode;
  /** When the scan could not be completed (outage, timeout): what happened. */
  outcome: { kind: "completed" } | { kind: "not-completed"; reason: string } | { kind: "started"; note: string };
  baseline: { used: boolean; newCount: number; fixedCount: number } | null;
  uploadPlan: ReadonlyArray<string>;
  detail: "counts" | "full";
  maxListed?: number;
}

const ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
const ICON: Record<Severity, string> = { critical: "🟥", high: "🟧", medium: "🟨", low: "🟦", info: "⬜" };

export function renderSummary(s: SummaryInput): string {
  const lines: string[] = [COMMENT_MARKER, `## Nandee security scan`, ""];
  const link = safeLink("Open in Nandee", s.reportUrl, s.dashboardOrigin);

  if (s.outcome.kind === "not-completed") {
    const verdict = s.failMode === "closed" ? "**Failed (fail_mode: closed)**" : "**Passed with a warning (fail_mode: open)**";
    lines.push(`${verdict}: the scan did not complete. ${escapeMarkdown(s.outcome.reason, 500)}`, "", `Scan ${codeSpan(s.scanId)} · ${link}`);
    return lines.join("\n");
  }
  if (s.outcome.kind === "started") {
    lines.push(`Scan ${codeSpan(s.scanId)} started and not waited for. ${escapeMarkdown(s.outcome.note, 300)}`, "", link);
    return lines.join("\n");
  }

  const gate = s.gate;
  if (gate) {
    lines.push(gate.passed ? `**Passed**: ${escapeMarkdown(gate.reason)}.` : `**Failed**: ${escapeMarkdown(gate.reason)}.`);
  }
  lines.push("", `Platform ${codeSpan(s.platform)} · scan types ${codeSpan(s.scanTypes.join(", "))} · commit ${codeSpan(s.commitSha.slice(0, 12))} · ${link}`, "");

  const counts = countBySeverity(s.findings);
  const open = gate ? countBySeverity(gate.considered) : counts;
  lines.push("| Severity | Findings | Counted toward the gate |", "|---|---:|---:|");
  for (const sev of ORDER) lines.push(`| ${ICON[sev]} ${sev} | ${counts[sev]} | ${open[sev]} |`);
  lines.push("");

  if (gate) {
    const notes: string[] = [];
    if (gate.skipped.closed) notes.push(`${gate.skipped.closed} already resolved or accepted`);
    if (gate.skipped.falsePositive) notes.push(`${gate.skipped.falsePositive} marked false positive by AI triage`);
    if (s.baseline?.used) notes.push(`${gate.skipped.baseline} already present on the base branch`);
    if (notes.length) lines.push(`Not counted: ${notes.join("; ")}.`);
    if (s.baseline?.used) lines.push(`Baseline: ${s.baseline.newCount} new, ${s.baseline.fixedCount} no longer present.`);
    lines.push(`Gate: fail on ${codeSpan(gate.threshold)} and above.`, "");
  }

  if (s.detail === "full" && gate && gate.failing.length) {
    const max = s.maxListed ?? 10;
    lines.push(`### Top findings`, "", "| Severity | Finding | Location | Triage |", "|---|---|---|---|");
    const top = [...gate.failing].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]).slice(0, max);
    for (const f of top) {
      const loc = f.location ? codeSpan(`${f.location.path}${f.location.line ? `:${f.location.line}` : ""}`) : "";
      lines.push(`| ${ICON[f.severity]} ${f.severity} | ${escapeMarkdown(f.title, 120)} | ${loc} | ${escapeMarkdown(f.verdict)} |`);
    }
    if (gate.failing.length > max) lines.push("", `…and ${gate.failing.length - max} more in Nandee.`);
    lines.push("");
  } else if (s.detail === "counts" && gate && gate.failing.length) {
    lines.push(`Finding titles are not shown here because this repository is public. Open the scan in Nandee for details, or set ${codeSpan("comment_detail: full")}.`, "");
  }

  lines.push("<details><summary>What left this runner</summary>", "", ...s.uploadPlan.map((p) => `- ${escapeMarkdown(p, 400)}`), "", "</details>", "");
  lines.push(`<sub>Nandee reports support your compliance work; they are not an attestation or audit opinion.</sub>`);
  return lines.join("\n");
}
