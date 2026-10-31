import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { z } from "zod";
import { assertTlsNotWeakened, createHttpClient, hostAllowed } from "../../src/http/client.js";
import { ApiError, AuthError, QuotaError, RedirectError, TimeoutError } from "../../src/errors.js";
import { Secret } from "../../src/secret.js";

let server: http.Server;
let base: URL;
const seen: Array<{ url: string; headers: http.IncomingHttpHeaders }> = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen.push({ url: req.url ?? "", headers: req.headers });
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    switch (u.pathname) {
      case "/ok":
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ hash: "abc", scan_status: "Completed" }));
        return;
      case "/redirect-same":
        res.writeHead(302, { location: "/ok" });
        res.end();
        return;
      case "/redirect-other":
        res.writeHead(302, { location: "https://evil.example/steal" });
        res.end();
        return;
      case "/loop":
        res.writeHead(302, { location: "/loop" });
        res.end();
        return;
      case "/big": {
        res.setHeader("content-type", "application/json");
        res.write("[");
        res.write("1,".repeat(300_000));
        res.end("1]");
        return;
      }
      case "/slow":
        setTimeout(() => res.end("{}"), 2_000);
        return;
      case "/401":
        res.writeHead(401);
        res.end(JSON.stringify({ detail: "Invalid or revoked CI token" }));
        return;
      case "/429":
        res.writeHead(429);
        res.end(JSON.stringify({ detail: "slow down" }));
        return;
      case "/500":
        res.writeHead(500);
        res.end("<html>Traceback: /opt/secret.py</html>");
        return;
      case "/badjson":
        res.end("not json");
        return;
      default:
        res.writeHead(404);
        res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  base = new URL(`http://127.0.0.1:${addr.port}/`);
});
afterAll(() => server.close());

const schema = z.object({ hash: z.string(), scan_status: z.string() });
const mk = (over = {}) => createHttpClient({ allowedHosts: ["app.nandee.ai", "*.blob.core.windows.net"], allowLoopbackHttp: true, maxResponseBytes: 100_000, ...over });

describe("hostAllowed (T-34)", () => {
  it("matches exact hosts and wildcard suffixes only", () => {
    const allowed = ["app.nandee.ai", "*.blob.core.windows.net"];
    expect(hostAllowed("app.nandee.ai", allowed)).toBe(true);
    expect(hostAllowed("APP.NANDEE.AI", allowed)).toBe(true);
    expect(hostAllowed("stnandeeprod.blob.core.windows.net", allowed)).toBe(true);
    expect(hostAllowed("blob.core.windows.net", allowed)).toBe(false);
    expect(hostAllowed("app.nandee.ai.evil.com", allowed)).toBe(false);
    expect(hostAllowed("evilapp.nandee.ai", allowed)).toBe(false);
  });
});

describe("http client (T-01, T-42)", () => {
  it("sends the bearer token and parses a valid response", async () => {
    const c = mk();
    const r = await c.json({ method: "GET", url: new URL("/ok", base), auth: new Secret("ci_tokentokentokentoken") }, schema);
    expect(r.scan_status).toBe("Completed");
    expect(seen.at(-1)?.headers.authorization).toBe("Bearer ci_tokentokentokentoken");
  });

  it("refuses hosts outside the allow-list and non-https URLs", async () => {
    const c = createHttpClient({ allowedHosts: ["app.nandee.ai"] });
    await expect(c.json({ method: "GET", url: new URL("https://api.nandee.ai/x") }, schema)).rejects.toThrow(/not the configured Nandee host/);
    await expect(c.json({ method: "GET", url: new URL("http://app.nandee.ai/x") }, schema)).rejects.toThrow(/only https/);
    await expect(c.json({ method: "GET", url: new URL("https://user:pw@app.nandee.ai/x") }, schema)).rejects.toThrow(/credentials/);
  });

  it("follows a same-host redirect but refuses one to another host", async () => {
    const c = mk();
    await expect(c.json({ method: "GET", url: new URL("/redirect-same", base) }, schema)).resolves.toBeTruthy();
    await expect(c.json({ method: "GET", url: new URL("/redirect-other", base) }, schema)).rejects.toBeInstanceOf(RedirectError);
    await expect(c.json({ method: "GET", url: new URL("/loop", base) }, schema)).rejects.toThrow(/too many redirects/);
  });

  it("caps the response size", async () => {
    await expect(mk().json({ method: "GET", url: new URL("/big", base) }, z.any())).rejects.toThrow(/too large/);
  });

  it("times out", async () => {
    await expect(mk().json({ method: "GET", url: new URL("/slow", base), timeoutMs: 200 }, z.any())).rejects.toBeInstanceOf(TimeoutError);
  });

  it("maps status codes to typed errors without echoing bodies that are not JSON detail", async () => {
    const c = mk();
    await expect(c.json({ method: "GET", url: new URL("/401", base) }, schema)).rejects.toBeInstanceOf(AuthError);
    await expect(c.json({ method: "GET", url: new URL("/429", base) }, schema)).rejects.toBeInstanceOf(QuotaError);
    const err = await c.json({ method: "GET", url: new URL("/500", base) }, schema).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).not.toContain("Traceback");
    expect(err.message).toContain("500");
  });

  it("rejects malformed and off-schema responses (T-02)", async () => {
    const c = mk();
    await expect(c.json({ method: "GET", url: new URL("/badjson", base) }, schema)).rejects.toThrow(/not JSON/);
    await expect(c.json({ method: "GET", url: new URL("/ok", base) }, z.object({ nope: z.string() }))).rejects.toThrow(/unexpected response shape/);
  });

  it("never puts the token in an error message", async () => {
    const c = mk();
    const err = await c.json({ method: "GET", url: new URL("/500", base), auth: new Secret("ci_leakleakleakleakleak") }, schema).catch((e) => e);
    expect(String(err.message)).not.toContain("leakleak");
  });
});

describe("TLS guard", () => {
  it("refuses to run with verification disabled", () => {
    expect(() => assertTlsNotWeakened({ NODE_TLS_REJECT_UNAUTHORIZED: "0" })).toThrow(/certificate verification disabled/);
    expect(() => assertTlsNotWeakened({})).not.toThrow();
  });
});
