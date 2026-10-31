import { describe, expect, it } from "vitest";
import { inspect } from "node:util";
import { Secret } from "../../src/secret.js";

describe("Secret (T-30)", () => {
  const s = new Secret("ci_abcdefghijklmnopqrstuvwxyz0123");

  it("exposes only through expose()", () => {
    expect(s.expose()).toBe("ci_abcdefghijklmnopqrstuvwxyz0123");
  });

  it("redacts every implicit conversion", () => {
    expect(`${s}`).toBe("[redacted]");
    expect(String(s)).toBe("[redacted]");
    expect(JSON.stringify({ key: s })).toBe('{"key":"[redacted]"}');
    expect(inspect(s)).toContain("[redacted]");
    expect(inspect({ nested: s })).not.toContain("abcdefghijklmnop");
    expect(Object.keys(s)).toEqual([]);
  });

  it("rejects empty values", () => {
    expect(() => new Secret("")).toThrow(TypeError);
  });
});
