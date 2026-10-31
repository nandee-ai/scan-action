# Security review checklist

Filled in for 1.0.0 on 2026-10-31. Each line names where the control lives
and the test or CI job that proves it. "Owner" items need a human with
repository or organisation admin rights.

## Secrets

- [x] API key read only from a secret / masked variable; no CLI flag — `action.yml` (`api_key`), `gitlab/templates/*` (not an input), `cli/src/main.ts` (`NANDEE_API_KEY` only). `cli.test.ts` "no flag for it".
- [x] `::add-mask::` before any other work — `github-action/src/main.ts` `core.setSecret` first lines.
- [x] Key never logged or written — `Secret` class (toString/inspect/JSON → `[redacted]`), `createScrubber` (raw, URL-encoded, base64 forms, `ci_` pattern) on every log line and error. `secret.test.ts`, `log.test.ts`, `smoke-image.sh` grep.
- [x] Platform tokens passed to git through environment config, never argv — `reporters/github.ts`, `reporters/gitlab.ts`, `scripts/publish-gitlab.mjs`. `action.test.ts`, `gitlab.test.ts`.
- [ ] OIDC token exchange — not possible: Nandee has no exchange endpoint (OPEN_QUESTIONS Q6, proposal recorded).

## Input handling

- [x] Strict schemas with enums and ranges — `core/src/inputs.ts` (zod). `inputs.test.ts`.
- [x] No user input in a shell: `exec()` is `execFile` with an allow-list of one binary (`git`), minimal env, NUL check; ESLint bans `child_process` elsewhere; policy script bans `shell: true` — `core/src/exec.ts`, `eslint.config.mjs`, `scripts/check-policy.mjs`. `exec.test.ts`.
- [x] No `${{ github.event.* }}` or inputs in `run:` — the action has no `run:` steps; examples pass values through `env:`. Event payload narrowed by `fromActionsContext`. `action.test.ts` "malformed pull_request".
- [x] GitLab inputs reach the runner only as variables; `script:` is a constant — `gitlab/templates/scan.yml`, verified by `scripts/check-action-inputs.mjs`.
- [x] Paths canonicalised, escapes and symlink escapes rejected, regular files only — `core/src/fs/paths.ts`. `paths.test.ts`.
- [x] Finding text escaped everywhere it is rendered; links only to the dashboard origin; code fences neutralised — `core/src/render/escape.ts`, `renderFixSection`. `render.test.ts`, fuzz tests in `converters.fuzz.test.ts`.
- [x] API responses validated against schemas; ids pattern-checked before use in paths — `core/src/api/schemas.ts`, `pathId`. `api-client.test.ts`.

## Pull requests from forks

- [x] Skipped by default with `passed=unknown`; opt-in documented with the safe pattern — `github-action/src/main.ts`, `gitlab/src/main.ts`, READMEs. `action.test.ts`, `gitlab.test.ts`.
- [x] `pull_request_target` (DONT-USE) never recommended; CI lint fails on the string outside the one warning — `scripts/check-policy.mjs`.
- [x] Fix PRs/MRs: never to the source branch, never for forks, never auto-merged, draft only, no `.github/` or `.gitlab*` changes — `core/src/fix/pr.ts`, reporters. `fix.test.ts`, "T-15" tests.

## Network

- [x] TLS weakening refused (`NODE_TLS_REJECT_UNAUTHORIZED=0`, min version < 1.2) — `assertTlsNotWeakened`. `http-client.test.ts`.
- [x] Outbound limited to the API host, `*.blob.core.windows.net`, the job's own GitHub/GitLab API host and `extra_allowed_hosts`; redirects off-host refused — `createHttpClient`, `allowedHostsFor`. `http-client.test.ts`.
- [x] Only the named artifact is uploaded; nothing for SAST/SCA — `core/src/upload/plan.ts`, summary "What left this runner". `plan.test.ts`.
- [x] No telemetry — grep: the only hosts are the ones above.
- [x] Timeouts on every request, upload and poll; `fail_mode` honoured — `http/client.ts`, `api/poll.ts`, `run.ts` `handleNotCompleted`. `poll.test.ts`, `run.test.ts`.
- [x] Temp files cleaned up — `fs/tmp.ts` `withTempDir`, `FixBranchPlan.cleanup` in `finally`. `tmp.test.ts`.

## Supply chain

- [x] Runtime dependencies: core `zod` (schema validation; justified), action `@actions/core` + `@actions/github`, CLI and GitLab runner none (bundled). Lockfile committed, `npm ci --ignore-scripts` everywhere, Dependabot weekly for npm, actions and docker — `.github/dependabot.yml`.
- [x] Every action pinned by SHA, base images pinned by digest — `.github/workflows/*`, `gitlab/Dockerfile`, examples.
- [x] `dist/` rebuilt and diffed in CI — `npm run check-dist` in `ci.yml` (T-14).
- [x] Distroless non-root image, no shell; `with-git` variant also non-root — `gitlab/Dockerfile`; `scripts/smoke-image.sh` + Trivy (HIGH/CRITICAL fail) in `ci.yml`.
- [x] Release: CycloneDX SBOMs, cosign keyless signatures, SLSA provenance for images and `dist/index.js`, npm provenance — `.github/workflows/release.yml`. Release jobs that reach outside GitHub run in environments with a required reviewer.
- [x] CodeQL (JS/TS + Actions, security-and-quality), `npm audit`, dependency review, OpenSSF Scorecard — `.github/workflows/security.yml`. Local CodeQL on 1.0.0: 0 results.
- [ ] **Owner**: branch protection on `main` (CI + CODEOWNERS review required, no force push); tag protection on `v*`; org-wide 2FA; secret scanning + push protection; private vulnerability reporting; environments `gitlab-release` and `npm-release` with reviewers and the `GITLAB_MIRROR_TOKEN` secret; npm trusted publisher for `@nandee-ai/cli` and `nandee`; GitLab project `nandee-ai/scan` created with a project token (`write_repository`) for the mirror; make the repository public before the first release (Marketplace requires it).
- [ ] **Owner**: create the GitHub team `@nandee-ai/security` referenced by CODEOWNERS, or edit CODEOWNERS.
- [ ] **Owner**: confirm security@nandee.ai is monitored (OPEN_QUESTIONS Q14).

## Testing

- [x] Unit tests for every security control above, fuzz tests for the converters and escaping (fast-check), mock-server integration tests, fixtures for Android and iOS, 165 tests — `npm test`.
- [x] Example repositories for Android, iOS, React Native, Flutter, nightly DAST, release gate and Green Agent — `examples/`.
- [ ] End-to-end run against a real tenant with a real CI token (needs the owner's token in a test repository under `nandee-ai`).

## Documentation

- [x] READMEs with quick start, permissions table, fork section, Green Agent rules; THREAT_MODEL.md; SECURITY.md (security@nandee.ai, verification commands); TROUBLESHOOTING.md with exit codes; CHANGELOG.md.
