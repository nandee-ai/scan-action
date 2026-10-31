import { describe, expect, it } from "vitest";
import { fingerprintOf, normalize, normalizePath, normalizeSeverity, normalizeVerdict, ruleIdFor } from "../../src/convert/normalize.js";
import { loadBinaryFindings, loadSourceFindings } from "../fixtures/index.js";

describe("normalize", () => {
  const src = normalize(loadSourceFindings().map((item) => ({ kind: "source", item })));
  const bin = normalize(loadBinaryFindings().map((item) => ({ kind: "binary", item })));

  it("maps fields and keeps text untouched", () => {
    const f = src[0]!;
    expect(f.id).toBe("101");
    expect(f.ruleId).toBe("CWE-798");
    expect(f.severity).toBe("critical");
    expect(f.location).toEqual({ path: "app/src/main/java/com/acme/app/Config.kt", line: 12 });
    expect(f.verdict).toBe("exploitable");
    expect(f.fix?.diff).toContain("+val API_KEY");
    expect(src[4]!.title).toContain("<img src=x");
  });

  it("binary findings have no verdict or fix", () => {
    expect(bin[0]!.verdict).toBe("unknown");
    expect(bin[0]!.fix).toBeNull();
    expect(bin[1]!.location).toBeNull();
    expect(bin[0]!.severity).toBe("high");
  });

  it("derives rule ids from CWE, then OWASP, then the title", () => {
    expect(ruleIdFor("x", "CWE 79", null)).toBe("CWE-79");
    expect(ruleIdFor("x", null, "M5: Insecure Communication")).toBe("OWASP-M5");
    expect(ruleIdFor("Hard-coded key!!", null, null)).toBe("nandee-hard-coded-key");
  });

  it("normalises severities, verdicts and lines", () => {
    expect(normalizeSeverity("Dangerous")).toBe("high");
    expect(normalizeSeverity("Warning")).toBe("medium");
    expect(normalizeSeverity("whatever")).toBe("info");
    expect(normalizeVerdict("False Positive")).toBe("false_positive");
    expect(normalizeVerdict("something-new")).toBe("unknown");
    expect(src[4]!.location?.line).toBeNull();
  });

  it("fingerprints ignore line numbers and whitespace but not the rule or path", () => {
    const a = fingerprintOf("CWE-1", "a/b.kt", "  x =  1 ", "t");
    expect(fingerprintOf("CWE-1", "a/b.kt", "x = 1", "t")).toBe(a);
    expect(fingerprintOf("CWE-2", "a/b.kt", "x = 1", "t")).not.toBe(a);
    expect(fingerprintOf("CWE-1", "a/c.kt", "x = 1", "t")).not.toBe(a);
  });

  it("normalises paths", () => {
    expect(normalizePath("./a\\b.kt")).toBe("a/b.kt");
    expect(normalizePath("/tmp/clone-1/workspace/app/x.kt")).toBe("app/x.kt");
    expect(normalizePath(null)).toBeNull();
  });
});
