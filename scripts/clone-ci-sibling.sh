#!/usr/bin/env bash
set -euo pipefail

# Only a proven missing feature branch may use the RC fallback. Auth and
# transport failures stay fatal, and no remote default branch is ever cloned.

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "usage: $0 <repository> <destination> [sparse-directory]" >&2
  exit 64
fi

repository="$1"
destination="$2"
requested_branch="${CIRCLE_BRANCH:-}"
fallback_branch="${CI_SIBLING_FALLBACK_BRANCH:-mp-platform-rc6}"

# A fresh CircleCI executor may check out over HTTPS and have no SSH host keys.
# Pin GitHub's published key and fail promptly instead of waiting for a prompt.
if [[ "$repository" == git@github.com:* ]]; then
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh} -oBatchMode=yes -oConnectTimeout=20 -oStrictHostKeyChecking=yes -oUserKnownHostsFile='$script_dir/ci-github-known-hosts'"
fi

if [ -z "$requested_branch" ]; then
  echo "CIRCLE_BRANCH is empty; refusing an unpinned sibling checkout" >&2
  exit 1
fi

if git ls-remote --exit-code --heads "$repository" "refs/heads/$requested_branch" >/dev/null; then
  selected_branch="$requested_branch"
else
  probe_status=$?
  if [ "$probe_status" -ne 2 ]; then
    echo "Could not verify '$requested_branch' in $repository (git exit $probe_status)" >&2
    exit "$probe_status"
  fi
  if [ "$requested_branch" = "$fallback_branch" ]; then
    echo "Required sibling branch '$requested_branch' does not exist in $repository" >&2
    exit 1
  fi
  if git ls-remote --exit-code --heads "$repository" "refs/heads/$fallback_branch" >/dev/null; then
    selected_branch="$fallback_branch"
  else
    fallback_status=$?
    echo "Fallback '$fallback_branch' is unavailable in $repository (git exit $fallback_status)" >&2
    exit "$fallback_status"
  fi
  echo "Sibling '$requested_branch' is absent; using documented fallback '$fallback_branch'"
fi

clone_args=(--depth=1 --single-branch --branch "$selected_branch")
if [ "$#" -eq 3 ]; then
  clone_args+=(--filter=blob:none --sparse)
fi
git clone "${clone_args[@]}" "$repository" "$destination"
if [ "$#" -eq 3 ]; then
  git -C "$destination" sparse-checkout set "$3"
fi
test "$(git -C "$destination" branch --show-current)" = "$selected_branch"
git -C "$destination" rev-parse HEAD
