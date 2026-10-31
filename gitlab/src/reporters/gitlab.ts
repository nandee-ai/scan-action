/**
 * GitLab-side reporting through the REST API: the sticky merge request
 * note and the Green Agent fix merge request.  The report artifacts
 * (gl-sast-report.json, gl-dependency-scanning-report.json, dotenv) need no
 * API: the job template declares them.
 *
 * Every call goes through the core HTTP client, so the host allow-list,
 * timeouts, size caps and redirect policy apply (T-34).  Failures here are
 * warnings naming the scope the token needs (T-50); they never change the
 * gate decision.
 */
import { z } from "zod";
import { COMMENT_MARKER, escapeMarkdown, exec, type FixBranchPlan, type HttpClient, type Logger, type Secret } from "@nandee-ai/ci-core";

const NoteList = z.array(z.object({ id: z.number(), body: z.string().optional() }));
const Note = z.object({ id: z.number() });
const MergeRequest = z.object({ iid: z.number(), web_url: z.string() });

export interface GitLabApiRef {
  http: HttpClient;
  apiV4Url: string;
  projectId: string;
  token: Secret;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Posts or updates the note carrying the marker on the merge request. */
export async function upsertMergeRequestNote(gl: GitLabApiRef, mrIid: number, body: string, log: Logger): Promise<boolean> {
  if (!body.includes(COMMENT_MARKER)) throw new Error("note body is missing the marker");
  const base = `${gl.apiV4Url}/projects/${encodeURIComponent(gl.projectId)}/merge_requests/${mrIid}/notes`;
  try {
    let existing: number | null = null;
    for (let page = 1; page <= 5 && existing === null; page++) {
      const notes = await gl.http.json({ method: "GET", url: new URL(`${base}?per_page=100&page=${page}`), auth: gl.token }, NoteList);
      existing = notes.find((n) => n.body?.includes(COMMENT_MARKER))?.id ?? null;
      if (notes.length < 100) break;
    }
    if (existing !== null) await gl.http.json({ method: "PUT", url: new URL(`${base}/${existing}`), auth: gl.token, body: { body } }, Note);
    else await gl.http.json({ method: "POST", url: new URL(base), auth: gl.token, body: { body } }, Note);
    log.info(existing !== null ? "Updated the Nandee merge request note." : "Posted the Nandee merge request note.");
    return true;
  } catch (err) {
    log.warn(`Merge request note skipped: ${describe(err)}. NANDEE_GITLAB_TOKEN needs the \`api\` scope (Reporter role or above).`);
    return false;
  }
}

/**
 * Pushes the fix branch with the token passed through git's environment
 * config (never argv, T-30) and opens a draft merge request against `base`.
 */
export async function openFixMergeRequest(
  gl: GitLabApiRef,
  plan: FixBranchPlan,
  args: { base: string; serverUrl: string; projectUrl: string; scanId: string; reportUrl: string },
  log: Logger,
): Promise<{ url: string; iid: number } | null> {
  if (!plan.commitSha || plan.applied.length === 0) {
    log.info("Green Agent: no patch applied, no merge request opened.");
    return null;
  }
  if (plan.branchName === args.base) throw new Error("refusing to push the fix onto the source branch (T-15)");
  const remote = `${args.projectUrl.replace(/\/+$/, "")}.git`;
  const header = `AUTHORIZATION: basic ${Buffer.from(`oauth2:${gl.token.expose()}`).toString("base64")}`;
  const push = await exec("git", ["push", "--quiet", "-o", "ci.skip", "--", remote, `HEAD:refs/heads/${plan.branchName}`], {
    cwd: plan.repoDir,
    timeoutMs: 120_000,
    env: { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `http.${args.serverUrl}/.extraheader`, GIT_CONFIG_VALUE_0: header, GIT_TERMINAL_PROMPT: "0" },
  });
  if (push.code !== 0) {
    log.warn(`Green Agent: push of ${plan.branchName} failed (NANDEE_GITLAB_TOKEN needs \`write_repository\`, Developer role): ${push.stderr.replace(header, "[redacted]").slice(0, 300)}`);
    return null;
  }
  const n = plan.applied.length;
  const title = `Draft: fix(security): ${n} Nandee Green Agent patch${n === 1 ? "" : "es"}`;
  try {
    const mr = await gl.http.json({
      method: "POST",
      url: new URL(`${gl.apiV4Url}/projects/${encodeURIComponent(gl.projectId)}/merge_requests`),
      auth: gl.token,
      body: { source_branch: plan.branchName, target_branch: args.base, title, description: fixMrDescription(plan, args.scanId, args.reportUrl), remove_source_branch: true, squash: false },
    }, MergeRequest);
    log.info(`Green Agent: opened ${mr.web_url}`);
    return { url: mr.web_url, iid: mr.iid };
  } catch (err) {
    log.warn(`Green Agent: branch pushed but the merge request could not be opened (token needs the \`api\` scope): ${describe(err)}`);
    return null;
  }
}

export function fixMrDescription(plan: FixBranchPlan, scanId: string, reportUrl: string): string {
  const lines = [
    COMMENT_MARKER.replace("summary", "fix-mr"),
    `Patches written by Nandee Green Agent for scan \`${scanId.replace(/[^A-Za-z0-9_-]/g, "")}\` on commit \`${plan.baseSha.slice(0, 12)}\`.`,
    "",
    "**Review every change before merging.** These were generated by an AI agent; they compile only if your pipeline says so.",
    "",
    "| Severity | Finding | Explanation |",
    "|---|---|---|",
    ...plan.applied.map((p) => `| ${escapeMarkdown(p.finding.severity)} | ${escapeMarkdown(p.finding.title, 120)} | ${escapeMarkdown(p.explanation ?? "", 300)} |`),
  ];
  if (plan.rejected.length) {
    lines.push("", "Not applied:", ...plan.rejected.map((r) => `- ${escapeMarkdown(r.patch.finding.title, 120)}: ${escapeMarkdown(r.reason, 200)}`));
  }
  lines.push("", `Report: ${reportUrl}`);
  return lines.join("\n");
}

/** Green Agent "comment" mode: patches as fenced diffs with inner fences neutralised. */
export function renderFixSection(patches: ReadonlyArray<{ finding: { title: string; severity: string }; diff: string; explanation: string | null }>): string {
  if (!patches.length) return "";
  const out = ["", "### Green Agent suggested fixes", ""];
  for (const p of patches) {
    const diff = p.diff.replace(/```/g, "`​`​`").slice(0, 20_000);
    out.push(`<details><summary>${escapeMarkdown(p.finding.severity)}: ${escapeMarkdown(p.finding.title, 120)}</summary>`, "", escapeMarkdown(p.explanation ?? "", 500), "", "```diff", diff, "```", "", "</details>", "");
  }
  return out.join("\n");
}
