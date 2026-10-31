/**
 * T-02: the shapes we accept from Nandee.  Anything else is an error.
 * These mirror backend/app/schemas/*.py in the nandee repo; unknown extra
 * fields are allowed (the API grows), missing required ones are not.
 */
import { z } from "zod";
export declare const UploadInitResponse: z.ZodObject<{
    blob_path: z.ZodString;
    upload_url: z.ZodString;
    expires_at: z.ZodString;
}, z.core.$strip>;
export declare const UploadFinalizeResponse: z.ZodObject<{
    hash: z.ZodString;
    scan_type: z.ZodString;
    file_name: z.ZodString;
    scan_public_id: z.ZodString;
}, z.core.$strip>;
export declare const BinaryScanDetail: z.ZodObject<{
    public_id: z.ZodString;
    scan_status: z.ZodString;
    rejection_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    app_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    app_package_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    app_version: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    project_type: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    security_score: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    scan_completed_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const VulnerabilityItem: z.ZodObject<{
    id: z.ZodNumber;
    issue_title: z.ZodString;
    issue_detail: z.ZodDefault<z.ZodString>;
    severity: z.ZodString;
    status: z.ZodDefault<z.ZodString>;
    file_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    line_number: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
    code_snippet: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    suggestion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    cwe: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    owasp_category: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    masvs: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const SourceScanResponse: z.ZodObject<{
    public_id: z.ZodString;
    scan_status: z.ZodString;
    scan_target: z.ZodDefault<z.ZodEnum<{
        mobile: "mobile";
        web: "web";
    }>>;
    rejection_reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    source_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    branch: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    project_title: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    created_at: z.ZodString;
    scan_completed_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const SourceFindingItem: z.ZodObject<{
    id: z.ZodNumber;
    issue_title: z.ZodString;
    issue_detail: z.ZodDefault<z.ZodString>;
    severity: z.ZodString;
    status: z.ZodDefault<z.ZodString>;
    file_path: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    line_number: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
    code_snippet: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    suggestion: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    cwe: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    owasp_category: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    masvs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    cluster_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fix_diff: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fix_explanation: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    validator_verdict: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const GenerateFixResponse: z.ZodObject<{
    finding_id: z.ZodNumber;
    fix_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export declare const FixStatusResponse: z.ZodObject<{
    finding_id: z.ZodNumber;
    status: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    diff: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    explanation: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    error_message: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type UploadInitResponse = z.infer<typeof UploadInitResponse>;
export type UploadFinalizeResponse = z.infer<typeof UploadFinalizeResponse>;
export type BinaryScanDetail = z.infer<typeof BinaryScanDetail>;
export type VulnerabilityItem = z.infer<typeof VulnerabilityItem>;
export type SourceScanResponse = z.infer<typeof SourceScanResponse>;
export type SourceFindingItem = z.infer<typeof SourceFindingItem>;
export type FixStatusResponse = z.infer<typeof FixStatusResponse>;
