# Threat model: Nandee CI/CD integrations

Status: draft for review, before any code is written.
Scope: the GitHub Action, the GitLab CI/CD Component and template, the `nandee` CLI, and the shared core they are built on. The Nandee platform itself (API, scanners, dashboard) is out of scope except where this code trusts it.

This document is kept next to the code. Every threat below has an ID (`T-nn`). The code and tests reference those IDs in comments and test names, so a reviewer can find the mitigation for any threat with one search.

## 1. What runs where

```
┌──────────────────────── customer's CI runner ─────────────────────────┐
│  checkout of the customer repo (source, build files, maybe secrets)    │
│  built artifact (APK / AAB / IPA)                                      │
│  CI token for the CI platform (GITHUB_TOKEN / CI_JOB_TOKEN)            │
│                                                                        │
│  ┌──────────────── this integration ──────────────┐                    │
│  │ action / component / CLI → shared core          │                    │
│  │ reads inputs, uploads, polls, converts, gates   │                    │
│  └────────┬─────────────────────────┬──────────────┘                    │
│           │ HTTPS, Bearer token     │ CI platform API (comments,        │
│           │                         │ SARIF upload, fix PR)             │
└───────────┼─────────────────────────┼──────────────────────────────────┘
            ▼                         ▼
   ┌─────────────────┐       ┌────────────────────┐
   │  Nandee API     │       │ GitHub / GitLab    │
   │  app.nandee.ai  │       │ (api.github.com,   │
   │  + blob storage │       │  customer's GitLab)│
   └─────────────────┘       └────────────────────┘
```

## 2. Assets

| ID | Asset | Where it lives during a run | Impact if lost or altered |
|---|---|---|---|
| A1 | Customer source code | runner workspace; uploaded to Nandee only when a SAST scan needs it (today: Nandee clones the repo itself, see Q1 in open questions) | confidentiality: IP, embedded secrets, customer data in fixtures |
| A2 | Built mobile binaries (APK, AAB, IPA) | runner workspace; uploaded to Nandee blob storage for DAST/binary scans | confidentiality: unreleased features, signing identity in IPA |
| A3 | Nandee API key (`ci_…` token) | CI secret store → env var in the job → `Authorization` header | an attacker can start scans, read every finding of the tenant, request fixes |
| A4 | CI platform token (`GITHUB_TOKEN`, GitLab job token or project access token) | job env | write to code scanning, comments, branches; with broad scopes, the repo itself |
| A5 | Findings data (titles, file paths, snippets, fix diffs) | Nandee API responses → SARIF / GitLab reports → PR comments | confidentiality: a map of the app's weaknesses; integrity: hidden or faked findings defeat the gate |
| A6 | The pipeline gate decision (pass/fail) | exit code and outputs | integrity: a wrong "pass" ships a vulnerable build; a wrong "fail" blocks releases |
| A7 | This integration's own supply chain (npm deps, action tags, container image) | GitHub Marketplace, GitLab Catalog, registry | every customer pipeline runs whatever we ship |
| A8 | Signing material and other repo secrets present on the runner | runner env and files | we must never read, upload or log them |

## 3. Trust boundaries

| ID | Boundary | What crosses it | Trust level |
|---|---|---|---|
| B1 | CI platform → integration (inputs, env vars, event payload) | inputs, branch names, PR titles, commit messages, file paths | **untrusted**: a PR author controls most of it |
| B2 | Integration → Nandee API | token, repo URL, branch/commit, artifact bytes | trusted destination, but only the configured host over TLS |
| B3 | Nandee API → integration | scan status, findings JSON, fix diffs, blob upload URLs | **untrusted content**: validated against a schema; rendered text is escaped |
| B4 | Integration → CI platform API | SARIF, comments, job summary, fix branch and PR | writes are limited to what the token scope allows; content is escaped |
| B5 | Forked PR → base repo workflow | PR code and metadata | **hostile by default**: no secrets are available, and none should be |
| B6 | Third-party dependencies → this code | npm packages, base images, actions | pinned by hash and reviewed; kept to a minimum |
| B7 | Nandee's fix PR (Green Agent) → customer repo | branch + PR with AI-written patches | never merged automatically; never pushed to the source branch |

