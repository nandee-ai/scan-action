# Security

## Reporting a vulnerability

Email **security@nandee.ai**. Please include the version (action tag, image
digest or CLI version), a description, and reproduction steps if you have
them. We acknowledge reports within 2 business days and aim to ship a fix
for confirmed high or critical issues within 14 days. Please do not open a
public issue for a security problem.

GitHub's private vulnerability reporting is enabled on this repository as an
alternative to email.

## Supported versions

Only the latest 1.x release receives fixes. The floating `v1` tag and the
`ghcr.io/nandee-ai/scan:1` image tag always point at it.

## What this software does with your secrets

- The Nandee CI token is read from a secret (`api_key` input, `NANDEE_API_KEY`
  variable) and sent only to the Nandee API host as a bearer token. It is
  masked in logs, scrubbed from every error message, and never written to
  disk.
- `github_token` / `NANDEE_GITLAB_TOKEN` are used only for the platform
  features you enable (SARIF upload, comments, fix PRs/MRs) and are passed to
  git through environment config, never on a command line.
- The runner contacts only the Nandee API host, Nandee's blob storage
  (`*.blob.core.windows.net`) and, for the platform features, the GitHub or
  GitLab API of the running job. Any other host is refused by the HTTP
  client.
- Nothing is uploaded for SAST/SCA (Nandee clones through its GitHub App);
  for DAST only the artifact you name is uploaded.
- There is no telemetry.

The full model is in [THREAT_MODEL.md](THREAT_MODEL.md).

## Verifying what you run

- **Action**: pin by commit SHA. `dist/index.js` is rebuilt in CI on every
  change and compared with the commit; a release attaches a CycloneDX SBOM and
  a build provenance attestation (`gh attestation verify dist/index.js --owner nandee-ai`).
- **Image**: pin by digest. Every release image is signed with Sigstore
  (`cosign verify ghcr.io/nandee-ai/scan@sha256:… --certificate-identity-regexp '^https://github.com/nandee-ai/scan-action/' --certificate-oidc-issuer https://token.actions.githubusercontent.com`)
  and carries SLSA provenance and an SBOM.
- **CLI**: published to npm with provenance from this repository's release
  workflow (`npm audit signatures`).

## Repository settings we rely on

Branch protection on `main` (required CI, CODEOWNERS review, no force push),
tag protection on `v*`, required 2FA for the organisation, GitHub secret
scanning with push protection, Dependabot alerts and updates, CodeQL and
OpenSSF Scorecard in CI, and `release` environments with a required reviewer
for the GitLab mirror and npm publish steps.
