# Architecture: repo structure and shared core interfaces

Status: proposal for review. Nothing here is built yet.

## 1. Repository layout

One monorepo, npm workspaces, Node 20, TypeScript strict. The GitHub Marketplace needs `action.yml` at the root of a public repo, so the monorepo *is* the action repo: `github.com/nandee-ai/scan-action`, listed as **"Nandee-AI Mobile Application Security Scan"**. The GitLab component and the CLI live in subfolders and publish from the same release.

## Names (decided 2026-10-31)

| Thing | Name | What customers write |
|---|---|---|
| GitHub org | `nandee-ai` | |
| Action repo (this monorepo) | `nandee-ai/scan-action` | `uses: nandee-ai/scan-action@v1` |
| Marketplace listing | Nandee-AI Mobile Application Security Scan | |
| GitLab group / project | `nandee-ai/scan` | `include: component: gitlab.com/nandee-ai/scan/scan@1.0.0` |
| npm | `@nandee-ai/cli`, binary `nandee`; unscoped `nandee` reserved as a pointer | `npx @nandee-ai/cli scan …` |
| Container image | `ghcr.io/nandee-ai/scan` | pinned by digest in the GitLab template |

Where `nandee` (without `-ai`) is free it is claimed and left empty or pointing at the `nandee-ai` name, so nobody else can publish under it: the GitLab group `nandee`, the npm package `nandee`, and the `ghcr.io/nandee` namespace if GitHub allows it. The GitHub user `nandee` is taken (2014) and can't be reserved.

```
scan-action/   (local folder: nandee-ci-integrations)
├── action.yml                  # GitHub Action manifest (root: Marketplace requirement)
├── dist/index.js               # ncc bundle of github-action, committed, verified by CI
├── package.json                # workspaces: core, cli, github-action
├── package-lock.json
├── tsconfig.base.json
├── THREAT_MODEL.md
├── SECURITY.md
├── CHANGELOG.md
├── README.md                   # overview + links to the two integration READMEs
│
├── core/                       # @nandee-ai/ci-core (not published separately at first)
│   ├── src/
│   │   ├── index.ts            # public surface: runScan()
│   │   ├── inputs.ts           # ScanInputs schema (zod) + parse from env/args
│   │   ├── secret.ts           # Secret<T> wrapper (T-30)
│   │   ├── log.ts              # Logger with scrubber (T-30)
│   │   ├── exec.ts             # the ONLY module allowed to spawn processes (T-10)
│   │   ├── http/client.ts      # fetch wrapper: TLS, host allow-list, redirects, timeouts, size cap
│   │   ├── api/
│   │   │   ├── types.ts        # NandeeApi interface (below)
│   │   │   ├── schemas.ts      # zod schemas for every response (T-02)
│   │   │   ├── client.ts       # real implementation over http/client
│   │   │   ├── mock.ts         # in-memory implementation + fixture loader
│   │   │   └── poll.ts         # backoff + jitter + timeout (T-41)
│   │   ├── platform/detect.ts  # android | ios | react-native | flutter from build files
│   │   ├── fs/paths.ts         # workspace containment (T-11)
│   │   ├── fs/tmp.ts           # 0700 temp dir, removed in finally (T-31)
│   │   ├── upload/plan.ts      # what to send per scan type (T-32)
│   │   ├── convert/
│   │   │   ├── normalize.ts    # Nandee JSON → Finding[] (one shape for both scan kinds)
│   │   │   ├── sarif.ts        # Finding[] → SARIF 2.1.0 (T-13)
│   │   │   ├── gitlab-sast.ts  # Finding[] → gl-sast-report.json (schema 15.x)
│   │   │   └── gitlab-deps.ts  # Finding[] → gl-dependency-scanning-report.json
│   │   ├── baseline.ts         # new-vs-existing diff against the target branch scan
│   │   ├── gate.ts             # severity gating + fail_mode (T-40)
│   │   ├── render/
│   │   │   ├── escape.ts       # one escaping function for all Markdown output (T-12)
│   │   │   └── summary.ts      # comment / MR note / job summary (same table everywhere)
│   │   ├── fix/
│   │   │   ├── request.ts      # ask Green Agent for patches
│   │   │   └── pr.ts           # new branch + PR/MR, never the source branch (T-15, T-54)
│   │   └── outputs.ts          # allow-listed outputs (T-31)
│   └── test/
│       ├── unit/…              # vitest, one file per module, security tests named by T-id
│       ├── fuzz/…              # fast-check on converters and parsers (T-43)
│       ├── fixtures/           # sample Nandee responses per platform
│       └── mock-server/        # tiny HTTP server over api/mock.ts for integration tests
│
├── cli/                        # `nandee` binary for Jenkins, Bitrise, CircleCI, Azure DevOps
│   ├── src/main.ts             # arg parsing → ScanInputs → runScan(); exit codes
│   └── package.json            # bin: nandee
│
├── github-action/
│   ├── src/main.ts             # reads action inputs, fork detection, GitHub reporters
│   ├── src/fork.ts             # T-03
│   ├── src/reporters/
│   │   ├── sarif-upload.ts     # code-scanning upload via @actions/github
│   │   ├── pr-comment.ts       # sticky comment, found by a hidden marker
│   │   └── step-summary.ts
│   └── src/fix-pr.ts
│
├── gitlab/
│   ├── templates/
│   │   ├── scan.yml            # CI/CD Component with spec:inputs
│   │   └── legacy/Nandee.gitlab-ci.yml   # include:remote template, GitLab < 16
│   ├── Dockerfile              # two targets, both non-root, bases pinned by digest (T-52):
│   │                           #   distroless (default, ghcr.io/nandee-ai/scan:1) and
│   │                           #   with-git   (ghcr.io/nandee-ai/scan:1-git, Green Agent merge-request mode)
│   ├── src/main.ts             # reads NANDEE_* + CI_* vars, writes reports + dotenv, MR note, fix MR
│   ├── src/ci-env.ts           # CI_* → GitContext (fork + visibility detection)
│   ├── src/reporters/gitlab.ts # MR note (sticky), fix MR via REST, token via git env config
│   └── README.md
│
├── examples/
│   ├── github/{android,ios,react-native,flutter,nightly-dast,release-gate,green-agent}.yml
│   └── gitlab/{…same set…}.gitlab-ci.yml
│
└── .github/
    ├── workflows/
    │   ├── ci.yml              # lint, test, build, dist check, example lint (T-14, T-53)
    │   ├── security.yml        # CodeQL, npm audit, secret scanning, Scorecard, Trivy
    │   └── release.yml         # tags from CI only: SBOM, cosign, SLSA provenance, v1 tag
    ├── dependabot.yml
    └── CODEOWNERS
```

