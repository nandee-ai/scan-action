/**
 * One Finding shape for both scan kinds.  Text fields stay as Nandee sent
 * them: they are untrusted (T-12) and are escaped where they are rendered,
 * never here, so SARIF and GitLab reports get the raw text and Markdown
 * gets the escaped text.
 */
import { createHash } from "node:crypto";
export function normalizeSeverity(raw) {
    const s = raw.trim().toLowerCase();
    if (s === "critical")
        return "critical";
    if (s === "high" || s === "dangerous")
        return "high";
    if (s === "medium" || s === "warning" || s === "moderate")
        return "medium";
    if (s === "low")
        return "low";
    return "info";
}
/** Assumption Q7: verdict spellings.  Unknown strings count toward the gate. */
const EXPLOITABLE = new Set(["exploitable", "true_positive", "true positive", "valid", "confirmed", "likely", "real"]);
const FALSE_POSITIVE = new Set(["false_positive", "false positive", "not_exploitable", "not exploitable", "invalid", "unexploitable", "benign"]);
export function normalizeVerdict(raw) {
    if (!raw)
        return "unknown";
    const s = raw.trim().toLowerCase();
    if (EXPLOITABLE.has(s))
        return "exploitable";
    if (FALSE_POSITIVE.has(s))
        return "false_positive";
    return "unknown";
}
/** Findings a person has already dealt with are not gated again. */
export const CLOSED_STATUSES = new Set(["resolved", "closed", "false positive", "false_positive", "accepted", "risk accepted", "wont fix", "won't fix"]);
function parseLine(v) {
    if (v === null || v === undefined)
        return null;
    const n = typeof v === "number" ? v : Number.parseInt(String(v).split(/[^0-9]/)[0] ?? "", 10);
    return Number.isInteger(n) && n > 0 ? n : null;
}
const CHECKOUT_MARKERS = new Set(["workspace", "repo", "src", "source"]);
export function normalizePath(p) {
    if (!p)
        return null;
    let s = p.replace(/\\/g, "/");
    if (s.startsWith("./"))
        s = s.slice(2);
    while (s.startsWith("/"))
        s = s.slice(1);
    // Engines sometimes report an absolute path inside their own checkout; keep the part after a known marker.
    if (s.startsWith("tmp/") || s.startsWith("home/") || s.startsWith("opt/")) {
        const parts = s.split("/");
        const idx = parts.findIndex((seg, i) => i < parts.length - 1 && CHECKOUT_MARKERS.has(seg));
        if (idx >= 0)
            s = parts.slice(idx + 1).join("/");
    }
    return s;
}
function trimDashes(s) {
    let a = 0;
    let b = s.length;
    while (a < b && s[a] === "-")
        a++;
    while (b > a && s[b - 1] === "-")
        b--;
    return s.slice(a, b);
}
export function ruleIdFor(title, cwe, owasp) {
    if (cwe) {
        const m = cwe.match(/CWE-?\s*(\d+)/i);
        if (m)
            return `CWE-${m[1]}`;
    }
    if (owasp) {
        const m = owasp.match(/\b(M\d{1,2}|A\d{1,2})\b/i);
        if (m && m[1])
            return `OWASP-${m[1].toUpperCase()}`;
    }
    const slug = trimDashes(title.toLowerCase().replace(/[^a-z0-9]+/g, "-")).slice(0, 60);
    return `nandee-${slug || "finding"}`;
}
function normalizeSnippet(s) {
    return (s ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
}
/** Stable across runs and line shifts: rule, path, and the snippet (or title). */
export function fingerprintOf(ruleId, path, snippet, title) {
    return createHash("sha256").update([ruleId, path ?? "", normalizeSnippet(snippet) || title].join("\u0000")).digest("hex");
}
export function normalize(raw) {
    return raw.map((r) => {
        const it = r.item;
        const path = normalizePath(it.file_path);
        const cwe = it.cwe?.trim() || null;
        const owasp = it.owasp_category?.trim() || null;
        const ruleId = ruleIdFor(it.issue_title, cwe, owasp);
        const snippet = it.code_snippet ?? null;
        const line = parseLine(it.line_number);
        const base = {
            id: String(it.id),
            fingerprint: fingerprintOf(ruleId, path, snippet, it.issue_title),
            ruleId,
            title: it.issue_title,
            detail: it.issue_detail,
            severity: normalizeSeverity(it.severity),
            location: path ? { path, line } : null,
            snippet,
            suggestion: it.suggestion ?? null,
            cwe,
            owasp,
            masvs: it.masvs ?? [],
            status: it.status,
        };
        if (r.kind === "source") {
            return {
                ...base,
                verdict: normalizeVerdict(r.item.validator_verdict),
                fix: r.item.fix_diff ? { diff: r.item.fix_diff, explanation: r.item.fix_explanation ?? null } : null,
            };
        }
        return { ...base, verdict: "unknown", fix: null };
    });
}
export const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
export function countBySeverity(findings) {
    const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings)
        c[f.severity]++;
    return c;
}
//# sourceMappingURL=normalize.js.map