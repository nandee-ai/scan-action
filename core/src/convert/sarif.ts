/**
 * Finding[] → SARIF 2.1.0 for GitHub code scanning (T-13).
 * Built from typed objects only.  `helpUri` is the Nandee dashboard, nothing
 * from a finding becomes a URI.  Messages are plain text; no markdown.
 */
import type { Finding } from "./normalize.js";
import type { Severity } from "../inputs.js";

export interface SarifMeta {
  toolVersion: string;
  /** e.g. https://app.nandee.ai */
  dashboardOrigin: string;
  scanPath: string; // /source-scans/<id> or /scans/<id>
  commitSha: string;
  repoUrl: string;
}

const LEVEL: Record<Severity, "error" | "warning" | "note"> = { critical: "error", high: "error", medium: "warning", low: "note", info: "note" };
/** GitHub reads `security-severity` as a CVSS-like score to bucket findings. */
const SCORE: Record<Severity, string> = { critical: "9.5", high: "8.0", medium: "5.5", low: "3.0", info: "1.0" };

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** SARIF requires a valid relative URI; reject anything that is not plain. */
function safeUri(path: string): string {
  const cleaned = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned) || cleaned.includes("..") || /[\s<>"{}|^`]/.test(cleaned)) {
    return encodeURI(cleaned.replace(/\.\./g, "_").replace(/^[a-z][a-z0-9+.-]*:/i, ""));
  }
  return encodeURI(cleaned);
}

export function toSarif(findings: ReadonlyArray<Finding>, meta: SarifMeta): object {
  const rules = new Map<string, { index: number; rule: object }>();
  const results: object[] = [];
  const help = `${meta.dashboardOrigin}${meta.scanPath}`;

  for (const f of findings) {
    let r = rules.get(f.ruleId);
    if (!r) {
      r = {
        index: rules.size,
        rule: {
          id: f.ruleId,
          name: clip(f.title, 120).replace(/[^\w .:-]/g, " "),
          shortDescription: { text: clip(f.title, 200) },
          fullDescription: { text: clip(f.detail || f.title, 1000) },
          helpUri: help,
          help: { text: clip(f.suggestion || f.detail || f.title, 2000) },
          defaultConfiguration: { level: LEVEL[f.severity] },
          properties: {
            "security-severity": SCORE[f.severity],
            tags: ["security", ...(f.cwe ? [`external/cwe/${f.cwe.toLowerCase().replace(/\s+/g, "")}`] : []), ...f.masvs.map((m) => `owasp/masvs/${m.toLowerCase()}`)],
          },
        },
      };
      rules.set(f.ruleId, r);
    }
    const result: Record<string, unknown> = {
      ruleId: f.ruleId,
      ruleIndex: r.index,
      level: LEVEL[f.severity],
      message: { text: clip(`${f.title}${f.detail ? `: ${f.detail}` : ""}`, 2000) },
      partialFingerprints: { "nandee/v1": f.fingerprint },
      properties: { severity: f.severity, verdict: f.verdict, status: f.status, nandeeFindingId: f.id, masvs: f.masvs },
    };
    if (f.location) {
      result.locations = [
        {
          physicalLocation: {
            artifactLocation: { uri: safeUri(f.location.path), uriBaseId: "%SRCROOT%" },
            ...(f.location.line ? { region: { startLine: f.location.line, ...(f.snippet ? { snippet: { text: clip(f.snippet, 500) } } : {}) } } : {}),
          },
        },
      ];
    }
    results.push(result);
  }

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Nandee",
            fullName: "Nandee-AI Mobile Application Security Scan",
            version: meta.toolVersion,
            semanticVersion: meta.toolVersion,
            informationUri: "https://www.nandee.ai",
            rules: [...rules.values()].map((x) => x.rule),
          },
        },
        automationDetails: { id: `nandee/${meta.scanPath.split("/").pop() ?? "scan"}` },
        versionControlProvenance: [{ repositoryUri: meta.repoUrl, revisionId: meta.commitSha }],
        results,
        columnKind: "utf16CodeUnits",
      },
    ],
  };
}
