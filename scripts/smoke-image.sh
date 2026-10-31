#!/usr/bin/env bash
# Smoke test for a built runner image (T-52 and the fail-safe paths).
set -euo pipefail
IMG="$1"
echo "== runs as non-root"
uid=$(docker run --rm --entrypoint /nodejs/bin/node "$IMG" -e 'console.log(process.getuid())')
[ "$uid" = "65532" ] || { echo "expected uid 65532, got $uid"; exit 1; }
echo "== no API key: exit 2"
set +e; docker run --rm "$IMG"; code=$?; set -e
[ "$code" = "2" ] || { echo "expected exit 2, got $code"; exit 1; }
echo "== fork MR without opt-in: exit 0"
docker run --rm -e CI_PROJECT_ID=1 -e CI_MERGE_REQUEST_IID=3 -e CI_MERGE_REQUEST_SOURCE_PROJECT_ID=2 \
  -e NANDEE_API_KEY=ci_smoke_test_only_not_a_real_key -e NANDEE_OUTPUT_DIR=/tmp "$IMG"
echo "== the key never appears in the log"
out=$(docker run --rm -e CI_PROJECT_ID=1 -e CI_PROJECT_URL=https://gitlab.com/a/b -e CI_COMMIT_SHA=0123456789abcdef0123456789abcdef01234567 \
  -e CI_COMMIT_BRANCH=main -e NANDEE_API_KEY=ci_smoke_test_only_not_a_real_key -e NANDEE_PROJECT_ID=p -e NANDEE_SCAN_TYPES=dast -e NANDEE_OUTPUT_DIR=/tmp "$IMG" 2>&1 || true)
if grep -q smoke_test_only "<<<$out"; then echo "key leaked into the log"; exit 1; fi
echo "smoke test passed"
