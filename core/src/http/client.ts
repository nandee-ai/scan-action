/**
 * The single HTTP path to the outside world (T-01, T-34, T-41, T-42).
 *
 *  - https only, except loopback addresses when a test opts in
 *  - the destination host must be on the allow-list, and so must every redirect
 *  - TLS verification cannot be turned off: the process refuses to run when
 *    NODE_TLS_REJECT_UNAUTHORIZED=0 or the TLS floor was lowered
 *  - every call has a timeout and a response size cap
 *  - errors never include request headers
 */
import tls from "node:tls";
import { ZodType } from "zod";
import { ApiError, AuthError, QuotaError, RedirectError, TimeoutError } from "../errors.js";
import type { Secret } from "../secret.js";

export interface HttpOptions {
  /** Exact host names, or "*.suffix" patterns.  Nothing else is contacted. */
  allowedHosts: ReadonlyArray<string>;
  totalTimeoutMs?: number;
  maxResponseBytes?: number;
  /** Tests only: allow http:// to 127.0.0.1 / ::1 / localhost. */
  allowLoopbackHttp?: boolean;
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
  userAgent?: string;
}

export interface JsonRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: URL;
  auth?: Secret;
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpClient {
  json<T>(req: JsonRequest, schema: ZodType<T>): Promise<T>;
  /** Raw PUT of bytes, used for the presigned blob upload.  No auth header is added. */
  putBytes(url: URL, body: Uint8Array, headers: Record<string, string>, timeoutMs?: number): Promise<void>;
}

const MAX_REDIRECTS = 3;

export function assertTlsNotWeakened(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new ApiError("NODE_TLS_REJECT_UNAUTHORIZED=0 is set. This integration does not run with certificate verification disabled.");
  }
  const min = tls.DEFAULT_MIN_VERSION;
  if (min === "TLSv1" || min === "TLSv1.1") {
    throw new ApiError(`The TLS floor was lowered to ${min}. This integration requires TLS 1.2 or newer.`);
  }
}

export function hostAllowed(hostname: string, allowed: ReadonlyArray<string>): boolean {
  const h = hostname.toLowerCase();
  return allowed.some((a) => {
    const p = a.toLowerCase();
    if (p.startsWith("*.")) return h.endsWith(p.slice(1)) && h.length > p.length - 1;
    return h === p;
  });
}

function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
}

export function createHttpClient(opts: HttpOptions): HttpClient {
  assertTlsNotWeakened();
  const doFetch = opts.fetch ?? globalThis.fetch;
  const maxBytes = opts.maxResponseBytes ?? 50 * 1024 * 1024;
  const totalTimeout = opts.totalTimeoutMs ?? 60_000;
  const ua = opts.userAgent ?? "nandee-ci";

  function checkUrl(url: URL, context: string): void {
    const loopbackOk = opts.allowLoopbackHttp === true && isLoopback(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopbackOk)) {
      throw new ApiError(`${context}: only https URLs are allowed (got ${url.protocol}//${url.host})`);
    }
    if (!hostAllowed(url.hostname, opts.allowedHosts) && !loopbackOk) {
      throw new ApiError(`${context}: host ${url.hostname} is not the configured Nandee host`);
    }
    if (url.username || url.password) throw new ApiError(`${context}: URLs with credentials are not allowed`);
  }

  async function readCapped(res: Response): Promise<Uint8Array> {
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) throw new ApiError(`Response too large (${declared} bytes, cap ${maxBytes})`, res.status);
    if (!res.body) return new Uint8Array();
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiError(`Response too large (over ${maxBytes} bytes)`, res.status);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  async function send(url: URL, init: RequestInit, timeoutMs: number, context: string): Promise<Response> {
    let current = url;
    for (let hop = 0; ; hop++) {
      checkUrl(current, context);
      let res: Response;
      try {
        res = await doFetch(current, { ...init, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
          throw new TimeoutError(`${context}: no response from ${current.host} within ${Math.round(timeoutMs / 1000)}s`);
        }
        // Undici wraps the network error; the cause message is useful, the headers never appear in it.
        const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : err instanceof Error ? err.message : String(err);
        throw new ApiError(`${context}: could not reach ${current.host} (${cause})`, null, { cause: err });
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new ApiError(`${context}: redirect without a Location header`, res.status);
        const next = new URL(loc, current);
        const loopbackOk = opts.allowLoopbackHttp === true && isLoopback(next.hostname);
        if (!hostAllowed(next.hostname, opts.allowedHosts) && !loopbackOk) {
          throw new RedirectError(current.host, next.hostname);
        }
        if (hop >= MAX_REDIRECTS) throw new ApiError(`${context}: too many redirects`, res.status);
        current = next;
        continue;
      }
      return res;
    }
  }

  function mapFailure(status: number, bodyText: string, context: string): never {
    const detail = extractDetail(bodyText);
    if (status === 401 || status === 403) {
      throw new AuthError(
        status === 403 && detail && !/token|credential|auth/i.test(detail)
          ? `${context}: Nandee refused the request (403): ${detail}`
          : undefined,
      );
    }
    if (status === 429) throw new QuotaError(`${context}: rate limited by Nandee (429)${detail ? `: ${detail}` : ""}. Retry later or raise your plan limits.`);
    if (status === 402) throw new QuotaError(`${context}: plan limit reached (402)${detail ? `: ${detail}` : ""}`);
    throw new ApiError(`${context}: Nandee returned ${status}${detail ? `: ${detail}` : ""}`, status);
  }

  return {
    async json<T>(req: JsonRequest, schema: ZodType<T>): Promise<T> {
      const headers: Record<string, string> = { accept: "application/json", "user-agent": ua };
      if (req.auth) headers.authorization = `Bearer ${req.auth.expose()}`;
      let body: string | undefined;
      if (req.body !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(req.body);
      }
      const context = `${req.method} ${req.url.pathname}`;
      const res = await send(req.url, { method: req.method, headers, ...(body !== undefined ? { body } : {}) }, req.timeoutMs ?? totalTimeout, context);
      const bytes = await readCapped(res);
      const text = Buffer.from(bytes).toString("utf8");
      if (!res.ok) mapFailure(res.status, text, context);
      let parsed: unknown;
      try {
        parsed = text.length ? JSON.parse(text) : null;
      } catch {
        throw new ApiError(`${context}: response was not JSON`, res.status);
      }
      const result = schema.safeParse(parsed);
      if (!result.success) {
        const issue = result.error.issues[0];
        throw new ApiError(`${context}: unexpected response shape (${issue ? `${issue.path.join(".") || "$"}: ${issue.message}` : "schema"}) (T-02)`, res.status);
      }
      return result.data;
    },

    async putBytes(url, body, headers, timeoutMs) {
      const context = `PUT ${url.hostname}`;
      const res = await send(url, { method: "PUT", headers: { ...headers, "user-agent": ua }, body }, timeoutMs ?? 15 * 60_000, context);
      await readCapped(res);
      if (!res.ok) throw new ApiError(`${context}: upload failed with ${res.status}`, res.status);
    },
  };
}

/** Pulls FastAPI's `{"detail": "..."}` out of an error body without echoing arbitrary content. */
function extractDetail(text: string): string | null {
  if (!text) return null;
  try {
    const j: unknown = JSON.parse(text);
    if (j && typeof j === "object" && "detail" in j && typeof (j as { detail: unknown }).detail === "string") {
      return (j as { detail: string }).detail.slice(0, 300).replace(/[\r\n]+/g, " ");
    }
  } catch {
    /* not JSON */
  }
  return null;
}