Publishing:
- **GitHub Action**: tag `vX.Y.Z` plus a moving `v1`. The release workflow is the only thing allowed to move `v1` (protected tag, environment with required reviewer).
- **GitLab Component**: mirrored to the GitLab project `nandee-ai/scan` by the release workflow, tagged the same version, so it appears in the CI/CD Catalog as `gitlab.com/nandee-ai/scan/scan@X.Y.Z`. The template runs `ghcr.io/nandee-ai/scan:X.Y.Z@sha256:…`.
- **CLI**: npm package `@nandee-ai/cli` (binary `nandee`) plus single-file binaries attached to the GitHub release, all signed. The unscoped `nandee` package is published as a one-line pointer to `@nandee-ai/cli` so the name can't be squatted.

## 2. Shared core interfaces

These are the contracts the three front ends program against. Types are TypeScript; runtime validation is zod (one dev-time dependency that is also the one runtime dependency we accept in core, justified in the README).

### 2.1 Inputs

```ts
export type ScanType = "sast" | "dast" | "sca";
export type Platform = "auto" | "android" | "ios" | "react-native" | "flutter";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FailOn = Severity | "none";
export type FailMode = "closed" | "open";
export type GreenAgentMode = "off" | "comment" | "pull-request";

export interface ScanInputs {
  apiKey: Secret<string> | null;      // null only when OIDC is used (future)
  apiUrl: URL;                        // https only; default https://app.nandee.ai
  projectId: string;                  // see Q2: today this maps to project_title
  scanTypes: ScanType[];              // default ["sast","sca"]
  sourcePath: string;                 // canonical, inside workspace
  artifactPath: string | null;        // canonical, inside workspace; required for dast
  platform: Platform;
  failOnSeverity: FailOn;             // default "high"
  failMode: FailMode;                 // default "closed"
  aiTriage: boolean;                  // default true
  waitForCompletion: boolean;         // default true
  timeoutMinutes: number;             // 1..180, default 30
  greenAgent: GreenAgentMode;         // default "off"
  baselineMode: boolean;              // default: true on PR/MR, false otherwise
  git: GitContext;
}

export interface GitContext {
  repoUrl: string;                    // https clone URL, validated
  branch: string;                     // data only, never shelled
  commitSha: string;                  // /^[0-9a-f]{40}$/
  prNumber: number | null;
  baseBranch: string | null;          // for baseline
  isFork: boolean;
  runUrl: string | null;              // link back to the CI job (T-20)
}

export function parseInputs(raw: Record<string, string | undefined>, env: NodeJS.ProcessEnv): ScanInputs;
// throws InputError with a message safe to print (never echoes secret values)
```