## 4. Threats (STRIDE) and mitigations

Columns: **Where** names the module or file that will carry the mitigation; **Test** names the test that proves it. Both are commitments for the implementation stages, not descriptions of code that exists yet.

### Spoofing

| ID | Threat | Mitigation | Where | Test |
|---|---|---|---|---|
| T-01 | A fake Nandee host (DNS, proxy, typo in `api_url`) receives the token and the artifact | TLS 1.2+ with full certificate verification and no off switch; `api_url` must be `https://`; the request host must equal the configured host; redirects to any other host are refused (`redirect: "manual"`, then the `Location` host is checked) | `core/src/http/client.ts` | `client.test.ts`: redirect to another host → `NandeeRedirectError`; `http://` URL rejected by input schema |
| T-02 | A forged API response (MITM or compromised CDN) claims "Completed, 0 findings" | Same TLS controls; every response validated against a schema; `Completed` with a missing or malformed findings list is an error, not a pass | `core/src/api/schemas.ts` | `schemas.test.ts` |
| T-03 | A PR from a fork impersonates a trusted contributor to get a scan with secrets | Default: scans that need the API key don't run on fork PRs (`pull_request` from a fork has no secrets anyway; the action detects the fork case and exits 0 with a notice). Documented opt-in uses the `pull_request` event on a label gate and never `pull_request_target` with a checkout of PR code | `github-action/src/fork.ts`, README "Forked pull requests" | `fork.test.ts` |
| T-04 | Someone replaces our published action, image or package with a lookalike | Marketplace listing from the `nandee-ai` org (verified-creator badge once GitHub grants it); the `nandee` name reserved on GitLab, npm and ghcr so a lookalike can't take it; image signed with cosign (keyless, Sigstore), SLSA provenance; README shows the exact `cosign verify` command and expected identity; customers pin by SHA or digest | `.github/workflows/release.yml`, README "Verify what you run" | release workflow asserts signature before publishing tags |

### Tampering

| ID | Threat | Mitigation | Where | Test |
|---|---|---|---|---|
| T-10 | Command injection through inputs, branch names, PR titles, commit messages (`$(…)`, backticks, `;`) | No shell anywhere: `child_process.execFile` with argument arrays only, no `shell: true`, no `eval`, no template-built commands. The action is a JavaScript action, not a composite action that pastes `${{ }}` into `run:`. Data reaches the core through env vars and typed arguments | `core/src/exec.ts` (the only module allowed to spawn, lint rule enforces it) | `exec.test.ts` with hostile branch names; ESLint `no-restricted-imports` for `child_process` outside `exec.ts` |
| T-11 | Path traversal or symlink escape via `source_path` / `artifact_path` (`../../etc`, a symlink to `/`) | `fs.realpath` both the workspace and the input, then require the resolved path to start with `workspace + sep`; reject anything else before any read | `core/src/fs/paths.ts` | `paths.test.ts`: `..`, absolute paths, symlink out of workspace, UNC and `file://` forms |
| T-12 | Markdown/HTML injection in PR/MR comments and job summaries from finding titles, file paths or API strings (`[click](https://evil)`, `<img onerror>`, `@everyone`, `<!-- -->`) | Every API-provided string goes through one escaping function before rendering; links are only built from an allow-listed dashboard origin; no raw HTML; `@` mentions neutralised with a zero-width joiner | `core/src/render/escape.ts`, `core/src/render/summary.ts` | `escape.test.ts` with an injection corpus; snapshot tests for the comment |
| T-13 | SARIF injection: a crafted finding puts JavaScript or external URIs into SARIF that GitHub renders | SARIF built from typed objects, never string templates; `helpUri` only from the dashboard origin; `message.text` plain text, `markdown` omitted | `core/src/convert/sarif.ts` | `sarif.test.ts` + fuzz |
| T-14 | A tampered `dist/` bundle committed to the action repo | CI rebuilds and `git diff --exit-code dist/`; branch protection requires it; releases built only in CI | `.github/workflows/ci.yml` | the check itself |
| T-15 | Green Agent pushes into the source branch or auto-merges | Fix branch name is `nandee/fix-<scan_id>-<short hash>`, created from the scanned commit; the integration never calls merge; never runs on fork PRs | `core/src/fix/pr.ts` | `pr.test.ts` asserts the target branch is never the head ref |
| T-16 | An attacker edits `.github/workflows` or `.gitlab-ci.yml` in a PR to change `fail_on_severity` to `none` | Out of our control in general; documented: require the workflow file in CODEOWNERS and use the GitLab "pipeline must succeed" plus protected CI config. The job summary always prints the effective gate so reviewers see it | README "Protecting the gate" | n/a |

