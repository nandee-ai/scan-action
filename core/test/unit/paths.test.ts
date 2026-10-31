import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { containPath } from "../../src/fs/paths.js";
import { InputError } from "../../src/errors.js";

let root: string;
let ws: string;
let outside: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "paths-"));
  ws = path.join(root, "workspace");
  outside = path.join(root, "outside");
  await mkdir(path.join(ws, "app", "build"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(ws, "app", "build", "app.apk"), "x");
  await writeFile(path.join(outside, "secret.txt"), "x");
  await symlink(path.join(outside, "secret.txt"), path.join(ws, "link-out"));
  await symlink(path.join(ws, "app"), path.join(ws, "link-in"));
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe("containPath (T-11)", () => {
  it("accepts a relative path inside the workspace", async () => {
    const r = await containPath(ws, "app/build/app.apk", "artifact_path");
    expect(r.relative).toBe("app/build/app.apk");
  });

  it("accepts the workspace itself", async () => {
    expect((await containPath(ws, ".", "source_path")).relative).toBe(".");
  });

  it("accepts a symlink that stays inside", async () => {
    expect((await containPath(ws, "link-in/build/app.apk", "p")).relative).toBe("app/build/app.apk");
  });

  it.each([
    ["../outside/secret.txt"],
    ["app/../../outside/secret.txt"],
    ["/etc/passwd"],
    ["link-out"],
    ["file:///etc/passwd"],
    ["https://evil.example/x"],
    [""],
    ["app\0.apk"],
  ])("rejects %s", async (p) => {
    await expect(containPath(ws, p, "p")).rejects.toBeInstanceOf(InputError);
  });

  it("rejects an absolute path that is a sibling with the workspace as prefix", async () => {
    // /tmp/x/workspace-evil must not pass a naive startsWith(workspace) check.
    const sibling = `${ws}-evil`;
    await mkdir(sibling, { recursive: true });
    await expect(containPath(ws, sibling, "p")).rejects.toBeInstanceOf(InputError);
  });

  it("rejects paths that do not exist", async () => {
    await expect(containPath(ws, "nope.apk", "p")).rejects.toThrow(/does not exist/);
  });
});
