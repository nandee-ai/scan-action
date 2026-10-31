import { describe, expect, it } from "vitest";
import { nextDelay, pollUntilDone, type Clock } from "../../src/api/poll.js";
import { createMockNandeeApi } from "../../src/api/mock.js";
import { ScanRejectedError, TimeoutError, AuthError, ApiError } from "../../src/errors.js";
import type { NandeeApi } from "../../src/api/types.js";

function fakeClock(): Clock & { slept: number[] } {
  let t = 0;
  const slept: number[] = [];
  return {
    slept,
    now: () => t,
    async sleep(ms) {
      slept.push(ms);
      t += ms;
    },
    random: () => 0.5,
  };
}

describe("nextDelay (T-41)", () => {
  it("grows exponentially with jitter and is capped", () => {
    const d = (a: number) => nextDelay(a, 2000, 30000, () => 0.999);
    expect(d(0)).toBeLessThanOrEqual(3000);
    expect(d(3)).toBeGreaterThan(d(0));
    expect(d(10)).toBeLessThanOrEqual(31000);
  });
});

describe("pollUntilDone", () => {
  it("polls until completed with backoff", async () => {
    const api = createMockNandeeApi({ pollsUntilDone: 4 });
    const clock = fakeClock();
    const s = await pollUntilDone(api, { kind: "source", id: "x" }, clock, { timeoutMs: 600_000 });
    expect(s.state).toBe("completed");
    expect(clock.slept.length).toBe(3);
    expect(clock.slept[2]).toBeGreaterThan(clock.slept[0] ?? 0);
  });

  it("throws TimeoutError at the deadline", async () => {
    const api = createMockNandeeApi({ pollsUntilDone: 1_000 });
    await expect(pollUntilDone(api, { kind: "source", id: "x" }, fakeClock(), { timeoutMs: 10_000 })).rejects.toBeInstanceOf(TimeoutError);
  });

  it("surfaces a rejection with its reason", async () => {
    const api = createMockNandeeApi({ reject: "unsupported file type" });
    await expect(pollUntilDone(api, { kind: "binary", id: "x" }, fakeClock(), { timeoutMs: 10_000 })).rejects.toThrow(/unsupported file type/);
    await expect(pollUntilDone(api, { kind: "binary", id: "x" }, fakeClock(), { timeoutMs: 10_000 })).rejects.toBeInstanceOf(ScanRejectedError);
  });

  it("does not retry auth errors but tolerates a few transient API errors", async () => {
    let n = 0;
    const flaky: NandeeApi = {
      ...createMockNandeeApi(),
      async getScan(ref) {
        n++;
        if (n <= 2) throw new ApiError("503", 503);
        return { ...ref, state: "completed", rejectionReason: null, completedAt: null };
      },
    };
    await expect(pollUntilDone(flaky, { kind: "source", id: "x" }, fakeClock(), { timeoutMs: 60_000 })).resolves.toMatchObject({ state: "completed" });

    const denied: NandeeApi = { ...createMockNandeeApi(), async getScan() { throw new AuthError(); } };
    await expect(pollUntilDone(denied, { kind: "source", id: "x" }, fakeClock(), { timeoutMs: 60_000 })).rejects.toBeInstanceOf(AuthError);
  });
});
