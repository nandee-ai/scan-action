/**
 * Input validation (T-10, T-11 entry point).  Every value that comes from a
 * workflow file, the CLI or the environment goes through here once; the rest
 * of the core only sees typed, bounded values.
 *
 * Error messages name the input and the rule.  They never echo the API key.
 */
import { z } from "zod";
import { InputError } from "./errors.js";
import { Secret } from "./secret.js";

export const SCAN_TYPES = ["sast", "dast", "sca"] as const;
export const PLATFORMS = ["auto", "android", "ios", "react-native", "flutter"] as const;
export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export const FAIL_ON = [...SEVERITIES.filter((s) => s !== "info"), "none"] as const;

export type ScanType = (typeof SCAN_TYPES)[number];
export type Platform = (typeof PLATFORMS)[number];
export type Severity = (typeof SEVERITIES)[number];
export type FailOn = (typeof FAIL_ON)[number];
export type FailMode = "closed" | "open";
export type GreenAgentMode = "off" | "comment" | "pull-request";
export type CommentDetail = "auto" | "counts" | "full";

export interface GitContext {
  repoUrl: string;
  branch: string;
  commitSha: string;
  prNumber: number | null;
  baseBranch: string | null;
  isFork: boolean;
  isPublicRepo: boolean;
  runUrl: string | null;
}

export interface ScanInputs {
  apiKey: Secret;
  apiUrl: URL;
  /** Additional hosts the HTTP client may contact (self-hosted blob storage). */
  extraAllowedHosts: string[];
  projectId: string;
  scanTypes: ScanType[];
  sourcePath: string;
  artifactPath: string | null;
  platform: Platform;
  failOnSeverity: FailOn;
  failMode: FailMode;
  aiTriage: boolean;
  waitForCompletion: boolean;
  timeoutMinutes: number;
  greenAgent: GreenAgentMode;
  baselineMode: boolean;
  commentDetail: CommentDetail;
  git: GitContext;
}

/** Raw string inputs as a workflow or the CLI provides them.  Unknown keys are ignored. */
export const RAW_INPUT_KEYS = [
  "api_key", "api_url", "extra_allowed_hosts", "project_id", "scan_types", "source_path", "artifact_path", "platform",
  "fail_on_severity", "fail_mode", "ai_triage", "wait_for_completion", "timeout_minutes", "green_agent", "baseline_mode", "comment_detail",
] as const;
export type RawInputs = Partial<Record<(typeof RAW_INPUT_KEYS)[number], string | undefined>>;

const bool = (name: string) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(["true", "false", "1", "0", "yes", "no"], { message: `${name} must be true or false` })).transform((v) => v === "true" || v === "1" || v === "yes");

const csv = (name: string, allowed: readonly string[]) =>
  z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.enum(allowed as [string, ...string[]], { message: `${name} accepts: ${allowed.join(", ")}` })).min(1, `${name} needs at least one value`))
    .transform((xs) => [...new Set(xs)]);

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export const RawSchema = z.object({
  api_key: z.string({ error: "api_key is required: pass it from a secret (secrets.NANDEE_API_KEY on GitHub, a masked variable on GitLab)" }).min(1, "api_key is required: pass it from a secret (secrets.NANDEE_API_KEY on GitHub, a masked variable on GitLab)"),
  api_url: z
    .string()
    .default("https://app.nandee.ai")
    .transform((s, ctx) => {
      let u: URL;
      try {
        u = new URL(s);
      } catch {
        ctx.addIssue({ code: "custom", message: `api_url is not a URL: ${s}` });
        return z.NEVER;
      }
      if (u.protocol !== "https:") ctx.addIssue({ code: "custom", message: "api_url must use https" });
      if (u.username || u.password) ctx.addIssue({ code: "custom", message: "api_url must not contain credentials" });
      if (u.search || u.hash) ctx.addIssue({ code: "custom", message: "api_url must not contain a query or fragment" });
      return u;
    }),
  extra_allowed_hosts: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))
    .refine((hs) => hs.every((h) => HOSTNAME.test(h.startsWith("*.") ? h.slice(2) : h)), "extra_allowed_hosts must be host names, optionally starting with *."),
  project_id: z.string().trim().min(1, "project_id is required").max(255, "project_id is at most 255 characters").regex(/^[^\p{Cc}]+$/u, "project_id contains control characters"),
  scan_types: csv("scan_types", SCAN_TYPES),
  source_path: z.string().default("."),
  artifact_path: z.string().trim().optional().transform((s) => (s ? s : null)),
  platform: z.enum(PLATFORMS, { message: `platform accepts: ${PLATFORMS.join(", ")}` }).default("auto"),
  fail_on_severity: z.enum(FAIL_ON, { message: `fail_on_severity accepts: ${FAIL_ON.join(", ")}` }).default("high"),
  fail_mode: z.enum(["closed", "open"], { message: "fail_mode accepts: closed, open" }).default("closed"),
  ai_triage: bool("ai_triage"),
  wait_for_completion: bool("wait_for_completion"),
  timeout_minutes: z.coerce.number({ message: "timeout_minutes must be a number" }).int("timeout_minutes must be a whole number").min(1, "timeout_minutes is at least 1").max(180, "timeout_minutes is at most 180").default(30),
  green_agent: z.enum(["off", "comment", "pull-request"], { message: "green_agent accepts: off, comment, pull-request" }).default("off"),
  baseline_mode: bool("baseline_mode").optional(),
  comment_detail: z.enum(["auto", "counts", "full"], { message: "comment_detail accepts: auto, counts, full" }).default("auto"),
});

