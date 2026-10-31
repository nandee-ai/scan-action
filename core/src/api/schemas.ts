/**
 * T-02: the shapes we accept from Nandee.  Anything else is an error.
 * These mirror backend/app/schemas/*.py in the nandee repo; unknown extra
 * fields are allowed (the API grows), missing required ones are not.
 */
import { z } from "zod";

const nullableStr = z.string().nullable().optional();

export const UploadInitResponse = z.object({
  blob_path: z.string().min(1),
  upload_url: z.string().url(),
  expires_at: z.string(),
});

export const UploadFinalizeResponse = z.object({
  hash: z.string().min(1),
  scan_type: z.string(),
  file_name: z.string(),
  scan_public_id: z.string().min(1),
});

export const BinaryScanDetail = z.object({
  public_id: z.string().min(1),
  scan_status: z.string(),
  rejection_reason: nullableStr,
  app_name: nullableStr,
  app_package_name: nullableStr,
  app_version: nullableStr,
  project_type: nullableStr,
  security_score: z.number().nullable().optional(),
  scan_completed_at: nullableStr,
});

export const VulnerabilityItem = z.object({
  id: z.number().int(),
  issue_title: z.string(),
  issue_detail: z.string().default(""),
  severity: z.string(),
  status: z.string().default("Open"),
  file_path: nullableStr,
  line_number: z.union([z.string(), z.number()]).nullable().optional(),
  code_snippet: nullableStr,
  suggestion: nullableStr,
  cwe: nullableStr,
  owasp_category: nullableStr,
  masvs: z.array(z.string()).default([]),
});

export const SourceScanResponse = z.object({
  public_id: z.string().min(1),
  scan_status: z.string(),
  scan_target: z.enum(["mobile", "web"]).default("mobile"),
  rejection_reason: nullableStr,
  source_url: nullableStr,
  branch: nullableStr,
  project_title: nullableStr,
  created_at: z.string(),
  scan_completed_at: nullableStr,
});

export const SourceFindingItem = z.object({
  id: z.number().int(),
  issue_title: z.string(),
  issue_detail: z.string().default(""),
  severity: z.string(),
  status: z.string().default("Open"),
  file_path: nullableStr,
  line_number: z.union([z.string(), z.number()]).nullable().optional(),
  code_snippet: nullableStr,
  suggestion: nullableStr,
  cwe: nullableStr,
  owasp_category: nullableStr,
  masvs: z.array(z.string()).default([]),
  cluster_id: nullableStr,
  fix_diff: nullableStr,
  fix_explanation: nullableStr,
  validator_verdict: nullableStr,
});

export const GenerateFixResponse = z.object({
  finding_id: z.number().int(),
  fix_id: nullableStr,
  status: z.string().default("generating"),
});

export const FixStatusResponse = z.object({
  finding_id: z.number().int(),
  status: nullableStr,
  diff: nullableStr,
  explanation: nullableStr,
  error_message: nullableStr,
});

export type UploadInitResponse = z.infer<typeof UploadInitResponse>;
export type UploadFinalizeResponse = z.infer<typeof UploadFinalizeResponse>;
export type BinaryScanDetail = z.infer<typeof BinaryScanDetail>;
export type VulnerabilityItem = z.infer<typeof VulnerabilityItem>;
export type SourceScanResponse = z.infer<typeof SourceScanResponse>;
export type SourceFindingItem = z.infer<typeof SourceFindingItem>;
export type FixStatusResponse = z.infer<typeof FixStatusResponse>;
