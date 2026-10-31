# Nandee-AI Mobile Application Security Scan

Scan Android, iOS, React Native and Flutter apps with [Nandee](https://www.nandee.ai)
from CI: SAST and SCA from source, DAST on the built APK/AAB/IPA, AI triage,
and Green Agent patches. One shared core, three front ends:

| | Use it as | Docs |
|---|---|---|
| GitHub Action | `uses: nandee-ai/scan-action@v1` | [github-action/README.md](github-action/README.md) |
| GitLab CI/CD component | `include: component: gitlab.com/nandee-ai/scan/scan@1.0.0` | [gitlab/README.md](gitlab/README.md) |
| CLI (Jenkins, Bitrise, CircleCI, Azure DevOps, …) | `npx @nandee-ai/cli scan` | [cli/README.md](cli/README.md) |

## Quick start (GitHub)

```yaml
permissions:
  contents: read
  security-events: write
  pull-requests: write
steps:
  - uses: actions/checkout@v7
  - uses: nandee-ai/scan-action@v1
    with:
      api_key: ${{ secrets.NANDEE_API_KEY }}
      project_id: acme/android-app
```

Create the CI token in Nandee Admin → Settings → CI Tokens and store it as the
`NANDEE_API_KEY` secret. More in [examples/](examples/).

## Security model, in short

- The API key comes from a secret, is masked, scrubbed from every message and
  never written to disk. There is no flag for it in the CLI.
- No user input is ever interpolated into a shell. Paths are canonicalised and
  must stay inside the workspace; artifact uploads are the one file you name.
- The HTTP client talks to the Nandee host, Nandee's blob storage and the
  job's own GitHub/GitLab API, nothing else; TLS 1.2+, redirects off-host are
  refused, responses are schema-validated and size-capped.
- Pull/merge requests from forks are skipped by default. Green Agent never
  pushes to the source branch, never runs for forks, never auto-merges, and
  opens drafts only.
- Every finding text that reaches a comment, summary, SARIF or GitLab report is
  escaped; links point only at the Nandee dashboard.
- Timeouts everywhere; `fail_mode` decides whether an outage fails the job.
- No telemetry.

The full threat model, with the test covering each threat, is
[THREAT_MODEL.md](THREAT_MODEL.md). Report vulnerabilities to
security@nandee.ai ([SECURITY.md](SECURITY.md)).

## Inputs (all three front ends)

| Input | Default | Meaning |
|---|---|---|
| `api_key` | required | Nandee CI token, from a secret only |
| `project_id` | required | Project name shown in Nandee |
| `api_url` | `https://app.nandee.ai` | Nandee API base (https only) |
| `scan_types` | `sast,sca` (GitLab: `dast`) | Any of `sast`, `sca`, `dast`; `dast` needs `artifact_path` |
| `source_path` | `.` | Directory to detect the platform from |
| `artifact_path` | | Built APK, AAB or IPA, inside the workspace |
| `platform` | `auto` | `android`, `ios`, `react-native`, `flutter` |
| `fail_on_severity` | `high` | `critical`, `high`, `medium`, `low`, `none` |
| `fail_mode` | `closed` | `open`: a Nandee outage passes the job with `passed=unknown` |
| `ai_triage` | `true` | Ignore findings Nandee's triage marked as false positives |
| `wait_for_completion` | `true` | `false` starts the scan and returns |
| `timeout_minutes` | `30` | 1–180 |
| `green_agent` | `off` | `comment`, `pull-request` (GitLab: `merge-request`) |
| `baseline_mode` | PR: `true` | Only findings new relative to the base branch fail the gate |
| `comment_detail` | `auto` | `counts` on public repos, `full` otherwise |
| `extra_allowed_hosts` | | Extra hosts, e.g. self-hosted blob storage |

Outputs: `scan_id`, `findings_count`, `critical_count`, `high_count`,
`medium_count`, `low_count`, `report_url`, `passed` (`true`/`false`/`unknown`),
`platform`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Passed (or `fail_mode: open` and the scan did not complete) |
| 1 | Gate failed: findings at or above `fail_on_severity` |
| 2 | Invalid input |
| 3 | Authentication failed (bad or revoked token) |
| 4 | Timed out waiting for the scan |
| 5 | Nandee API error |
| 6 | Quota or plan limit |
| 7 | Nandee rejected the scan (unsupported artifact, …) |

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Repository layout

`core/` (shared TypeScript core; zod is the only runtime dependency),
`cli/`, `github-action/` with the committed `dist/` bundle, `gitlab/`
(templates, runner, Dockerfile), `examples/`, `docs/`, `npm/nandee` (pointer
package). Development:

    npm ci && npm run lint && npm run typecheck && npm test && npm run check-dist

## Releasing

Push a `vX.Y.Z` tag matching the version in the packages and CHANGELOG. The
release workflow builds and signs the images, attests `dist/`, creates the
GitHub release, moves `v1`, publishes the GitLab catalog project and the npm
packages. Nothing is built on a laptop.

Apache-2.0.
