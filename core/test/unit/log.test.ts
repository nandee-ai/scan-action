import { describe, expect, it } from "vitest";
import { createLogger, createScrubber, describeError, type LogSink } from "../../src/log.js";
import { Secret } from "../../src/secret.js";

const KEY = "ci_SuperSecretValue_0123456789ab";

function capture(): { sink: LogSink; lines: string[] } {
  const lines: string[] = [];
  return { sink: { write: (level, line) => lines.push(`${level}:${line}`) }, lines };
}

describe("scrubber (T-30)", () => {
  const scrub = createScrubber([new Secret(KEY), new Secret("p@ss w/ space&chars")]);

  it("replaces the raw value", () => {
    expect(scrub(`Authorization: Bearer ${KEY}`)).toBe("Authorization: Bearer [redacted]");
  });

  it("replaces URL-encoded and base64 forms", () => {
    expect(scrub(`?k=${encodeURIComponent("p@ss w/ space&chars")}`)).toBe("?k=[redacted]");
    expect(scrub(Buffer.from(KEY).toString("base64"))).toBe("[redacted]");
  });

  it("replaces anything shaped like a CI token even when not registered", () => {
    expect(scrub("token ci_ZZZZZZZZZZZZZZZZZZZZZZ failed")).toBe("token [redacted] failed");
  });

  it("leaves other text alone", () => {
    expect(scrub("scan 42 completed")).toBe("scan 42 completed");
  });
});

describe("logger", () => {
  it("scrubs every level including debug and groups", async () => {
    const { sink, lines } = capture();
    const log = createLogger(sink, createScrubber([new Secret(KEY)]), { debug: true });
    log.debug(`debug ${KEY}`);
    log.error(new Error(`boom ${KEY}`).message);
    await log.group(`group ${KEY}`, async () => {});
    expect(lines.join("\n")).not.toContain(KEY);
    expect(lines[0]).toBe("debug:debug [redacted]");
  });

  it("drops debug lines unless debug is on", () => {
    const { sink, lines } = capture();
    const log = createLogger(sink, (t) => t);
    log.debug("hidden");
    log.info("shown");
    expect(lines).toEqual(["info:shown"]);
  });
});

describe("describeError", () => {
  it("includes the cause message only", () => {
    const e = new Error("outer", { cause: new Error("inner") });
    expect(describeError(e)).toBe("Error: outer (cause: inner)");
    expect(describeError("str")).toBe("str");
  });
});