### 2.2 Secrets and logging

```ts
export class Secret<T> {
  constructor(value: T);
  expose(): T;                        // the only way to read it
  toString(): "[redacted]";
  toJSON(): "[redacted]";
}

export interface Logger {
  debug(msg: string): void; info(msg: string): void; warn(msg: string): void; error(msg: string): void;
  group<T>(name: string, fn: () => Promise<T>): Promise<T>;
}
export function createLogger(sink: LogSink, scrub: Scrubber): Logger;
export function createScrubber(secrets: Secret<string>[]): Scrubber;   // also matches /ci_[A-Za-z0-9_-]{16,}/
```

### 2.3 HTTP

```ts
export interface HttpOptions {
  allowedHosts: string[];             // Nandee host + blob host pattern; nothing else
  connectTimeoutMs: number;           // default 10_000
  totalTimeoutMs: number;             // default 60_000 (uploads: 15 min)
  maxResponseBytes: number;           // default 50 MB
}
export interface HttpClient {
  json<T>(req: JsonRequest, schema: ZodType<T>): Promise<T>;
  putBytes(url: URL, body: ReadableStream | Buffer, headers: Record<string,string>): Promise<void>;
}
// Behaviour fixed by tests: TLS verification cannot be disabled; redirect: "manual",
// same-host redirects followed at most 3 times, any other host → NandeeRedirectError.
```

### 2.4 Nandee API

The interface is written to the brief's shape; `client.ts` maps it onto the real endpoints (section 3). `mock.ts` implements the same interface from fixtures. Nothing above this interface knows which one it talks to.

```ts
export interface NandeeApi {
  // Binary artifacts (needed for dast; also the only path for a binary-only scan)
  createUpload(file: { name: string; sizeBytes: number }): Promise<{ uploadId: string; uploadUrl: URL; expiresAt: Date }>;
  finalizeUpload(uploadId: string, meta: { projectTitle: string }): Promise<{ scanId: string }>;

  // Source scans (sast, sca)
  startSourceScan(req: {
    repoUrl: string; branch: string; commitSha: string; target: "mobile" | "web";
    scanners?: string[]; projectTitle: string; git: GitContext;
  }): Promise<{ scanId: string }>;

  getScan(scanId: string): Promise<ScanStatus>;        // { scanId, state: "queued"|"running"|"completed"|"rejected", reason?, reportUrl }
  getFindings(scanId: string): Promise<RawFinding[]>;  // validated, raw Nandee shape

  // Green Agent
  requestFix(scanId: string, findingId: string): Promise<{ jobId: string }>;
  getFix(scanId: string, findingId: string): Promise<{ state: "pending"|"ready"|"failed"; diff?: string; explanation?: string }>;

  // Baseline: latest completed scan of the same repo on another branch (Q6)
  findBaselineScan(repoUrl: string, branch: string): Promise<string | null>;
}

export function createNandeeApi(http: HttpClient, auth: Secret<string>, baseUrl: URL): NandeeApi;
export function createMockNandeeApi(fixtures: FixtureSet): NandeeApi;
```

### 2.5 Normalised findings

```ts
export interface Finding {
  id: string;                         // Nandee finding id
  fingerprint: string;                // stable across scans: sha256(rule, path, normalised snippet) — used by baseline
  ruleId: string;                     // cwe or owasp id, falls back to a slug of the title
  title: string;                      // untrusted text: escaped at render time, never here
  detail: string;
  severity: Severity;
  location: { path: string; line: number | null } | null;
  snippet: string | null;
  cwe: string | null; owasp: string | null; masvs: string[];
  triage: { verdict: "exploitable" | "false_positive" | "unknown"; } ;   // from Nandee's validator verdict (Q7)
  status: string;                     // Nandee workflow status; "Resolved"/"Closed" excluded from gating
  fix: { diff: string; explanation: string } | null;
}
export function normalize(scanKind: "binary" | "source", raw: RawFinding[]): Finding[];
```

