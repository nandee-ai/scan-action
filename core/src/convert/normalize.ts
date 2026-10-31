/**
 * One Finding shape for both scan kinds.  Text fields stay as Nandee sent
 * them: they are untrusted (T-12) and are escaped where they are rendered,
 * never here, so SARIF and GitLab reports get the raw text and Markdown
 * gets the escaped text.
 */
import { createHash } from "node:crypto";
import type { RawFinding } from "../api/types.js";
import type { Severity } from "../inputs.js";

export type Verdict = "exploitable" | "false_positive" | "unknown";

export interface Finding {
  id: string;
  fingerprint: string;
  ruleId: string;
  title: string;
  detail: string;
  severity: Severity;
  location: { path: string; line: number | null } | null;
  snippet: string | null;
  suggestion: string | null;
  cwe: string | null;
  owasp: string | null;
  masvs: string[];
  verdict: Verdict;
  status: string;
  fix: { diff: string; explanation: string | null } | null;
}

export function normalizeSeverity(raw: string): Severity {
  const s = raw.trim().toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high" || s === "dangerous") return "high";
  if (s === "medium" || s === "warning" || s === "moderate") return "medium";
  if (s === "low") return "low";
  return "info";
}

/** Assumption Q7: verdict spellings.  Unknown strings count toward the gate. */
const EXPLOITABLE = new Set(["exploitable", "true_positive", "true positive", "valid", "confirmed", "likely", "real"]);
const FALSE_POSITIVE = new Set(["false_positive", "false positive", "not_exploitable", "not exploitable", "invalid", "unexploitable", "benign"]);

export function normalizeVerdict(raw: string | null | undefined): Verdict {
  if (!raw) return "unknown";
  const s = raw.trim().toLowerCase();
  if (EXPLOITABLE.has(s)) return "exploitable";
  if (FALSE_POSITIVE.has(s)) return "false_positive";
  return "unknown";
}

/** Findings a person has already dealt with are not gated again. */
export const CLOSED_STATUSES = new Set(["resolved", "closed", "false positive", "false_positive", "accepted", "risk accepted", "wont fix", "won't fix"]);

function parseLine(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number.parseInt(String(v).split(/[^0-9]/)[0] ?? "", 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function normalizePath(p: string | null | undefined): string | null {
  if (!p) return null;
  let s = p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  // Engines sometimes report an absolute path inside their own checkout; keep the part after a known marker.
  const m = s.match(/(?:^|\/)(?:workspace|repo|src|source)\/(.+)$/);
  if (s.startsWith("tmp/") || s.startsWith("home/") || s.startsWith("opt/")) s = m?.[1] ?? s;
  return s;
}

export function ruleIdFor(title: string, cwe: string | null, owasp: string | null): string {
  if (cwe) {
    const m = cwe.match(/CWE-?\s*(\d+)/i);
    if (m) return `CWE-${m[1]}`;
  }
  if (owasp) {
    const m = owasp.match(/\b(M\d{1,2}|A\d{1,2})\b/i);
    if (m && m[1]) return `OWASP-${m[1].toUpperCase()}`;
  }
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `nandee-${slug || "finding"}`;
}

function normalizeSnippet(s: string | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Stable across runs and line shifts: rule, path, and the snippet (or title). */
export function fingerprintOf(ruleId: string, path: string | null, snippet: string | null, title: string): string {
  return createHash("sha256").update([ruleId, path ?? "", normalizeSnippet(snippet) || title].join("\u0000")).digest("hex");
}

export function normalize(raw: RawFinding[]): Finding[] {
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

export const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

export function countBySeverity(findings: ReadonlyArray<Finding>): Record<Severity, number> {
  const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}
