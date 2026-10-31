export const OUTPUT_KEYS = ["scan_id", "findings_count", "critical_count", "high_count", "medium_count", "low_count", "report_url", "passed", "platform"];
export function toOutputs(r) {
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
export function toDotenv(o) {
    return OUTPUT_KEYS.map((k) => `NANDEE_${k.toUpperCase()}=${String(o[k]).replace(/[\r\n]/g, " ")}`).join("\n") + "\n";
}
//# sourceMappingURL=outputs.js.map