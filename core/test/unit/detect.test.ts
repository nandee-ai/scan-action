import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { artifactPlatform, detectPlatform } from "../../src/platform/detect.js";

let root: string;
async function fixture(name: string, files: Record<string, string>): Promise<string> {
  const dir = path.join(root, name);
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), content);
  }
  return dir;
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "detect-"));
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe("detectPlatform", () => {
  it("flutter wins over its native folders", async () => {
    const d = await fixture("flutter", { "pubspec.yaml": "name: app", "android/build.gradle": "", "ios/Podfile": "" });
    expect((await detectPlatform(d))?.platform).toBe("flutter");
  });
  it("react-native from package.json, expo included", async () => {
    const d = await fixture("rn", { "package.json": JSON.stringify({ dependencies: { "react-native": "0.76.0" } }), "android/build.gradle": "" });
    expect((await detectPlatform(d))?.platform).toBe("react-native");
    const e = await fixture("expo", { "package.json": JSON.stringify({ dependencies: { expo: "52" } }) });
    expect((await detectPlatform(e))?.platform).toBe("react-native");
  });
  it("android from gradle files", async () => {
    const d = await fixture("android", { "settings.gradle.kts": "", "app/build.gradle.kts": "" });
    const r = await detectPlatform(d);
    expect(r?.platform).toBe("android");
    expect(r?.evidence).toContain("settings.gradle.kts");
  });
  it("ios from a Podfile or an .xcodeproj", async () => {
    expect((await detectPlatform(await fixture("ios1", { Podfile: "" })))?.platform).toBe("ios");
    expect((await detectPlatform(await fixture("ios2", { "App.xcodeproj/project.pbxproj": "" })))?.platform).toBe("ios");
  });
  it("returns null for an unknown tree and ignores a broken package.json", async () => {
    expect(await detectPlatform(await fixture("none", { "README.md": "" }))).toBeNull();
    expect(await detectPlatform(await fixture("brokenpkg", { "package.json": "{not json" }))).toBeNull();
  });
});

describe("artifactPlatform", () => {
  it("maps extensions", () => {
    expect(artifactPlatform("build/app-release.APK")).toBe("android");
    expect(artifactPlatform("x.aab")).toBe("android");
    expect(artifactPlatform("x.ipa")).toBe("ios");
    expect(artifactPlatform("x.zip")).toBeNull();
  });
});
