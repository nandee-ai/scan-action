/**
 * T-12: the one function every untrusted string passes through before it is
 * put into Markdown (PR comments, MR notes, job summaries).
 *
 * It neutralises Markdown and HTML syntax, @-mentions, link forms, table
 * separators and control characters, and bounds the length.  Nothing from a
 * finding is ever rendered as a link; links are built from the dashboard
 * origin only (see summary.ts).
 */
export declare function escapeMarkdown(untrusted: unknown, maxLen?: number): string;
/**
 * For code spans: no escaping works inside backticks, so backticks and
 * backslashes are removed, a pipe becomes a fullwidth bar so it cannot end
 * a table cell, and the span is bounded.
 */
export declare function codeSpan(untrusted: unknown, maxLen?: number): string;
/** Only origins we built ourselves may become links. */
export declare function safeLink(text: string, url: string, allowedOrigin: string): string;
