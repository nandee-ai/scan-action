# ghcr.io/nandee-ai/scan: the GitLab CI/CD component runner.
#
# Build from the repository root:  docker build -f gitlab/Dockerfile .
#
# Stage 1 installs from the lockfile and bundles gitlab/src/main.ts into one
# file.  The default final stage is distroless (no shell, no package
# manager, non-root): the Node runtime and the bundle, nothing else.
# A second target, `with-git`, adds git on the same slim base for Green
# Agent merge-request mode, which clones and pushes a fix branch; it is
# published as ghcr.io/nandee-ai/scan:1-git.  Base images are pinned by
# digest (T-14); Dependabot keeps them current.

FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY core/package.json core/
COPY cli/package.json cli/
COPY github-action/package.json github-action/
COPY gitlab/package.json gitlab/
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY tsconfig.base.json ./
COPY core core
COPY gitlab gitlab
COPY scripts/bundle-gitlab.mjs scripts/
RUN node scripts/bundle-gitlab.mjs \
 && rm -rf /src/gitlab/dist/*.d.ts

# ---- ghcr.io/nandee-ai/scan:1-git: same runner plus git, non-root ------------
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS with-git
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /nodejs/bin && ln -s /usr/local/bin/node /nodejs/bin/node \
 # the runner needs node and git only: drop npm, npx, corepack and yarn (and their vulnerable bundled deps)
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* \
 && groupadd -r nonroot && useradd -r -g nonroot -u 65532 -m nonroot
LABEL org.opencontainers.image.source="https://github.com/nandee-ai/scan-action" \
      org.opencontainers.image.description="Nandee-AI Mobile Application Security Scan runner for GitLab CI/CD (with git, for Green Agent merge requests)" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="Nandee-AI"
COPY --from=build --chown=nonroot:nonroot /src/gitlab/dist /app
ENV NODE_OPTIONS="--disable-proto=delete" NANDEE_OUTPUT_DIR="."
USER nonroot
WORKDIR /builds
ENTRYPOINT ["/nodejs/bin/node", "/app/index.js"]

# ---- ghcr.io/nandee-ai/scan:1 (default): distroless ---------------------------
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:a6c34457f6da4295807e051411c7783739c65b997a324fed14e4fa292615ae91 AS distroless
LABEL org.opencontainers.image.source="https://github.com/nandee-ai/scan-action" \
      org.opencontainers.image.description="Nandee-AI Mobile Application Security Scan runner for GitLab CI/CD" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="Nandee-AI"
COPY --from=build --chown=nonroot:nonroot /src/gitlab/dist /app
ENV NODE_OPTIONS="--disable-proto=delete" NANDEE_OUTPUT_DIR="."
USER nonroot
WORKDIR /builds
ENTRYPOINT ["/nodejs/bin/node", "/app/index.js"]
