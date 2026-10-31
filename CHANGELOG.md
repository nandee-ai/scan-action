# Changelog

All notable changes to the GitHub Action, the GitLab CI/CD component and the
`nandee` CLI. The three ship together under one version
([semver](https://semver.org)). The floating `v1` tag and the `:1` image tag
always point at the latest 1.x release.

## 1.0.0 — unreleased

First release.

- GitHub Action `nandee-ai/scan-action` (Marketplace: Nandee-AI Mobile
  Application Security Scan): SAST, SCA and DAST for Android, iOS, React
  Native and Flutter; SARIF to code scanning; sticky PR comment; job summary;
  outputs; Green Agent patches as a comment or a draft pull request.
- GitLab CI/CD component `gitlab.com/nandee-ai/scan/scan` and a legacy
  `include:remote` template: SAST and Dependency Scanning reports, dotenv
  outputs, merge request note, Green Agent patches as a note or a draft merge
  request. Images `ghcr.io/nandee-ai/scan` (distroless) and `:1-git`.
- `nandee` CLI (`@nandee-ai/cli`) for Jenkins, Bitrise, CircleCI, Azure
  DevOps and anything else, with SARIF, GitLab, Markdown, dotenv and JSON
  output.
- Security model documented in THREAT_MODEL.md (T-01 to T-54) with the tests
  that cover each threat.
