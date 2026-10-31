/**
 * A loopback HTTP server that speaks the real Nandee endpoint paths from
 * fixtures.  Used by the integration tests and by `nandee scan --mock-server`
 * during development.  It checks the bearer token so auth failures are
 * exercised end to end.
 */
import http from "node:http";
import { loadBinaryFindings, loadSourceFindings } from "../fixtures/index.js";

export interface MockServer {
  url: URL;
  requests: Array<{ method: string; path: string; auth: string | undefined; body: string }>;
  close(): Promise<void>;
}

export interface MockServerOptions {
  token: string;
  pollsUntilDone?: number;
  rejectSource?: string;
}

export async function startMockServer(opts: MockServerOptions): Promise<MockServer> {
  const requests: MockServer["requests"] = [];
  const polls = new Map<string, number>();
  let counter = 0;

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      requests.push({ method: req.method ?? "", path: url.pathname, auth: req.headers.authorization, body });
      const json = (status: number, data: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
      };
      // Blob upload target: no auth header expected.
      if (req.method === "PUT" && url.pathname.startsWith("/blob/")) {
        res.writeHead(201);
        res.end();
        return;
      }
      if (req.headers.authorization !== `Bearer ${opts.token}`) return json(401, { detail: "Invalid or revoked CI token" });
      const p = url.pathname;
      const now = new Date().toISOString();
      if (req.method === "POST" && p === "/api/v2/scans/upload-init") {
        const b = JSON.parse(body) as { filename: string };
        return json(200, { blob_path: `staging/${b.filename}`, upload_url: `${baseUrl}blob/${b.filename}?sig=x`, expires_at: now });
      }
      if (req.method === "POST" && p === "/api/v2/scans/upload-finalize") {
        const id = `bin_${++counter}`;
        return json(201, { hash: "h".repeat(32), scan_type: "apk", file_name: "x.apk", scan_public_id: id });
      }
      if (req.method === "POST" && p === "/api/v2/source-scans/github") {
        const id = `src_${++counter}`;
        return json(201, { public_id: id, scan_status: "Inprogress", scan_target: "mobile", created_at: now });
      }
      if (req.method === "GET" && p === "/api/v2/source-scans") {
        return json(200, [{ public_id: "src_base", scan_status: "Completed", scan_target: "mobile", source_url: "https://github.com/acme/app", branch: "main", created_at: now }]);
      }
      const m = p.match(/^\/api\/v2\/(source-scans|scans)\/([A-Za-z0-9_-]+)(\/(findings|vulnerabilities))?$/);
      if (req.method === "GET" && m) {
        const [, kind, id, , sub] = m;
        if (sub) {
          if (id === "src_base") return json(200, loadSourceFindings().filter((f) => f.id === 101));
          return json(200, kind === "scans" ? loadBinaryFindings() : loadSourceFindings());
        }
        const n = (polls.get(id!) ?? 0) + 1;
        polls.set(id!, n);
        const done = n >= (opts.pollsUntilDone ?? 2);
        if (kind === "source-scans") {
          if (opts.rejectSource) return json(200, { public_id: id, scan_status: "Rejected", rejection_reason: opts.rejectSource, created_at: now });
          return json(200, { public_id: id, scan_status: done ? "Completed" : "Inprogress", scan_target: "mobile", created_at: now, scan_completed_at: done ? now : null });
        }
        return json(200, { public_id: id, scan_status: done ? "Completed" : "Inprogress", app_name: "Acme", project_type: "apk" });
      }
      return json(404, { detail: "Not Found" });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${port}/`;
  return { url: new URL(baseUrl), requests, close: () => new Promise((r) => server.close(() => r())) };
}
