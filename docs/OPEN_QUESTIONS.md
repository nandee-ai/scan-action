# Open questions before implementation

Each question says what I'll assume if there's no answer, so the build can start either way. Assumptions carry into the README's "Assumptions" section verbatim.

## About the Nandee API

**Q1. How does a source scan get the code?**
Today `POST /source-scans/github` takes a repo URL and Nandee clones it server-side, via the tenant's GitHub App installation. That is good for the threat model (the runner uploads nothing for SAST/SCA) but it means: (a) the repo must be reachable by Nandee's GitHub App, so GitLab-hosted repos can't be scanned this way today; (b) a PR from a fork can't be scanned at the PR's commit unless Nandee can fetch it.
*Assume:* GitHub repos go through the URL path. For GitLab and other hosts, the integration marks SAST/SCA as "not available for this host yet" with a clear error, until a source-upload endpoint exists. I will define `uploadSourceArchive()` on the interface, mocked, for that future endpoint.
*Consequence for GitLab (2026-10-31):* the GitLab component defaults to `scan_types: dast` on the built artifact, because `sast,sca` would fail with exit 2 on every GitLab-hosted repository. Teams that mirror to github.com can set `scan_types: sast,sca` once the mirror is installed in Nandee's GitHub App; the runner then scans the mirror URL only if `CI_PROJECT_URL` is on github.com, which on gitlab.com it never is, so for now source scans from GitLab need the CLI with `--repo-url`.

**Q2. There is no `project_id`.**
Scans belong to the token's user and tenant; `project_title` is a free-text string on both scan kinds.
*Assume:* the integration's `project_id` input is sent as `project_title`, and the README says so. If you'd rather add a real `project_id` (and a per-project CI token scope) to the API, I'll build against that instead.

**Q3. No `commit_sha` or `pr_number` on scan requests.**
`GitHubScanRequest` has `branch` only. For a PR scan we need the exact commit, otherwise a push during the scan changes what was scanned, and the SARIF upload must name a commit.
*Assume:* I pass the commit SHA in `branch` (git accepts a SHA as a ref for clone + checkout; need to confirm Stafix does) and record `pr_number` and the run URL in `project_description`. Better: add optional `commit_sha`, `pr_number`, `ci_run_url` fields to `GitHubScanRequest`. Small backend change; I can include it as a separate PR to the `nandee` repo if you want.

**Q4. Scan status vocabulary.**
Status strings are `Inprogress`, `Completed`, `Rejected`, with `rejection_reason`. Is there a queued state distinct from in-progress, and is `Rejected` always terminal?
*Assume:* `Inprogress` = running, `Rejected` = terminal failure with `rejection_reason` shown to the user (exit code 7), anything else unknown = keep polling until timeout.

**Q5. Blob upload host.**
`upload-init` returns a SAS URL. Is it always `https://stnandeeprod.blob.core.windows.net/…`? The HTTP client allow-lists hosts, so I need the pattern.
*Assume:* `*.blob.core.windows.net` plus the configured API host. Self-hosted customers can extend the allow-list with an `extra_allowed_hosts` input.

**Q6. Baseline scans.**
To fail only on findings new relative to the target branch, I need the latest completed scan of the same repo on the base branch. `GET /source-scans` lists the tenant's scans with `source_url` and `branch`, so the client can find one. Is that acceptable, or should the API expose `GET /source-scans/latest?url=&branch=`?
*Assume:* list and filter client-side, capped at the newest 100 scans. Baseline is skipped with a warning when no base scan exists.

**Q7. AI Triage verdicts.**
`SourceFindingItem.validator_verdict` exists. What are its values, and do binary-scan findings have an equivalent? `ai_triage: true` should count only findings Nandee judged exploitable.
*Assume:* verdict values `exploitable | false_positive | unknown`; `unknown` counts toward the gate (safer). Binary findings have no verdict, so `ai_triage` has no effect on them, and the summary says so.

**Q8. Green Agent on mobile source scans.**
Per-finding `generate-fix` → `create-pr` exists for web source scans; mobile uses a batch `/preview`. The brief wants fix PRs for Kotlin, Swift, Dart, JS/TS.
*Assume:* `green_agent: pull-request` is implemented for the per-finding path. For mobile scans it collects whatever `fix_diff` fields are present on findings and opens one PR from the runner (using the CI token, never Nandee's App), so it works regardless of engine. If no diffs are present it says so and exits 0.

**Q9. OIDC / short-lived credentials.**
No token-exchange endpoint exists. Proposed future endpoint: `POST /auth/ci-token-exchange` with the platform's OIDC JWT (`aud: nandee.ai`), verified against the GitHub/GitLab JWKS, returning a 15-minute `ci_` token bound to the repo's `sub`. Tenants would register trusted `sub` patterns in Settings.
*Assume:* documented as future work; the integration already accepts `api_key` from either a secret or the exchange, so adding it later changes no customer YAML.

**Q10. Which scanners map to `sast` and `sca`?**
`scanners` on the source request is "an optional Stafix scanner subset (e.g. `static`, `secret`)". Is there an SCA/dependency scanner name, and is binary scanning what the brief calls DAST (MobSF static+dynamic on the binary), or is DAST a separate engine?
*Assume:* `sast` → `scanners: ["static","secret"]`, `sca` → `["dependency"]` (name to confirm), `dast` → a binary upload. If `sca` has no scanner today, the input is accepted and the README says SCA findings appear when the engine returns them.

**Q11. Rate limits and quotas.**
Uploads are rate-limited per tenant and plan features can be off (`dast_enabled`, `mobile_scans_enabled`). What status codes and bodies come back? I'll map 429 and "feature not enabled" 403s to exit code 6.

## About publishing and ownership

**Q12. Org and names.** *Decided 2026-10-31:* `nandee-ai` everywhere. GitHub `nandee-ai/scan-action` (Marketplace: "Nandee-AI Mobile Application Security Scan"), GitLab `nandee-ai/scan`, npm `@nandee-ai/cli` with binary `nandee`, image `ghcr.io/nandee-ai/scan`. Plain `nandee` is reserved wherever it's free (GitLab group, npm package, ghcr namespace); the GitHub user `nandee` is taken. Full table in `docs/ARCHITECTURE.md`. Still to do by you: create the GitHub org, the GitLab groups `nandee-ai` and `nandee`, and claim the npm scope.

**Q13. The existing `cli/` folder in the `nandee` repo.** It has a composite action and `nandee_scan.py` that hit `/api/source-scans/github` (old prefix) and interpolate `${{ inputs.* }}` into a `run:` block, which is the injection pattern this project forbids (T-10). Once the new action ships I'd replace that folder with a pointer to the new repo. Say if you want it kept.

**Q14. Security contact.** `security@nandee.ai` for SECURITY.md: confirm it's a monitored mailbox.

## Trade-offs I'm making that you should know about

- **`fail_mode: closed` by default** means a Nandee outage blocks merges. That's the right default for a security gate but it will be the first support ticket. The job summary spells out why it failed and how to set `open`.
- **Fork PRs get no scan by default.** The safe opt-in (label-gated `pull_request`, never `pull_request_target` with a checkout; DONT-USE) still exposes the API key to code a maintainer chose to run. The docs say that plainly.
- **One runtime dependency in core (`zod`)** for schema validation of inputs and API responses. Hand-written validation would avoid it, but at the cost of the very bugs it prevents. `@actions/core` and `@actions/github` are runtime dependencies of the action only.
- **Public-repo comments show counts only** (T-33). Customers who want full titles on public PRs set `comment_detail: full`.
