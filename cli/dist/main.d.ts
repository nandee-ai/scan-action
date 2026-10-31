#!/usr/bin/env node
import { type NandeeApi } from "@nandee-ai/ci-core";
export interface CliIo {
    env: Record<string, string | undefined>;
    cwd: string;
    stdout: (s: string) => void;
    stderr: (s: string) => void;
    /** Test hook: replaces the real API. */
    api?: NandeeApi;
}
export declare function main(argv: string[], io: CliIo): Promise<number>;
