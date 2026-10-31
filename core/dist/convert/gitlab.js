/**
 * Finding[] → GitLab security report JSON (schema 15.x).
 *   gl-sast-report.json                 for sast + dast findings
 *   gl-dependency-scanning-report.json  for sca findings (those with a dependency)
 * https://gitlab.com/gitlab-org/security-products/security-report-schemas
 */
import { createHash } from "node:crypto";
const SEV = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
function ts(d) {
    return d.toISOString().replace(/\.\d{3}Z$/, "");
}
function uuidFor(f, category) {
    const h = createHash("sha256").update(`${category}:${f.fingerprint}:${f.id}`).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function identifiers(f) {
    const ids = [{ type: "nandee_finding_id", name: `Nandee finding ${f.id}`, value: f.id }];
    if (f.cwe) {
        const m = f.cwe.match(/(\d+)/);
        if (m)
            ids.push({ type: "cwe", name: `CWE-${m[1]}`, value: m[1], url: `https://cwe.mitre.org/data/definitions/${m[1]}.html` });
    }
    for (const m of f.masvs)
        ids.push({ type: "owasp_masvs", name: m, value: m });
    if (f.owasp)
        ids.push({ type: "owasp", name: f.owasp.slice(0, 120), value: f.owasp.slice(0, 120) });
    return ids;
}
function scanBlock(type, meta) {
    const scanner = { id: "nandee", name: "Nandee", version: meta.toolVersion, vendor: { name: "Nandee-AI" }, url: "https://www.nandee.ai" };
    return { scanner, analyzer: scanner, type, start_time: ts(meta.startedAt), end_time: ts(meta.finishedAt), status: "success" };
}
function solution(f) {
    return (f.suggestion ?? "").slice(0, 4000) || `See the Nandee dashboard for remediation guidance.`;
}
/** Findings that describe a third-party package go to the dependency report. */
export function isDependencyFinding(f) {
    const p = f.location?.path ?? "";
    return /(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|pubspec\.(yaml|lock)|Podfile(\.lock)?|build\.gradle(\.kts)?|gradle\.lockfile|Package\.(swift|resolved)|go\.sum|requirements\.txt)$/.test(p) || /\bdependenc|\bvulnerable (package|library)|\bCVE-\d{4}-\d+/i.test(`${f.title} ${f.ruleId}`);
}
export function toGitLabSast(findings, meta) {
    return {
        version: "15.2.2",
        vulnerabilities: findings.map((f) => ({
            id: uuidFor(f, "sast"),
            category: "sast",
            name: f.title.slice(0, 255),
            description: (f.detail || f.title).slice(0, 4000),
            cve: f.fingerprint,
            severity: SEV[f.severity],
            confidence: f.verdict === "exploitable" ? "Confirmed" : f.verdict === "false_positive" ? "Ignore" : "Unknown",
            solution: solution(f),
            scanner: { id: "nandee", name: "Nandee" },
            location: f.location ? { file: f.location.path, start_line: f.location.line ?? 1, end_line: f.location.line ?? 1 } : { file: "", start_line: 1 },
            identifiers: identifiers(f),
            links: [{ name: "Nandee dashboard", url: meta.dashboardUrl }],
            details: {
                verdict: { name: "AI triage verdict", type: "text", value: f.verdict },
                status: { name: "Nandee status", type: "text", value: f.status },
            },
        })),
        scan: scanBlock("sast", meta),
    };
}
function dependencyOf(f) {
    const m = f.title.match(/([@A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)\s*[@:]?\s*v?(\d+\.\d+(?:\.\d+)?)/);
    return m && m[1] ? { name: m[1], version: m[2] ?? null } : { name: f.title.slice(0, 120), version: null };
}
export function toGitLabDependencyScanning(findings, meta) {
    const files = new Set();
    const vulnerabilities = findings.map((f) => {
        const dep = dependencyOf(f);
        const file = f.location?.path ?? "";
        if (file)
            files.add(file);
        return {
            id: uuidFor(f, "ds"),
            category: "dependency_scanning",
            name: f.title.slice(0, 255),
            description: (f.detail || f.title).slice(0, 4000),
            cve: f.fingerprint,
            severity: SEV[f.severity],
            solution: solution(f),
            scanner: { id: "nandee", name: "Nandee" },
            location: { file, dependency: { package: { name: dep.name }, ...(dep.version ? { version: dep.version } : {}) } },
            identifiers: identifiers(f),
            links: [{ name: "Nandee dashboard", url: meta.dashboardUrl }],
        };
    });
    return {
        version: "15.2.2",
        vulnerabilities,
        dependency_files: [...files].map((path) => ({ path, package_manager: "unknown", dependencies: [] })),
        scan: scanBlock("dependency_scanning", meta),
    };
}
//# sourceMappingURL=gitlab.js.map