### 2.6 Converters, baseline, gate, render

```ts
export function toSarif(findings: Finding[], meta: { toolVersion: string; dashboardOrigin: string }): SarifLog;        // 2.1.0
export function toGitLabSast(findings: Finding[], meta: GitLabMeta): GitLabSastReport;                               // schema 15.1.x
export function toGitLabDependencyScanning(findings: Finding[], meta: GitLabMeta): GitLabDsReport;

export function diffAgainstBaseline(current: Finding[], baseline: Finding[]): { newFindings: Finding[]; existing: Finding[] };

export interface GateResult { passed: boolean | "unknown"; reason: string; counted: Finding[]; threshold: FailOn; }
export function evaluateGate(findings: Finding[], inputs: Pick<ScanInputs,"failOnSeverity"|"aiTriage"|"baselineMode">): GateResult;

export function escapeMarkdown(untrusted: string): string;    // the only escape function (T-12)
export function renderSummary(r: ScanResult, opts: { detail: "counts" | "full"; dashboardOrigin: string }): string;  // Markdown, same on both platforms
```

### 2.7 Orchestration and outputs

```ts
export interface ScanResult {
  scanId: string; reportUrl: string; findings: Finding[]; gate: GateResult; platform: Exclude<Platform,"auto">;
  sarif: SarifLog; gitlab: { sast: GitLabSastReport; deps: GitLabDsReport };
  timing: { startedAt: Date; finishedAt: Date };
}
export async function runScan(inputs: ScanInputs, deps: { api: NandeeApi; log: Logger; clock: Clock }): Promise<ScanResult>;

export interface Outputs { scan_id: string; findings_count: number; critical_count: number; high_count: number; report_url: string; passed: "true"|"false"|"unknown"; }
export function toOutputs(r: ScanResult): Outputs;   // allow-list; nothing else can be exported (T-31)
```

### 2.8 Exit codes (CLI and both platforms)

| Code | Meaning |
|---|---|
| 0 | Gate passed (or `fail_mode: open` and Nandee was unreachable: `passed=unknown`, warning printed) |
| 1 | Gate failed: findings at or above `fail_on_severity` |
| 2 | Invalid inputs (bad enum, path outside workspace, `dast` without artifact, `http://` URL) |
| 3 | Authentication failed (401/403 from Nandee) |
| 4 | Timeout waiting for the scan |
| 5 | Nandee API error or unreachable, with `fail_mode: closed` |
| 6 | Quota or plan limit (429 / plan feature disabled, e.g. DAST not on the plan) |
| 7 | Scan rejected by Nandee (unsupported file, validation failure), with the reason |

## 3. Mapping the brief's API onto the real Nandee API

The brief lists endpoints as placeholders. The real backend (`backend/app/api/` in the `nandee` repo) differs, so `api/client.ts` adapts; the interface above stays as written.

| Brief | Real endpoint today | Note |
|---|---|---|
| base `https://api.nandee.ai/v1` | `https://app.nandee.ai/api/v2` | default `api_url` will be the real one |
| `Authorization: Bearer <key>` | same; CI tokens start with `ci_`, stored hashed, created at Admin → Settings → CI Tokens (`/ci-tokens`) | token resolves to its creator's role and tenant |
| `POST /scans/uploads` (multipart) | `POST /scans/upload-init` → `PUT <SAS url>` → `POST /scans/upload-finalize` | finalize starts the scan; multipart `/scans/upload` returns 410 |
| `POST /scans` with `scan_types`, `git` | `POST /source-scans/github` `{url, branch, target, scanners?, project_title}` for source; binary scans start at finalize | no `commit_sha`, `pr_number`, `project_id` fields: Q2, Q3 |
| `GET /scans/{id}` | `GET /source-scans/{id}` / `GET /scans/{id}`; status strings `Inprogress`, `Completed`, `Rejected` | normalised to `queued/running/completed/rejected` |
| `GET …/findings?format=sarif\|json\|gitlab-sast` | `GET /source-scans/{id}/findings`, `GET /scans/{id}/vulnerabilities` (JSON only) | SARIF and GitLab formats are produced client-side by `convert/` |
| `POST /findings/{id}/remediate` | `POST /source-scans/{id}/findings/{fid}/generate-fix` then `GET …/fix-status`; `…/create-pr` opens a PR through Nandee's GitHub App | mobile source scans use a batch preview instead (Q8) |
| OIDC token exchange | does not exist | marked future work; proposed shape in open questions Q9 |
