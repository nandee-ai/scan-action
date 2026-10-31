# Nandee-AI Mobile Application Security Scan — GitLab CI/CD component

```yaml
include:
  - component: gitlab.com/nandee-ai/scan/scan@1.0.0
    inputs:
      project_id: acme/android-app
      artifact_path: app/build/outputs/apk/debug/app-debug.apk
```

Store the Nandee CI token as a **masked, protected** CI/CD variable named
`NANDEE_API_KEY`. It is not a component input on purpose: inputs end up in
the pipeline definition.

GitLab < 16 or no catalog access:

```yaml
include:
  - remote: https://gitlab.com/nandee-ai/scan/-/raw/1.0.0/templates/legacy/Nandee.gitlab-ci.yml
variables:
  NANDEE_PROJECT_ID: acme/android-app
  NANDEE_ARTIFACT_PATH: app/build/outputs/apk/debug/app-debug.apk
```

Examples: [../examples/gitlab](../examples/gitlab).

## What the job produces

- `gl-sast-report.json` and `gl-dependency-scanning-report.json`: GitLab
  security reports (Security tab, MR widget on Ultimate).
- `nandee.env` dotenv report: `NANDEE_SCAN_ID`, `NANDEE_FINDINGS_COUNT`,
  `NANDEE_*_COUNT`, `NANDEE_REPORT_URL`, `NANDEE_PASSED`, `NANDEE_PLATFORM`
  for later jobs that `needs:` this one.
- `nandee-summary.md`, `nandee.sarif` as plain artifacts.
- With `NANDEE_GITLAB_TOKEN` set: one sticky note on the merge request.

## SAST/SCA for GitLab-hosted source

Not yet. Nandee clones source through its GitHub App, so today `sast,sca`
only work for repositories on github.com; on GitLab the component defaults
to `scan_types: dast` on the artifact your build job produced. The CLI with
`--repo-url` covers mirrors on github.com. Source upload for GitLab is on the
Nandee roadmap and will arrive as a new component version with no change to
inputs.

## Tokens and scopes

| Feature | Needs |
|---|---|
| Scan, reports, dotenv | `NANDEE_API_KEY` only |
| Merge request note | `NANDEE_GITLAB_TOKEN`: project access token, **Reporter**, scope `api` |
| `green_agent: merge-request` | `NANDEE_GITLAB_TOKEN`: **Developer**, scopes `api` + `write_repository`, and `image: ghcr.io/nandee-ai/scan:1-git` |

Store the token masked. `CI_JOB_TOKEN` cannot post notes, which is why a
project token is needed for that one feature.

## Forks

Merge requests from forks are skipped with a warning and `NANDEE_PASSED=unknown`
(exit 0) unless `scan_fork_mrs: "true"`. GitLab already withholds protected
variables from fork pipelines; keep `NANDEE_API_KEY` protected. Fix MRs never
run for forks.

## Images

| Tag | Base | Use |
|---|---|---|
| `ghcr.io/nandee-ai/scan:1` | distroless, non-root, no shell | default |
| `ghcr.io/nandee-ai/scan:1-git` | debian-slim + git, non-root | `green_agent: merge-request` |

Pin by digest in production through the `image` input; the catalog release of
each version already pins its own digest. Images are signed with Sigstore and
carry SLSA provenance and a CycloneDX SBOM ([../SECURITY.md](../SECURITY.md)).

## Inputs

Same names and defaults as the action ([../README.md](../README.md#inputs)),
plus `stage`, `job_name`, `image`, `allow_failure`, `output_dir`,
`scan_fork_mrs`. Every input is passed to the runner as a `NANDEE_*`
environment variable; the job's script line is fixed.
