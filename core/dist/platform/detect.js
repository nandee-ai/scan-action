/**
 * Platform detection from build files (T-35: a fixed list of file names is
 * checked for existence; nothing is globbed or read beyond `package.json`).
 */
import { access, readFile } from "node:fs/promises";
import path from "node:path";
async function exists(p) {
    try {
        await access(p);
        return true;
    }
    catch {
        return false;
    }
}
/** Reads package.json dependencies without evaluating anything. */
async function packageJsonDeps(root) {
    try {
        const raw = await readFile(path.join(root, "package.json"), "utf8");
        if (raw.length > 1_000_000)
            return new Set();
        const j = JSON.parse(raw);
        const out = new Set();
        if (j && typeof j === "object") {
            for (const k of ["dependencies", "devDependencies"]) {
                const d = j[k];
                if (d && typeof d === "object")
                    for (const name of Object.keys(d))
                        out.add(name);
            }
        }
        return out;
    }
    catch {
        return new Set();
    }
}
export async function detectPlatform(sourceRoot) {
    const evidence = [];
    const has = async (rel) => {
        const ok = await exists(path.join(sourceRoot, rel));
        if (ok)
            evidence.push(rel);
        return ok;
    };
    // Order matters: cross-platform frameworks contain native folders too.
    if (await has("pubspec.yaml"))
        return { platform: "flutter", evidence };
    const deps = await packageJsonDeps(sourceRoot);
    if (deps.has("react-native") || deps.has("expo")) {
        evidence.push(`package.json depends on ${deps.has("react-native") ? "react-native" : "expo"}`);
        return { platform: "react-native", evidence };
    }
    const android = (await has("settings.gradle")) || (await has("settings.gradle.kts")) || (await has("build.gradle")) || (await has("build.gradle.kts")) || (await has("app/build.gradle")) || (await has("app/build.gradle.kts"));
    const ios = (await has("Podfile")) || (await has("Package.swift")) || (await hasXcodeProject(sourceRoot, evidence));
    if (android && !ios)
        return { platform: "android", evidence };
    if (ios && !android)
        return { platform: "ios", evidence };
    if (android && ios) {
        // Both native trees with no cross-platform marker: report android first; the user can pin `platform`.
        return { platform: "android", evidence: [...evidence, "both Android and iOS build files found; set platform to pin it"] };
    }
    return null;
}
async function hasXcodeProject(root, evidence) {
    // Only the top level is listed; no recursion into the tree.
    try {
        const { readdir } = await import("node:fs/promises");
        const names = await readdir(root);
        const hit = names.find((n) => n.endsWith(".xcodeproj") || n.endsWith(".xcworkspace"));
        if (hit) {
            evidence.push(hit);
            return true;
        }
    }
    catch {
        /* unreadable: treat as absent */
    }
    return false;
}
/** Nandee's engines accept these extensions for binary scans. */
export const ARTIFACT_EXTENSIONS = [".apk", ".aab", ".ipa"];
export function artifactPlatform(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === ".apk" || ext === ".aab")
        return "android";
    if (ext === ".ipa")
        return "ios";
    return null;
}
//# sourceMappingURL=detect.js.map