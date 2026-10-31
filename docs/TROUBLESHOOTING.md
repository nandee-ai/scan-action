# Troubleshooting

Messages start with `Nandee (exit N)`. The number is the exit code.

| Exit | Message starts with | What to do |
|---|---|---|
| 2 | `api_key is required` | The secret is empty in this context. Fork PRs never get secrets; protected GitLab variables need a protected branch. |
| 2 | `scan_types includes dast but artifact_path is not set` | Point `artifact_path` at the APK/AAB/IPA your build step produced. |
| 2 | `artifact_path ... escapes the workspace` / `is not a regular file` | Paths must stay inside the checkout; symlinks that leave it are refused. |
| 2 | `sast/sca scans need the repository to be on github.com` | Nandee clones through its GitHub App. On GitLab use `dast`, or the CLI with `--repo-url` for a github.com mirror. |
| 2 | `api_url must be https` | `http://` is refused except for loopback in tests. |
| 3 | `authentication failed` | Token revoked, expired, or from another tenant. Create a new CI token. |
| 4 | `timed out after N minutes` | Raise `timeout_minutes` (max 180), or set `wait_for_completion: false` and read the report later. |
| 5 | `Nandee API ... returned 5xx` / `response did not match schema` | Nandee-side problem. With `fail_mode: open` the job passes with `passed=unknown`. |
| 5 | `redirect to ... refused` / `host ... is not allowed` | A proxy or self-hosted storage on another host: add it to `extra_allowed_hosts`. |
| 6 | `quota` / `plan limit` | The tenant is over its scan quota. |
| 7 | `scan rejected: ...` | Nandee could not analyse the artifact (not an app binary, unsupported packaging). The reason comes from Nandee. |

## Platform features

- *SARIF upload skipped: the token lacks `security-events: write`* — add the
  scope, or enable code scanning (GitHub Advanced Security on private repos).
- *PR comment skipped* — `pull-requests: write`; fork PRs get a read-only token.
- *Merge request note skipped* — set `NANDEE_GITLAB_TOKEN` (Reporter, `api`).
- *Green Agent: push ... failed* — `contents: write` (GitHub) or
  `write_repository` (GitLab); on GitLab also the `:1-git` image.
- *Could not detect the platform* — set `platform:` explicitly.

## Nothing in the Security tab

Code scanning processes the SARIF asynchronously; allow a minute. Findings are
attached to the PR head commit (`refs/pull/N/head`) and appear on the PR's
Checks → Code scanning results.

## Debugging

GitHub: re-run with debug logging (`ACTIONS_STEP_DEBUG`). GitLab/CLI: set
`NANDEE_DEBUG=true` / `--debug`. Secrets stay scrubbed in debug output.
