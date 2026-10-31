/**
 * T-31: the allow-list of values a run may export (action outputs, GitLab
 * dotenv).  Nothing else leaves the process as an output, so a secret cannot
 * be exported by accident.
 */
import type { ScanResult } from "./run.js";

export interface Outputs {
  scan_id: string;
  findings_count: string;
  critical_count: string;
  high_count: string;
  medium_count: string;
  low_count: string;
  report_url: string;
  passed: "true" | "false" | "unknown";
  platform: string;
}

export const OUTPUT_KEYS: ReadonlyArray<keyof Outputs> = ["scan_id", "findings_count", "critical_count", "high_count", "medium_count", "low_count", "report_url", "passed", "platform"];

export function toOutputs(r: ScanResult): Outputs {
  const c = r.counts;
  return {
    scan_id: r.scanId,
    findings_count: String(r.findings.length),
    critical_count: String(c.critical),
    high_count: String(c.high),
    medium_count: String(c.medium),
    low_count: String(c.low),
    report_url: r.reportUrl,
    passed: r.passed === null ? "unknown" : r.passed ? "true" : "false",
    platform: r.platform,
  };
}

/** GitLab dotenv report format: KEY=value, one per line, values without newlines. */
export function toDotenv(o: Outputs): string {
  return OUTPUT_KEYS.map((k) => `NANDEE_${k.toUpperCase()}=${String(o[k]).replace(/[\r\n]/g, " ")}`).join("\n") + "\n";
}
