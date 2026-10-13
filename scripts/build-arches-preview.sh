#!/usr/bin/env bash
# Builds the Arches preview branch testers install until Arches 8.2.0 ships
# with the changes this plugin needs: dev/8.2.x plus each pull request below
# that hasn't merged yet. See docs/arches-compatibility.md.
#
#   scripts/build-arches-preview.sh <arches checkout>
#
# Works in a temporary worktree, so the checkout's own branch and changes are
# left alone. Pull requests often add lines in the same places: release notes,
# and tests side by side. Conflicts in release notes and tests are resolved by
# keeping both sides (combined Python must still compile); a conflict in
# application code stops the build. Nothing is pushed: the script prints the
# command to publish it.
#
#   ARCHES_REMOTE           remote for archesproject/arches, default origin
#   ARCHES_PREVIEW_BRANCH   default rmg/geolibre_8.2_preview

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 <arches checkout>" >&2
    exit 2
fi

ARCHES_DIR="$(cd "$1" && pwd)"
REMOTE="${ARCHES_REMOTE:-origin}"
BASE_BRANCH="dev/8.2.x"
PREVIEW_BRANCH="${ARCHES_PREVIEW_BRANCH:-rmg/geolibre_8.2_preview}"
# Keep in step with the table in docs/arches-compatibility.md.
PULL_REQUESTS=(13011 13012 13013 13014 13015)

WORK_DIR="$(mktemp -d)"
WORKTREE="$WORK_DIR/arches-preview"
cleanup() {
    git -C "$ARCHES_DIR" worktree remove --force "$WORKTREE" 2>/dev/null || true
    rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "Fetching $BASE_BRANCH and pull requests ${PULL_REQUESTS[*]} from $REMOTE"
git -C "$ARCHES_DIR" fetch --quiet "$REMOTE" "$BASE_BRANCH"
for pull_request in "${PULL_REQUESTS[@]}"; do
    git -C "$ARCHES_DIR" fetch --quiet --force "$REMOTE" \
        "pull/$pull_request/head:refs/arches-preview/$pull_request"
done

git -C "$ARCHES_DIR" worktree add --quiet --force -B "$PREVIEW_BRANCH" \
    "$WORKTREE" "$REMOTE/$BASE_BRANCH"
cd "$WORKTREE"

# Takes both sides of each conflicting hunk, for additions that only clash
# because they're in the same place.
combine_both_sides() {
    local path="$1"
    git show ":1:$path" >"$WORK_DIR/base"
    git show ":2:$path" >"$WORK_DIR/ours"
    git show ":3:$path" >"$WORK_DIR/theirs"
    git merge-file --union -p "$WORK_DIR/ours" "$WORK_DIR/base" "$WORK_DIR/theirs" >"$path"
    if [[ "$path" == *.py ]] && ! python3 -m py_compile "$path"; then
        return 1
    fi
    git add "$path"
}

for pull_request in "${PULL_REQUESTS[@]}"; do
    pull_request_ref="refs/arches-preview/$pull_request"
    if git merge-base --is-ancestor "$pull_request_ref" HEAD; then
        echo "  #$pull_request is already in $BASE_BRANCH; skipping"
        continue
    fi
    message="Merge archesproject/arches#$pull_request into the GeoLibre preview"
    if git merge --quiet --no-ff --no-verify -m "$message" "$pull_request_ref" >/dev/null 2>&1; then
        echo "  merged #$pull_request"
        continue
    fi
    unresolved=()
    while IFS= read -r path; do
        case "$path" in
        releases/*.md | tests/*) combine_both_sides "$path" || unresolved+=("$path") ;;
        *) unresolved+=("$path") ;;
        esac
    done < <(git diff --name-only --diff-filter=U)
    if [ ${#unresolved[@]} -gt 0 ]; then
        git merge --abort
        echo "Merging #$pull_request conflicts in: ${unresolved[*]}" >&2
        echo "Rebase that pull request on $BASE_BRANCH, or resolve it by hand." >&2
        exit 1
    fi
    git commit --quiet --no-edit --no-verify
    echo "  merged #$pull_request (combined additions in release notes or tests)"
done

echo
echo "Built $PREVIEW_BRANCH:"
git log --oneline "$REMOTE/$BASE_BRANCH..HEAD" | sed 's/^/  /'
echo
echo "To publish it for testers:"
echo "  git -C $ARCHES_DIR push --force $REMOTE $PREVIEW_BRANCH"
