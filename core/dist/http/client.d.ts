import { ZodType } from "zod";
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
    method: "GET" | "POST" | "PATCH" | "DELETE";
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
export declare function assertTlsNotWeakened(env?: NodeJS.ProcessEnv): void;
export declare function hostAllowed(hostname: string, allowed: ReadonlyArray<string>): boolean;
export declare function createHttpClient(opts: HttpOptions): HttpClient;
