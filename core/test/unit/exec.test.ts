import { describe, expect, it } from "vitest";
import { exec } from "../../src/exec.js";

describe("exec (T-10)", () => {
  it("refuses binaries outside the allow-list", async () => {
    await expect(exec("sh", ["-c", "echo pwned"], { cwd: process.cwd() })).rejects.toThrow(/not an allowed binary/);
  });

  it("passes hostile strings as plain arguments, never through a shell", async () => {
    const hostile = "$(touch /tmp/pwned); `id`; ; rm -rf / # --version";
    // `git check-ref-format` prints nothing and exits 1 for an invalid name; a shell would have run the payload.
    const r = await exec("git", ["check-ref-format", "--", hostile], { cwd: process.cwd() });
    expect(r.code).not.toBe(0);
    expect(r.stdout).toBe("");
  });

  it("returns stdout for a normal call", async () => {
    const r = await exec("git", ["--version"], { cwd: process.cwd() });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^git version/);
  });

  it("rejects NUL bytes in arguments", async () => {
    await expect(exec("git", ["--version\0--evil"], { cwd: process.cwd() })).rejects.toThrow(/NUL/);
  });
});
