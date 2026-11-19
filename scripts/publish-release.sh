#!/usr/bin/env bash
set -euo pipefail

baseline=v1.4.0
prefix=${baseline%.*}
stable_tag='^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

changelog_section() {
  awk -v heading="## [$1]" '
    { sub(/\r$/, "") }
    /^## / {
      found = ($0 == heading || (heading != "## [Unreleased]" && index($0, heading " ") == 1))
      next
    }
    found { print }
  '
}

git fetch --tags origin refs/heads/main:refs/remotes/origin/main
main=$(git rev-parse refs/remotes/origin/main)
tags=$(git tag --list --sort=version:refname)
latest=
patch=0
while IFS= read -r tag; do
  [[ "$tag" =~ $stable_tag ]] || continue
  if [[ -z "$latest" ]]; then
    if [[ "$tag" == "$baseline" ]]; then latest=$tag; fi
    continue
  fi

  ((patch += 1))
  expected="$prefix.$patch"
  [[ "$tag" == "$expected" ]] || fail "Expected $expected after $latest. Found $tag."
  latest=$tag
done <<< "$tags"
[[ -n "$latest" ]] || fail "Missing release baseline $baseline."
git merge-base --is-ancestor "$latest" "$main" || fail "$latest is outside main history."

notes=$(mktemp)
updated_changelog=$(mktemp)
trap 'rm -f "$notes" "$updated_changelog"' EXIT

publish() {
  gh release create "$1" --repo "$GITHUB_REPOSITORY" --verify-tag --latest \
    --title "$1" --notes-file "$notes"
}

# A retry after the Git push finishes an unpublished release before issuing any new tag.
if published=$(gh release view "$latest" --repo "$GITHUB_REPOSITORY" \
  --json isDraft,isPrerelease --jq '(.isDraft or .isPrerelease) | not'); then
  [[ "$published" == true ]] || fail "$latest must be a published stable release."
else
  git show "$latest:CHANGELOG.md" | changelog_section "${latest#v}" > "$notes"
  grep -q '[^[:space:]]' "$notes" || fail "Missing changelog notes for $latest."
  publish "$latest"
  exit 0
fi

[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" && "$main" == "$GITHUB_SHA" ]] \
  || fail "main changed after this run was dispatched. Start a new Release run from main."
version=$(node -p "require('./package.json').version")
[[ "v$version" == "$latest" ]] || fail "package.json must match the latest tag $latest."

changelog_section Unreleased < CHANGELOG.md > "$notes"
if ! grep -q '[^[:space:]]' "$notes"; then
  printf '%s\n' 'No notes under [Unreleased]. No release published.'
  exit 0
fi

tag="$prefix.$((patch + 1))"
npm version "${tag#v}" --no-git-tag-version --ignore-scripts
awk -v version="${tag#v}" -v date="$(date +%F)" '
  { sub(/\r$/, "") }
  $0 == "## [Unreleased]" {
    print
    print ""
    print "## [" version "] — " date
    next
  }
  { print }
' CHANGELOG.md > "$updated_changelog"
mv "$updated_changelog" CHANGELOG.md

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -- CHANGELOG.md package.json package-lock.json
git commit -m "chore(release): $tag"
git tag -a "$tag" -m "$tag"
git push --atomic origin HEAD:refs/heads/main "refs/tags/$tag"
publish "$tag"
