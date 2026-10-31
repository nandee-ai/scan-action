import type { Platform } from "../inputs.js";
export type DetectedPlatform = Exclude<Platform, "auto">;
export interface Detection {
    platform: DetectedPlatform;
    evidence: string[];
}
export declare function detectPlatform(sourceRoot: string): Promise<Detection | null>;
/** Nandee's engines accept these extensions for binary scans. */
export declare const ARTIFACT_EXTENSIONS: readonly [".apk", ".aab", ".ipa"];
export declare function artifactPlatform(fileName: string): DetectedPlatform | null;
