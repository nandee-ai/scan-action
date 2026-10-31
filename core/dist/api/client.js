/**
 * NandeeApi over the real endpoints (docs/ARCHITECTURE.md §3).
 */
import { z } from "zod";
import { ApiError } from "../errors.js";
import * as S from "./schemas.js";
export const API_PREFIX = "/api/v2";
export function normalizeState(raw) {
    const s = raw.trim().toLowerCase();
    if (s === "completed" || s === "complete" || s === "done")
        return "completed";
    if (s === "rejected" || s === "failed" || s === "error")
        return "rejected";
    return "running";
}
/** Nandee ids are opaque strings; we refuse anything that could change the path (T-10 for URLs). */
function pathId(id, what) {
    const s = String(id);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(s))
        throw new ApiError(`${what} "${s}" is not a valid Nandee id`);
    return s;
}
export function createNandeeApi(http, auth, baseUrl) {
    const u = (path, query) => {
        const url = new URL(`${API_PREFIX}${path}`, baseUrl);
        for (const [k, v] of Object.entries(query ?? {}))
            url.searchParams.set(k, v);
        return url;
    };
    const get = (path, schema, query) => http.json({ method: "GET", url: u(path, query), auth }, schema);
    const post = (path, body, schema, timeoutMs) => http.json({ method: "POST", url: u(path), auth, body, ...(timeoutMs ? { timeoutMs } : {}) }, schema);
    return {
        async uploadBinary(file, meta) {
            const init = await post("/scans/upload-init", { filename: file.name, size_bytes: file.bytes.byteLength }, S.UploadInitResponse);
            await http.putBytes(new URL(init.upload_url), file.bytes, {
                "x-ms-blob-type": "BlockBlob",
                "content-type": "application/octet-stream",
                "content-length": String(file.bytes.byteLength),
            });
            const fin = await post("/scans/upload-finalize", { blob_path: init.blob_path, filename: file.name, project_title: meta.projectTitle, project_description: meta.description }, S.UploadFinalizeResponse, 5 * 60_000);
            return { kind: "binary", id: fin.scan_public_id };
        },
        async startSourceScan(req) {
            const description = [
                `commit ${req.git.commitSha}`,
                req.git.prNumber !== null ? `PR #${req.git.prNumber}` : null,
                req.git.runUrl ? `run ${req.git.runUrl}` : null,
            ]
                .filter(Boolean)
                .join(" · ")
                .slice(0, 2000);
            const body = {
                url: req.repoUrl,
                branch: req.ref,
                target: req.target,
                project_title: req.projectTitle.slice(0, 255),
                project_description: description,
            };
            if (req.scanners?.length)
                body.scanners = req.scanners;
            const res = await post("/source-scans/github", body, S.SourceScanResponse);
            return { kind: "source", id: res.public_id };
        },
        async getScan(ref) {
            const id = pathId(ref.id, "scan id");
            if (ref.kind === "source") {
                const r = await get(`/source-scans/${id}`, S.SourceScanResponse);
                return { ...ref, state: normalizeState(r.scan_status), rejectionReason: r.rejection_reason ?? null, completedAt: r.scan_completed_at ?? null };
            }
            const r = await get(`/scans/${id}`, S.BinaryScanDetail);
            return {
                ...ref,
                state: normalizeState(r.scan_status),
                rejectionReason: r.rejection_reason ?? null,
                completedAt: r.scan_completed_at ?? null,
                app: { name: r.app_name ?? null, packageName: r.app_package_name ?? null, version: r.app_version ?? null, type: r.project_type ?? null },
            };
        },
        async getFindings(ref) {
            const id = pathId(ref.id, "scan id");
            if (ref.kind === "source") {
                const items = await get(`/source-scans/${id}/findings`, z.array(S.SourceFindingItem));
                return items.map((item) => ({ kind: "source", item }));
            }
            const items = await get(`/scans/${id}/vulnerabilities`, z.array(S.VulnerabilityItem));
            return items.map((item) => ({ kind: "binary", item }));
        },
        async findBaselineScan(repoUrl, branch, target) {
            const list = await get("/source-scans", z.array(S.SourceScanResponse), { limit: "100" });
            const want = canonicalRepo(repoUrl);
            const match = list
                .filter((s) => normalizeState(s.scan_status) === "completed" && s.scan_target === target)
                .filter((s) => s.branch === branch && s.source_url && canonicalRepo(s.source_url) === want)
                .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
            return match ? { kind: "source", id: match.public_id } : null;
        },
        async requestFix(ref, findingId) {
            await post(`/source-scans/${pathId(ref.id, "scan id")}/findings/${pathId(findingId, "finding id")}/generate-fix`, {}, S.GenerateFixResponse);
        },
        async getFix(ref, findingId) {
            const r = await get(`/source-scans/${pathId(ref.id, "scan id")}/findings/${pathId(findingId, "finding id")}/fix-status`, S.FixStatusResponse);
            const st = (r.status ?? "").toLowerCase();
            if (r.diff)
                return { state: "ready", diff: r.diff, explanation: r.explanation ?? null, error: null };
            if (st === "failed" || st === "error" || r.error_message)
                return { state: "failed", diff: null, explanation: null, error: r.error_message ?? st };
            return { state: "pending", diff: null, explanation: null, error: null };
        },
    };
}
/** "https://github.com/Org/Repo.git" and "git@github.com:org/repo" compare equal. */
export function canonicalRepo(url) {
    let s = url.trim().toLowerCase();
    const ssh = s.match(/^git@([^:]+):(.+)$/);
    if (ssh)
        s = `https://${ssh[1]}/${ssh[2]}`;
    if (s.endsWith(".git"))
        s = s.slice(0, -4);
    while (s.endsWith("/"))
        s = s.slice(0, -1);
    try {
        const u = new URL(s);
        return `${u.hostname}${u.pathname}`;
    }
    catch {
        return s;
    }
}
//# sourceMappingURL=client.js.map