### Repudiation

| ID | Threat | Mitigation | Where | Test |
|---|---|---|---|---|
| T-20 | Nobody can tell which commit a scan covered or who requested a fix | Every scan request carries `repo`, `branch`, `commit_sha`, `pr_number` and the CI run URL (Q4); outputs include `scan_id` and `report_url`; Nandee's audit log already records scan started/completed, fix requested, PR opened | `core/src/api/client.ts` | `client.test.ts` asserts git metadata is sent |

### Information disclosure

| ID | Threat | Mitigation | Where | Test |
|---|---|---|---|---|
| T-30 | The API key is printed in logs, error messages, debug output or crash dumps | Key is read once from env, wrapped in a `Secret` type whose `toString()` returns `[redacted]`; `::add-mask::` on GitHub at startup; every log line passes through a scrubber that replaces the key value and anything matching `ci_[A-Za-z0-9_-]{16,}`; errors from the HTTP layer never include request headers | `core/src/secret.ts`, `core/src/log.ts` | `secret.test.ts`, `log.test.ts` (debug mode on, key in an exception message, key in a URL) |
| T-31 | The key ends up on disk or in an artifact (dotenv outputs, SARIF, cached files) | Outputs are an allow-list of non-secret values; nothing writes env to disk; temp dir created with `0700` and removed in `finally` | `core/src/outputs.ts`, `core/src/fs/tmp.ts` | `outputs.test.ts`, `tmp.test.ts` |
| T-32 | More data leaves the environment than the scan needs (healthcare customers under a BAA) | Upload is driven by `scan_types`: `sast` and `sca` send only the repo URL and ref (Nandee clones with its own GitHub App; see Q1 for the no-App case); `dast` uploads exactly one artifact file; nothing else is read. README has a "What leaves your environment" table | `core/src/upload/plan.ts` | `plan.test.ts` asserts the file set per scan type |
| T-33 | Findings leak to people without repo access via comments on public PRs | Comments on public repos are summarised (counts and a dashboard link); full titles only when the repo is private, unless `comment_detail: full` is set | `core/src/render/summary.ts` | `summary.test.ts` |
| T-34 | Telemetry or crash reporting phones home | None exists. The only outbound hosts are the configured Nandee host, its blob storage host (returned by the API, must be `*.blob.core.windows.net`, Q5), and the CI platform's own API | `core/src/http/client.ts` host allow-list | `client.test.ts` |
| T-35 | Git credentials or signing material on the runner are read by this code | The code opens only: build files for platform detection (fixed list), `artifact_path`, and its own temp dir. No globbing of the workspace | `core/src/platform/detect.ts` | `detect.test.ts` |

### Denial of service

