#!/usr/bin/env bash
# Promote one verified source SHA to the preview branch and wait for npm proof.
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  echo "❌ $*" >&2
  exit 1
}

for command in git gh node npm; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done
gh auth status >/dev/null 2>&1 || fail "gh CLI is not authenticated"
node scripts/release-contract.mjs assert-toolchain

BRANCH=$(git branch --show-current)
case "$BRANCH" in
  main|dev) ;;
  *) fail "preview promotion must run from main or dev (current: ${BRANCH:-detached})" ;;
esac

if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  fail "preview promotion requires a clean tracked and untracked worktree"
fi

git fetch origin preview --tags
SOURCE_SHA=$(git rev-parse HEAD)
REMOTE_PREVIEW=$(git rev-parse origin/preview)
git merge-base --is-ancestor "$REMOTE_PREVIEW" "$SOURCE_SHA" || \
  fail "origin/preview is not an ancestor of $SOURCE_SHA; refusing a non-fast-forward promotion"

if [ "${IMA2_RELEASE_VERIFIED_SHA:-}" != "$SOURCE_SHA" ]; then
  npm run verify:release
  if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
    fail "release verification changed tracked output; commit generated artifacts before preview"
  fi
fi

if [ "$REMOTE_PREVIEW" = "$SOURCE_SHA" ]; then
  CURRENT_PREVIEW_SHA=$(npm view ima2-gen@preview gitHead 2>/dev/null || true)
  [ "$CURRENT_PREVIEW_SHA" = "$SOURCE_SHA" ] || \
    fail "origin/preview already points at $SOURCE_SHA but npm preview does not; create a fix-forward commit to retrigger"
  CURRENT_PREVIEW_VERSION=$(npm view ima2-gen@preview version)
  node scripts/release-contract.mjs verify-channel \
    "$CURRENT_PREVIEW_VERSION" preview refs/heads/preview "$SOURCE_SHA"
  echo "✅ preview already verified for $SOURCE_SHA"
  exit 0
fi

echo "⬆️  Promoting $SOURCE_SHA to preview..."
git push origin "$SOURCE_SHA:refs/heads/preview"
node scripts/release-contract.mjs wait \
  "$SOURCE_SHA" preview preview refs/heads/preview
echo "✅ preview package verified for $SOURCE_SHA"
