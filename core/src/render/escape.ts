/**
 * T-12: the one function every untrusted string passes through before it is
 * put into Markdown (PR comments, MR notes, job summaries).
 *
 * It neutralises Markdown and HTML syntax, @-mentions, link forms, table
 * separators and control characters, and bounds the length.  Nothing from a
 * finding is ever rendered as a link; links are built from the dashboard
 * origin only (see summary.ts).
 */

const ZWSP = "\u200b";

export function escapeMarkdown(untrusted: unknown, maxLen = 300): string {
  let s = typeof untrusted === "string" ? untrusted : untrusted == null ? "" : String(untrusted);
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, "");
  s = s.replace(/[\r\n\t]+/g, " ");
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1)}…`;
  s = s.replace(/[\\`*_{}[\]()#+\-!|<>~]/g, (c) => `\\${c}`);
  s = s.replace(/&/g, "&amp;");
  s = s.replace(/@/g, `@${ZWSP}`);
  s = s.replace(/:\/\//g, `:${ZWSP}//`);
  return s;
}

/**
 * For code spans: no escaping works inside backticks, so backticks and
 * backslashes are removed, a pipe becomes a fullwidth bar so it cannot end
 * a table cell, and the span is bounded.
 */
export function codeSpan(untrusted: unknown, maxLen = 120): string {
  let s = typeof untrusted === "string" ? untrusted : untrusted == null ? "" : String(untrusted);
  s = s.replace(/[\u0000-\u001f\u007f`\\]/g, "").replace(/\|/g, "\uff5c");
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1)}…`;
  return `\`${s || " "}\``;
}

/** Only origins we built ourselves may become links. */
export function safeLink(text: string, url: string, allowedOrigin: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return escapeMarkdown(text);
  }
  if (u.origin !== allowedOrigin || u.protocol !== "https:") return escapeMarkdown(text);
  // encodeURIComponent leaves ( ) alone, and they would close the Markdown link early.
  const href = u.href.replace(/[()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
  return `[${escapeMarkdown(text)}](${href})`;
}