| ID | Threat | Mitigation | Where | Test |
|---|---|---|---|---|
| T-40 | A Nandee outage or slow scan blocks every pipeline | `fail_mode: closed` (default) fails the job on outage or timeout, because a security gate that silently passes is worse; `fail_mode: open` passes with a warning and a visible output `passed=unknown`. Both are explicit in the job summary | `core/src/gate.ts` | `gate.test.ts` |
| T-41 | Polling hammers the API or hangs forever | Exponential backoff with jitter (2 s → 30 s cap), hard `timeout_minutes`, every request has a connect and a total timeout, `Retry-After` honoured on 429 | `core/src/api/poll.ts` | `poll.test.ts` with fake timers |
| T-42 | A huge or malformed API response exhausts memory | Response size cap (default 50 MB), streaming JSON not needed at that cap; schema validation rejects unexpected shapes | `core/src/http/client.ts` | `client.test.ts` |
| T-43 | Fuzzed finding data crashes the converters | Converters are fuzzed with `fast-check` (dev dependency only) | `core/test/fuzz/*.test.ts` | the fuzz tests |

### Elevation of privilege

| ID | Threat | Mitigation | Where | Test |
|---|---|---|---|---|
| T-50 | The CI token has more scopes than needed and this code (or a dependency) abuses them | Every example uses an explicit least-privilege `permissions:` block; the README lists the exact scopes per feature (`security-events: write` for SARIF, `pull-requests: write` for comments, `contents: write` only for fix PRs). GitLab: `CI_JOB_TOKEN` for reports, a project access token with `api` scope only when commenting or opening MRs, documented | `action.yml`, README, `templates/` | workflow lint in CI checks examples for `permissions:` |
| T-51 | A dependency gains code execution in every customer pipeline | Runtime dependencies kept to the minimum (target: zero beyond `@actions/*` for the action); lockfile committed; `npm ci`; Dependabot; CodeQL, `npm audit`, Scorecard and image scanning in CI, failing on high and critical | `package.json`, `.github/workflows/security.yml` | the CI jobs |
| T-52 | The container image runs as root or carries a shell and build tools | Multi-stage build; default target `gcr.io/distroless/nodejs24-debian12:nonroot` pinned by digest, `USER nonroot`, no shell or package manager; the `with-git` target (merge-request mode) is debian-slim + git, also non-root | `gitlab/Dockerfile` | `scripts/smoke-image.sh` in CI (uid 65532, exit paths, key never logged) + Trivy |
| T-53 | `pull_request_target` examples let fork code run with secrets | Never used in any example; a CI lint fails the build if the string appears in `examples/` or `README` outside the "don't do this" warning | `.github/workflows/ci.yml` | the lint |
| T-54 | The fix PR step uses a token that can push to protected branches | Fix PRs use the narrowest token the platform offers (GitHub: `GITHUB_TOKEN` with `contents: write` + `pull-requests: write`, which cannot bypass branch protection; GitLab: project access token, `Developer` role). The branch is always new | `core/src/fix/pr.ts`, docs | `pr.test.ts` |

## 5. Assumptions that the threat model depends on

1. The customer's CI secret store masks secrets in logs. We still mask and scrub ourselves (T-30) because masking is best-effort on both platforms.
2. Nandee's API is the system of record for findings; this code never decides a finding is a false positive on its own. `ai_triage: true` only filters by the verdicts Nandee returns.
3. Nandee scans a repo by cloning it server-side through its GitHub App integration. If a customer's repo is not reachable that way, the integration must upload source itself, which widens A1's exposure. This is open question Q1 and changes T-32.
4. The runner has outbound HTTPS to the Nandee host and, for binary uploads, to Azure blob storage. Customers with egress allow-lists need both hosts in the docs.

## 6. Out of scope

- Security of the Nandee platform, scanners and AI agents.
- Attacks that require control of the customer's CI platform account.
- The correctness of findings. A missed vulnerability is a scanner concern, not an integration concern, as long as findings returned are gated correctly.
