/**
 * T-30: every line that leaves the process goes through the scrubber,
 * including debug output and error stacks.  The front ends supply the sink
 * (`@actions/core` on GitHub, stderr on GitLab and the CLI).
 */
import { CI_TOKEN_PATTERN } from "./secret.js";
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
 * Replaces every known secret value, the URL-encoded form of it, and anything
 * that looks like a CI token.  Secrets shorter than 8 characters are not
 * scrubbed by value because that would redact ordinary words; the token
 * pattern still catches real tokens.
 */
export function createScrubber(secrets) {
    const patterns = [];
    for (const s of secrets) {
        const v = s.expose();
        if (v.length < 8)
            continue;
        patterns.push(new RegExp(escapeRegExp(v), "g"));
        const enc = encodeURIComponent(v);
        if (enc !== v)
            patterns.push(new RegExp(escapeRegExp(enc), "g"));
        const b64 = Buffer.from(v, "utf8").toString("base64");
        patterns.push(new RegExp(escapeRegExp(b64), "g"));
    }
    return (text) => {
        let out = text;
        for (const p of patterns)
            out = out.replace(p, "[redacted]");
        return out.replace(CI_TOKEN_PATTERN, "[redacted]");
    };
}
export function createLogger(sink, scrub, opts = {}) {
    const emit = (level, msg) => {
        if (level === "debug" && !opts.debug)
            return;
        sink.write(level, scrub(String(msg)));
    };
    return {
        debug: (m) => emit("debug", m),
        info: (m) => emit("info", m),
        warn: (m) => emit("warn", m),
        error: (m) => emit("error", m),
        async group(name, fn) {
            sink.startGroup?.(scrub(name));
            try {
                return await fn();
            }
            finally {
                sink.endGroup?.();
            }
        },
        scrub,
    };
}
/** A sink that writes to stderr with a level prefix.  Used by the CLI and the GitLab wrapper. */
export const stderrSink = {
    write(level, line) {
        const prefix = level === "info" ? "" : `[${level}] `;
        process.stderr.write(`${prefix}${line}\n`);
    },
    startGroup(name) {
        process.stderr.write(`── ${name}\n`);
    },
};
/** Formats an unknown thrown value for a log line without leaking more than its message. */
export function describeError(err) {
    if (err instanceof Error) {
        const cause = err.cause instanceof Error ? ` (cause: ${err.cause.message})` : "";
        return `${err.name}: ${err.message}${cause}`;
    }
    return String(err);
}
//# sourceMappingURL=log.js.map