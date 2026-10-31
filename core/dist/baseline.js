export function diffAgainstBaseline(current, baseline) {
    const seen = new Set(baseline.map((f) => f.fingerprint));
    const now = new Set(current.map((f) => f.fingerprint));
    return {
        newFindings: current.filter((f) => !seen.has(f.fingerprint)),
        existing: current.filter((f) => seen.has(f.fingerprint)),
        fixed: baseline.filter((f) => !now.has(f.fingerprint)),
    };
}
//# sourceMappingURL=baseline.js.map