import { describe, expect, it } from "vitest";
import { parseInputs, type GitContext } from "../../src/inputs.js";
import { planUpload } from "../../src/upload/plan.js";

const git: GitContext = {
  repoUrl: "https://github.com/acme/app", branch: "main", commitSha: "0123456789abcdef0123456789abcdef01234567",
  prNumber: null, baseBranch: null, isFork: false, isPublicRepo: false, runUrl: null,
};
const base = { api_key: "ci_abcdefghijklmnopqrstuvwxyz", project_id: "p" };

describe("planUpload (T-32)", () => {
  it("uploads nothing for sast/sca", () => {
    const plan = planUpload(parseInputs(base, git), null);
    expect(plan.artifact).toBeNull();
    expect(plan.source).toEqual({ scanners: ["static", "secret", "dependency"], types: ["sast", "sca"] });
    expect(plan.describe[0]).toContain("Nothing is uploaded");
  });

  it("uploads exactly the artifact for dast", () => {
    const plan = planUpload(parseInputs({ ...base, scan_types: "dast", artifact_path: "out/app.aab" }, git), "out/app.aab");
    expect(plan.source).toBeNull();
    expect(plan.artifact).toEqual({ relativePath: "out/app.aab" });
  });

  it("rejects a wrong artifact extension and non-GitHub hosts for source scans", () => {
    expect(() => planUpload(parseInputs({ ...base, scan_types: "dast", artifact_path: "x.zip" }, git), "x.zip")).toThrow(/must end in/);
    expect(() => planUpload(parseInputs(base, { ...git, repoUrl: "https://gitlab.com/acme/app" }), null)).toThrow(/github.com/);
  });
});
