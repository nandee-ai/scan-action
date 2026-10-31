import type { HttpClient } from "../http/client.js";
import type { Secret } from "../secret.js";
import type { NandeeApi, ScanState } from "./types.js";
export declare const API_PREFIX = "/api/v2";
export declare function normalizeState(raw: string): ScanState;
export declare function createNandeeApi(http: HttpClient, auth: Secret, baseUrl: URL): NandeeApi;
/** "https://github.com/Org/Repo.git" and "git@github.com:org/repo" compare equal. */
export declare function canonicalRepo(url: string): string;
