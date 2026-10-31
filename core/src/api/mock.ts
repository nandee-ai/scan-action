/**
 * An in-memory NandeeApi for tests and for `nandee scan --mock`.
 * Scans complete after `pollsUntilDone` status checks so polling is exercised.
 */
import type { SourceFindingItem, VulnerabilityItem } from "./schemas.js";
import type { FixState, NandeeApi, RawFinding, ScanStatus, StartSourceScanRequest } from "./types.js";

export interface MockFixtures {
  sourceFindings?: SourceFindingItem[];
  binaryFindings?: VulnerabilityItem[];
  baselineFindings?: SourceFindingItem[];
  pollsUntilDone?: number;
  reject?: string;
  fixes?: Record<number, { diff: string; explanation: string }>;
}

export interface MockNandeeApi extends NandeeApi {
  calls: Array<{ method: keyof NandeeApi; args: unknown[] }>;
  lastSourceRequest: StartSourceScanRequest | null;
}

export function createMockNandeeApi(fx: MockFixtures = {}): MockNandeeApi {
  const polls = new Map<string, number>();
  const fixPolls = new Map<string, number>();
  let n = 0;
  const calls: MockNandeeApi["calls"] = [];
  const record = (method: keyof NandeeApi, ...args: unknown[]) => calls.push({ method, args });
  const api: MockNandeeApi = {
    calls,
    lastSourceRequest: null,
    async uploadBinary(file, meta) {
      record("uploadBinary", { name: file.name, size: file.bytes.byteLength }, meta);
      return { kind: "binary", id: `mock-bin-${++n}` };
    },
    async startSourceScan(req) {
      record("startSourceScan", req);
      api.lastSourceRequest = req;
      return { kind: "source", id: `mock-src-${++n}` };
    },
    async getScan(ref): Promise<ScanStatus> {
      record("getScan", ref);
      const c = (polls.get(ref.id) ?? 0) + 1;
      polls.set(ref.id, c);
      if (fx.reject) return { ...ref, state: "rejected", rejectionReason: fx.reject, completedAt: null };
      const done = c >= (fx.pollsUntilDone ?? 1);
      return { ...ref, state: done ? "completed" : "running", rejectionReason: null, completedAt: done ? new Date(0).toISOString() : null };
    },
    async getFindings(ref): Promise<RawFinding[]> {
      record("getFindings", ref);
      if (ref.id === "mock-baseline") return (fx.baselineFindings ?? []).map((item) => ({ kind: "source", item }));
      if (ref.kind === "binary") return (fx.binaryFindings ?? []).map((item) => ({ kind: "binary", item }));
      return (fx.sourceFindings ?? []).map((item) => ({ kind: "source", item }));
    },
    async findBaselineScan(repoUrl, branch, target) {
      record("findBaselineScan", repoUrl, branch, target);
      return fx.baselineFindings ? { kind: "source", id: "mock-baseline" } : null;
    },
    async requestFix(ref, findingId) {
      record("requestFix", ref, findingId);
    },
    async getFix(ref, findingId): Promise<FixState> {
      record("getFix", ref, findingId);
      const key = `${ref.id}:${findingId}`;
      const c = (fixPolls.get(key) ?? 0) + 1;
      fixPolls.set(key, c);
      const fix = fx.fixes?.[findingId];
      if (!fix) return { state: "failed", diff: null, explanation: null, error: "no fix available" };
      if (c < 2) return { state: "pending", diff: null, explanation: null, error: null };
      return { state: "ready", diff: fix.diff, explanation: fix.explanation, error: null };
    },
  };
  return api;
}