/** Defaults for inputs whose parser transforms the raw string (zod applies `.default()` to the output, so these go in before parsing). */
const RAW_DEFAULTS: Record<string, string> = { scan_types: "sast,sca", ai_triage: "true", wait_for_completion: "true" };

const SHA = /^[0-9a-f]{40}$/;

export function validateGitContext(git: GitContext): GitContext {
  if (!SHA.test(git.commitSha)) throw new InputError(`commit SHA is not a 40-character hex string: ${git.commitSha}`);
  let u: URL;
  try {
    u = new URL(git.repoUrl);
  } catch {
    throw new InputError(`repository URL is not a URL: ${git.repoUrl}`);
  }
  if (u.protocol !== "https:") throw new InputError("repository URL must be https");
  if (git.branch.length === 0 || git.branch.length > 255 || /[\0\n\r]/.test(git.branch)) throw new InputError("branch name is empty, too long or contains control characters");
  if (git.prNumber !== null && (!Number.isInteger(git.prNumber) || git.prNumber <= 0)) throw new InputError("PR number must be a positive integer");
  return git;
}

/**
 * Parses raw inputs.  `sourcePath` and `artifactPath` are returned as given;
 * the orchestrator contains them against the workspace (fs/paths.ts) because
 * that needs the filesystem.
 */
export function parseInputs(raw: RawInputs, git: GitContext): ScanInputs {
  const cleaned: Record<string, string> = { ...RAW_DEFAULTS };
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && v.trim() !== "") cleaned[k] = v;
  const r = RawSchema.safeParse(cleaned);
  if (!r.success) {
    const msgs = r.error.issues.map((i) => i.message);
    throw new InputError(`Invalid input: ${[...new Set(msgs)].join("; ").replace(/Invalid input: /g, "")}`);
  }
  const d = r.data;
  if (d.scan_types.includes("dast") && !d.artifact_path) {
    throw new InputError("scan_types includes dast but artifact_path is not set. DAST needs a built APK, AAB or IPA.");
  }
  validateGitContext(git);
  return {
    apiKey: new Secret(d.api_key),
    apiUrl: d.api_url,
    extraAllowedHosts: d.extra_allowed_hosts,
    projectId: d.project_id,
    scanTypes: d.scan_types as ScanType[],
    sourcePath: d.source_path,
    artifactPath: d.artifact_path,
    platform: d.platform,
    failOnSeverity: d.fail_on_severity,
    failMode: d.fail_mode,
    aiTriage: d.ai_triage,
    waitForCompletion: d.wait_for_completion,
    timeoutMinutes: d.timeout_minutes,
    greenAgent: d.green_agent,
    baselineMode: d.baseline_mode ?? git.prNumber !== null,
    commentDetail: d.comment_detail,
    git,
  };
}
