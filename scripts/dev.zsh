#!/usr/bin/env zsh
# FamilyTreeEditor - dev launcher: python api + tree-editor + wiki-editor
# This file is licensed under the MIT License; See LICENSE for full text.
set -eu

project_dir="${0:A:h:h}"

cleanup() {
    local -a pids
    pids=("${(@f)$(jobs -p 2>/dev/null)}")
    # first element is empty when no background jobs are running
    (( ${#pids[1]} )) && kill -- "${pids[@]}" 2>/dev/null || true
}
# EXIT fires on all exits (including Ctrl-C); trapping INT as well causes double-cleanup
trap cleanup EXIT

print -P "%F{cyan}[trees-server]%f starting on :8000 — api + reverse proxy for /trees and /edit"
(cd "$project_dir/apps/server" && TREES_CONFIG_PATH="$project_dir/data/trees-config.toml" .venv/bin/uvicorn attu_tree.main:app --reload --port 8000) &

print -P "%F{cyan}[tree-editor]%f starting on :5173 (VITE_BASE=/trees)"
VITE_BASE=/trees pnpm --filter tree-editor dev &

print -P "%F{cyan}[wiki-editor]%f starting on :5174 (VITE_BASE=/edit)"
VITE_BASE=/edit pnpm --filter wiki-editor dev &

wait
