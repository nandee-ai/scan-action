export function createMockNandeeApi(fx = {}) {
    const polls = new Map();
    const fixPolls = new Map();
    let n = 0;
    const calls = [];
    const record = (method, ...args) => calls.push({ method, args });
    const api = {
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
        async getScan(ref) {
            record("getScan", ref);
            const c = (polls.get(ref.id) ?? 0) + 1;
            polls.set(ref.id, c);
            if (fx.reject)
                return { ...ref, state: "rejected", rejectionReason: fx.reject, completedAt: null };
            const done = c >= (fx.pollsUntilDone ?? 1);
            return { ...ref, state: done ? "completed" : "running", rejectionReason: null, completedAt: done ? new Date(0).toISOString() : null };
        },
        async getFindings(ref) {
            record("getFindings", ref);
            if (ref.id === "mock-baseline")
                return (fx.baselineFindings ?? []).map((item) => ({ kind: "source", item }));
            if (ref.kind === "binary")
                return (fx.binaryFindings ?? []).map((item) => ({ kind: "binary", item }));
            return (fx.sourceFindings ?? []).map((item) => ({ kind: "source", item }));
        },
        async findBaselineScan(repoUrl, branch, target) {
            record("findBaselineScan", repoUrl, branch, target);
            return fx.baselineFindings ? { kind: "source", id: "mock-baseline" } : null;
        },
        async requestFix(ref, findingId) {
            record("requestFix", ref, findingId);
        },
        async getFix(ref, findingId) {
            record("getFix", ref, findingId);
            const key = `${ref.id}:${findingId}`;
            const c = (fixPolls.get(key) ?? 0) + 1;
            fixPolls.set(key, c);
            const fix = fx.fixes?.[findingId];
            if (!fix)
                return { state: "failed", diff: null, explanation: null, error: "no fix available" };
            if (c < 2)
                return { state: "pending", diff: null, explanation: null, error: null };
            return { state: "ready", diff: fix.diff, explanation: fix.explanation, error: null };
        },
    };
    return api;
}
//# sourceMappingURL=mock.js.map