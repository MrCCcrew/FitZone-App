#!/usr/bin/env bash
set -euo pipefail

echo "=== FITZONE RELEASE PREFLIGHT V1 ==="

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BRANCH="$(git branch --show-current)"
COMMIT="$(git rev-parse HEAD)"

if [[ -z "$COMMIT" ]]; then
  echo "PREFLIGHT_BLOCKED=MISSING_COMMIT"
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "PREFLIGHT_BLOCKED=DIRTY_WORKTREE"
  exit 1
fi

for FILE in \
  package.json \
  package-lock.json \
  next.config.ts \
  prisma/schema.prisma \
  src/lib/payments/service.ts
do
  if [[ ! -f "$FILE" ]]; then
    echo "PREFLIGHT_BLOCKED=MISSING_REQUIRED_FILE"
    exit 1
  fi
done

echo "PREFLIGHT=PASS"
echo "GIT_BRANCH=$BRANCH"
echo "GIT_COMMIT=$COMMIT"
echo "MODE=READ_ONLY"
echo "DEPLOYMENT=DISABLED"
echo "PM2_ACTIONS=NONE"
echo "NGINX_ACTIONS=NONE"
echo "DATABASE_ACTIONS=NONE"