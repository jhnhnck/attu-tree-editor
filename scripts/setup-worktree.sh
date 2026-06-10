#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# sets up a freshly-created git worktree of FamilyTreeEditor so the e2e
# / unit fixtures resolve. `notes/examples/` is gitignored (the
# gedcom/familyscript fixtures are local-only), so a new worktree has
# no fixtures until we symlink them in from the main checkout.
#
# usage: ./scripts/setup-worktree.sh <worktree-path>
set -euo pipefail

worktree="${1:-}"
if [ -z "$worktree" ]; then
    echo "usage: $0 <worktree-path>" >&2
    exit 1
fi

repo_root="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
target="$worktree/notes/examples"

if [ -e "$target" ]; then
    echo "$target exists - skipping" >&2
else
    mkdir -p "$worktree/notes"
    ln -s "$repo_root/notes/examples" "$target"
    echo "linked $target -> $repo_root/notes/examples" >&2
fi
