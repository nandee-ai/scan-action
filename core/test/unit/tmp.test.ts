import { describe, expect, it } from "vitest";
import { stat } from "node:fs/promises";
import { withTempDir } from "../../src/fs/tmp.js";

describe("withTempDir (T-31)", () => {
  it("creates a private dir and removes it after success", async () => {
    let dir = "";
    await withTempDir(async (d) => {
      dir = d;
      const mode = (await stat(d)).mode & 0o777;
      if (process.platform !== "win32") expect(mode).toBe(0o700);
    });
    await expect(stat(dir)).rejects.toThrow();
  });

  it("removes the dir when the body throws", async () => {
    let dir = "";
    await expect(
      withTempDir(async (d) => {
        dir = d;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(stat(dir)).rejects.toThrow();
  });
});
