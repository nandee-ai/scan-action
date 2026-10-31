# Nandee-AI Mobile Application Security Scan — GitHub Action

`uses: nandee-ai/scan-action@v1` (pin by SHA in production).

## Quick start

```yaml
name: Nandee security scan
on:
  push: { branches: [main] }
  pull_request:
permissions:
  contents: read
jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write   # SARIF → Security tab
      pull-requests: write     # the PR comment
    steps:
      - uses: actions/checkout@v7
      - uses: nandee-ai/scan-action@v1
        with:
          api_key: ${{ secrets.NANDEE_API_KEY }}
          project_id: acme/android-app
```

Add `scan_types: sast,sca,dast` and `artifact_path:` to scan a built app too.
Full examples: [../examples/github](../examples/github).

## Permissions

| Feature | Scope |
|---|---|
| Run the scan, outputs, job summary | none beyond `contents: read` |
| SARIF to code scanning | `security-events: write` |
| Sticky PR comment | `pull-requests: write` |
| `green_agent: pull-request` | `contents: write` + `pull-requests: write` |

Missing scopes produce a warning naming the scope; they never change the gate
result. The default `github_token` is the job's `GITHUB_TOKEN`, which cannot
bypass branch protection.

## Forks

On a `pull_request` from a fork GitHub does not expose secrets, and the action
skips the scan with a notice and `passed=unknown` (exit 0). That is the safe
default: fork code never runs with your token. `scan_fork_prs: true` only
matters for workflows that *do* have the secret, such as a maintainer-triggered
`workflow_dispatch` that scans the fork's commit by URL. Nandee clones the
repository server-side, so the fork's code is never executed on your runner.
Never combine `pull_request_target` with a checkout of the PR head (DONT-USE):
it runs the fork's code with your secrets.

## Green Agent

`comment` renders the suggested patches in the PR comment (inner code fences
are neutralised). `pull-request` builds the patches on a fresh
`nandee/fix-<scan>-<sha>` branch from the scanned commit in a scratch clone,
pushes it, and opens a **draft** PR targeting the scanned branch. It never
pushes to the PR branch, never runs for forks, never auto-merges, and refuses
patches that touch `.github/`. Review every change before merging.

## Outputs

`scan_id`, `findings_count`, `critical_count`, `high_count`, `medium_count`,
`low_count`, `report_url`, `passed`, `platform`. Read them with
`${{ steps.<id>.outputs.report_url }}` and pass them to later steps through
`env:`, not inline in `run:`.

## Troubleshooting

See [../docs/TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md). Failure messages
start with `Nandee (exit N)`; N is the exit code table in the root README.
