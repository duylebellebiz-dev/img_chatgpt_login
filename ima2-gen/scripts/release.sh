#!/usr/bin/env bash
# Verified preview -> stable tag/OIDC publish -> GitHub Release -> branch sync.
set -euo pipefail

cd "$(dirname "$0")/.."

PKG_NAME="ima2-gen"

fail() {
  echo "❌ $*" >&2
  exit 1
}

require_tools() {
  for command in git gh node npm; do
    command -v "$command" >/dev/null 2>&1 || fail "$command is required"
  done
  gh auth status >/dev/null 2>&1 || fail "gh CLI is not authenticated"
}

require_main_clean() {
  [ "$(git branch --show-current)" = "main" ] || fail "stable release must run from main"
  [ -z "$(git status --porcelain --untracked-files=normal)" ] || \
    fail "stable release requires a clean tracked and untracked worktree"
}

sync_release_branches() {
  local sha="$1" branch remote
  local -a updates=()
  git fetch origin dev preview
  for branch in dev preview; do
    remote=$(git rev-parse "origin/$branch")
    if [ "$remote" = "$sha" ]; then
      continue
    fi
    if git merge-base --is-ancestor "$remote" "$sha"; then
      updates+=("$sha:refs/heads/$branch")
    elif git merge-base --is-ancestor "$sha" "$remote"; then
      echo "ℹ️  preserving $branch at descendant $remote"
    else
      fail "origin/$branch diverged from release $sha"
    fi
  done
  if [ "${#updates[@]}" -gt 0 ]; then
    git push --atomic origin "${updates[@]}"
  fi
}

finalize_release() {
  local version="$1" sha remote_tag remote_tag_sha
  require_main_clean
  git fetch origin main dev preview --tags
  sha=$(git rev-list -n1 "v$version" 2>/dev/null || true)
  [ -n "$sha" ] || fail "tag v$version does not exist"
  [ "$(git rev-parse HEAD)" = "$sha" ] || fail "main HEAD must equal v$version SHA before finalize"
  remote_tag=$(git ls-remote --tags origin "refs/tags/v$version")
  [ -n "$remote_tag" ] || fail "remote tag v$version does not exist"
  remote_tag_sha="${remote_tag%%$'	'*}"
  [ "$remote_tag_sha" = "$sha" ] || fail "remote tag v$version points to $remote_tag_sha, expected $sha"
  git merge-base --is-ancestor "$sha" origin/main || fail "origin/main does not contain v$version"
  # OIDC publish already creates/refreshes the GitHub Release; this remains a recovery path.
  node scripts/release-contract.mjs ensure-github-release "$version" "$sha"
  sync_release_branches "$sha"
  echo "✅ finalized $PKG_NAME@$version at $sha (release + evidence + branch reconciliation)"
}

require_tools
node scripts/release-contract.mjs assert-toolchain

if [ "${1:-}" = "finalize" ]; then
  [ -n "${2:-}" ] || fail "usage: ./scripts/release.sh finalize X.Y.Z"
  finalize_release "$2"
  exit 0
fi

require_main_clean
git fetch origin main dev preview --tags

HEAD_SHA=$(git rev-parse HEAD)
REMOTE_MAIN=$(git rev-parse origin/main)
REMOTE_DEV=$(git rev-parse origin/dev)
REMOTE_PREVIEW=$(git rev-parse origin/preview)
git merge-base --is-ancestor "$REMOTE_MAIN" "$HEAD_SHA" || fail "local main diverged from origin/main"
git merge-base --is-ancestor "$REMOTE_DEV" "$HEAD_SHA" || fail "local main does not contain origin/dev"
git merge-base --is-ancestor "$REMOTE_PREVIEW" "$HEAD_SHA" || fail "local main does not contain origin/preview"

NPM_LATEST=$(npm view "$PKG_NAME" dist-tags.latest)
PKG_VERSION=$(node -p "require('./package.json').version")
BUMP_ARG="${1:-patch}"
CURRENT_REMOTE_TAG=$(git ls-remote --tags origin "refs/tags/v$PKG_VERSION")
CURRENT_PUBLISHED=$(npm view "$PKG_NAME@$PKG_VERSION" version 2>/dev/null || true)

if [ "$PKG_VERSION" = "$NPM_LATEST" ]; then
  [ "$REMOTE_DEV" = "$HEAD_SHA" ] || fail "fresh release requires main HEAD == origin/dev before version commit"
  npm version "$BUMP_ARG" --no-git-tag-version
  VERSION=$(node -p "require('./package.json').version")
  git add package.json package-lock.json
  git commit -m "[agent] chore: release v$VERSION"
elif [ -n "$CURRENT_PUBLISHED" ]; then
  fail "$PKG_NAME@$PKG_VERSION is already published; use: ./scripts/release.sh finalize $PKG_VERSION"
elif [ -n "$CURRENT_REMOTE_TAG" ]; then
  echo "⚠️  v$PKG_VERSION has an immutable remote tag but no npm package; advancing with $BUMP_ARG"
  npm version "$BUMP_ARG" --no-git-tag-version
  VERSION=$(node -p "require('./package.json').version")
  git add package.json package-lock.json
  git commit -m "[agent] chore: release v$VERSION"
else
  VERSION="$PKG_VERSION"
  echo "ℹ️  Resuming unpublished candidate v$VERSION (npm latest is $NPM_LATEST)"
fi

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "release version must be stable X.Y.Z (got $VERSION)"
[ -z "$(npm view "$PKG_NAME@$VERSION" version 2>/dev/null || true)" ] || \
  fail "$PKG_NAME@$VERSION is already published; use: ./scripts/release.sh finalize $VERSION"
[ -z "$(git ls-remote --tags origin "refs/tags/v$VERSION")" ] || fail "remote tag v$VERSION already exists"

RELEASE_SHA=$(git rev-parse HEAD)
npm run verify:release
[ -z "$(git status --porcelain --untracked-files=normal)" ] || \
  fail "release verification changed tracked output; commit generated artifacts and retry the same version"

IMA2_RELEASE_VERIFIED_SHA="$RELEASE_SHA" ./scripts/release-preview.sh

git fetch origin main dev preview --tags
[ "$(git rev-parse origin/main)" = "$REMOTE_MAIN" ] || fail "origin/main changed during preview verification"
[ "$(git rev-parse origin/dev)" = "$REMOTE_DEV" ] || fail "origin/dev changed during preview verification"
[ "$(git rev-parse origin/preview)" = "$RELEASE_SHA" ] || fail "origin/preview no longer points at the verified release SHA"

if ! git rev-parse --verify "refs/tags/v$VERSION" >/dev/null 2>&1; then
  git tag "v$VERSION" "$RELEASE_SHA"
fi
[ "$(git rev-list -n1 "v$VERSION")" = "$RELEASE_SHA" ] || fail "local tag v$VERSION does not point at release SHA"

git push --atomic origin \
  "$RELEASE_SHA:refs/heads/main" \
  "$RELEASE_SHA:refs/heads/dev" \
  "refs/tags/v$VERSION:refs/tags/v$VERSION"

node scripts/release-contract.mjs wait \
  "$RELEASE_SHA" "v$VERSION" latest "refs/tags/v$VERSION" "$VERSION"

finalize_release "$VERSION"
echo "✅ $PKG_NAME@$VERSION published and fully finalized"
