# nandee — the Nandee-AI scan CLI

For CI systems without a native integration: Jenkins, Bitrise, CircleCI,
Azure DevOps, or a shell.

    npm install -g @nandee-ai/cli      # or: npx @nandee-ai/cli
    export NANDEE_API_KEY=...          # from your CI secret store; there is no flag for it
    nandee scan --project-id acme/app --scan-types dast --artifact-path app.apk \
      --sarif results.sarif --dotenv nandee.env

Git context (repo URL, branch, commit, PR number) is read from Bitrise,
CircleCI, Azure DevOps or Jenkins variables, falling back to `git`; override
with `--repo-url`, `--branch`, `--commit`, `--pr`, `--base-branch`.

Every scan option is a flag or a `NANDEE_<UPPER_SNAKE>` variable:
`nandee scan --help` lists them. Output files: `--sarif`, `--gitlab-dir`,
`--summary`, `--dotenv`, `--json`, all written with mode 0600.

Exit codes: 0 passed · 1 gate failed · 2 invalid input · 3 auth · 4 timeout ·
5 API error · 6 quota · 7 scan rejected.

`nandee scan --mock ...` runs against built-in sample findings and contacts
nothing, for trying the output formats.

The package is one bundled file with no dependencies, published with npm
provenance from the release workflow of
[nandee-ai/scan-action](https://github.com/nandee-ai/scan-action).
