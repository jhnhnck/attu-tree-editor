#!/usr/bin/env zsh
# FamilyTreeEditor - dev launcher: caddy + fastapi + tree-editor + wiki-editor
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

print -P "%F{cyan}[trees-server]%f starting on :8001 — log: scratch/server-dev.log"
(cd "$project_dir/apps/server" && TREES_CONFIG_PATH="$project_dir/data/trees-config.toml" \
    .venv/bin/uvicorn attu_tree.main:app --reload --port 8001) \
    > "$project_dir/scratch/server-dev.log" 2>&1 &

print -P "%F{cyan}[tree-editor]%f starting on :5173 — log: scratch/tree-editor-dev.log"
VITE_BASE=/trees pnpm --filter tree-editor dev \
    > "$project_dir/scratch/tree-editor-dev.log" 2>&1 &

print -P "%F{cyan}[wiki-editor]%f starting on :5174 — log: scratch/wiki-editor-dev.log"
VITE_BASE=/edit pnpm --filter wiki-editor dev \
    > "$project_dir/scratch/wiki-editor-dev.log" 2>&1 &

print -P "%F{cyan}[caddy]%f starting on :8000 — /trees :5173  /edit :5174  api :8001"
caddy run --config "$project_dir/scripts/Caddyfile.dev" --adapter caddyfile
