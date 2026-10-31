import { describe, expect, it } from "vitest";
import { z } from "zod";
import { canonicalRepo, createNandeeApi, normalizeState } from "../../src/api/client.js";
import type { HttpClient, JsonRequest } from "../../src/http/client.js";
import { Secret } from "../../src/secret.js";

function fakeHttp(routes: Record<string, unknown>): HttpClient & { requests: JsonRequest[]; puts: URL[] } {
  const requests: JsonRequest[] = [];
  const puts: URL[] = [];
  return {
    requests,
    puts,
    async json(req, schema) {
      requests.push(req);
      const key = `${req.method} ${req.url.pathname}`;
      if (!(key in routes)) throw new Error(`no route ${key}`);
      return (schema as z.ZodType).parse(routes[key]);
    },
    async putBytes(url) {
      puts.push(url);
    },
  };
}

const auth = new Secret("ci_testtesttesttesttest");
const base = new URL("https://app.nandee.ai");

describe("api client mapping (docs/ARCHITECTURE.md §3)", () => {
  it("runs the three-step binary upload", async () => {
    const http = fakeHttp({
      "POST /api/v2/scans/upload-init": { blob_path: "staging/x.apk", upload_url: "https://stnandeeprod.blob.core.windows.net/staging/x.apk?sig=1", expires_at: "2026-01-01T00:00:00Z" },
      "POST /api/v2/scans/upload-finalize": { hash: "h", scan_type: "apk", file_name: "x.apk", scan_public_id: "scn_123" },
    });
    const api = createNandeeApi(http, auth, base);
    const ref = await api.uploadBinary({ name: "x.apk", bytes: new Uint8Array(3) }, { projectTitle: "p", description: "d" });
    expect(ref).toEqual({ kind: "binary", id: "scn_123" });
    expect(http.puts[0]?.hostname).toBe("stnandeeprod.blob.core.windows.net");
    expect(http.requests[0]?.body).toEqual({ filename: "x.apk", size_bytes: 3 });
  });

  it("starts a source scan with git metadata in the description (assumption Q3)", async () => {
    const http = fakeHttp({ "POST /api/v2/source-scans/github": { public_id: "src_1", scan_status: "Inprogress", created_at: "2026-01-01T00:00:00Z" } });
    const api = createNandeeApi(http, auth, base);
    const ref = await api.startSourceScan({
      repoUrl: "https://github.com/acme/app", ref: "0123456789abcdef0123456789abcdef01234567", target: "mobile", scanners: ["static"], projectTitle: "acme/app",
      git: { repoUrl: "https://github.com/acme/app", branch: "feature", commitSha: "0123456789abcdef0123456789abcdef01234567", prNumber: 7, runUrl: "https://ci/run/1" },
    });
    expect(ref.id).toBe("src_1");
    const body = http.requests[0]?.body as Record<string, unknown>;
    expect(body.branch).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(body.project_description).toContain("PR #7");
    expect(body.scanners).toEqual(["static"]);
  });

  it("rejects ids that could alter the path", async () => {
    const api = createNandeeApi(fakeHttp({}), auth, base);
    await expect(api.getScan({ kind: "source", id: "../admin" })).rejects.toThrow(/not a valid Nandee id/);
    await expect(api.getScan({ kind: "source", id: "a?b" })).rejects.toThrow(/not a valid Nandee id/);
  });

  it("picks the newest completed scan of the same repo and branch as baseline", async () => {
    const mkScan = (id: string, status: string, url: string, branch: string, created: string) => ({ public_id: id, scan_status: status, scan_target: "mobile", source_url: url, branch, created_at: created });
    const http = fakeHttp({
      "GET /api/v2/source-scans": [
        mkScan("old", "Completed", "https://github.com/Acme/App.git", "main", "2026-01-01T00:00:00Z"),
        mkScan("new", "Completed", "git@github.com:acme/app", "main", "2026-02-01T00:00:00Z"),
        mkScan("running", "Inprogress", "https://github.com/acme/app", "main", "2026-03-01T00:00:00Z"),
        mkScan("other", "Completed", "https://github.com/acme/other", "main", "2026-03-01T00:00:00Z"),
      ],
    });
    const api = createNandeeApi(http, auth, base);
    expect(await api.findBaselineScan("https://github.com/acme/app", "main", "mobile")).toEqual({ kind: "source", id: "new" });
    expect(await api.findBaselineScan("https://github.com/acme/app", "develop", "mobile")).toBeNull();
  });

  it("normalises status strings and repo URLs", () => {
    expect(normalizeState("Inprogress")).toBe("running");
    expect(normalizeState("Completed")).toBe("completed");
    expect(normalizeState("Rejected")).toBe("rejected");
    expect(canonicalRepo("git@github.com:Acme/App.git")).toBe("github.com/acme/app");
    expect(canonicalRepo("https://github.com/acme/app/")).toBe("github.com/acme/app");
  });
});
