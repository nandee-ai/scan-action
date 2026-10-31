/**
 * Input validation (T-10, T-11 entry point).  Every value that comes from a
 * workflow file, the CLI or the environment goes through here once; the rest
 * of the core only sees typed, bounded values.
 *
 * Error messages name the input and the rule.  They never echo the API key.
 */
import { z } from "zod";
import { Secret } from "./secret.js";
export declare const SCAN_TYPES: readonly ["sast", "dast", "sca"];
export declare const PLATFORMS: readonly ["auto", "android", "ios", "react-native", "flutter"];
export declare const SEVERITIES: readonly ["critical", "high", "medium", "low", "info"];
export declare const FAIL_ON: readonly [...("critical" | "high" | "medium" | "low")[], "none"];
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
export declare const RAW_INPUT_KEYS: readonly ["api_key", "api_url", "extra_allowed_hosts", "project_id", "scan_types", "source_path", "artifact_path", "platform", "fail_on_severity", "fail_mode", "ai_triage", "wait_for_completion", "timeout_minutes", "green_agent", "baseline_mode", "comment_detail"];
export type RawInputs = Partial<Record<(typeof RAW_INPUT_KEYS)[number], string | undefined>>;
export declare const RawSchema: z.ZodObject<{
    api_key: z.ZodString;
    api_url: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<URL, string>>;
    extra_allowed_hosts: z.ZodPipe<z.ZodDefault<z.ZodString>, z.ZodTransform<string[], string>>;
    project_id: z.ZodString;
    scan_types: z.ZodPipe<z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string[], string>>, z.ZodArray<z.ZodEnum<{
        [x: string]: string;
    }>>>, z.ZodTransform<string[], string[]>>;
    source_path: z.ZodDefault<z.ZodString>;
    artifact_path: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string | null, string | undefined>>;
    platform: z.ZodDefault<z.ZodEnum<{
        auto: "auto";
        android: "android";
        ios: "ios";
        "react-native": "react-native";
        flutter: "flutter";
    }>>;
    fail_on_severity: z.ZodDefault<z.ZodEnum<{
        critical: "critical";
        high: "high";
        medium: "medium";
        low: "low";
        none: "none";
    }>>;
    fail_mode: z.ZodDefault<z.ZodEnum<{
        closed: "closed";
        open: "open";
    }>>;
    ai_triage: z.ZodPipe<z.ZodPreprocess<z.ZodEnum<{
        0: "0";
        1: "1";
        true: "true";
        false: "false";
        yes: "yes";
        no: "no";
    }>, unknown>, z.ZodTransform<boolean, "0" | "1" | "true" | "false" | "yes" | "no">>;
    wait_for_completion: z.ZodPipe<z.ZodPreprocess<z.ZodEnum<{
        0: "0";
        1: "1";
        true: "true";
        false: "false";
        yes: "yes";
        no: "no";
    }>, unknown>, z.ZodTransform<boolean, "0" | "1" | "true" | "false" | "yes" | "no">>;
    timeout_minutes: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    green_agent: z.ZodDefault<z.ZodEnum<{
        off: "off";
        comment: "comment";
        "pull-request": "pull-request";
    }>>;
    baseline_mode: z.ZodOptional<z.ZodPipe<z.ZodPreprocess<z.ZodEnum<{
        0: "0";
        1: "1";
        true: "true";
        false: "false";
        yes: "yes";
        no: "no";
    }>, unknown>, z.ZodTransform<boolean, "0" | "1" | "true" | "false" | "yes" | "no">>>;
    comment_detail: z.ZodDefault<z.ZodEnum<{
        auto: "auto";
        counts: "counts";
        full: "full";
    }>>;
}, z.core.$strip>;
export declare function validateGitContext(git: GitContext): GitContext;
/**
 * Parses raw inputs.  `sourcePath` and `artifactPath` are returned as given;
 * the orchestrator contains them against the workspace (fs/paths.ts) because
 * that needs the filesystem.
 */
export declare function parseInputs(raw: RawInputs, git: GitContext): ScanInputs;
