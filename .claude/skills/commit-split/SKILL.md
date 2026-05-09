---
name: commit-split
description: FamilyTreeEditor working-tree → meaningful-commits workflow. trigger when the user asks to "organize", "split", "untangle", "break up", "chunk", "clean up", or "stage" a messy working tree into commits; when `git status` shows many unrelated modifications and the user wants to ship them as separate commits; when one or more files contain hunks that belong to different logical units. complements `commit-style` (per-message conventions) by handling the planning, staging, and split-stage mechanics for the whole tree.
---

# commit-split

Authoritative reference when a messy working tree needs to land as a series of clean commits. Pairs with `commit-style` (which governs each individual message) and `feature-completion` (which gates whether a unit is ready). This skill governs the *organization* problem: which hunks belong together, how to stage them when files span commits, and how to drive the user through the sequence without tripping the no-unprompted-commits rule.

## The hard rule, first

`commit-style` rule still applies: **never run `git commit` without explicit instruction in the current turn.** When the user says "organize these into commits" they are authorising the act of committing — but the *plan* must be presented and approved before any `git commit` invocation. Once approved, the user can opt into "auto-proceed through the rest" so subsequent commits don't each need a fresh confirmation.

If the user has not signalled "go", stop after staging — never commit speculatively.

## The five phases

### Phase 1 — Inventory

Read the whole tree before grouping. Run in parallel:

```bash
git status               # never -uall (memory hit on big repos)
git diff --stat
git log --oneline -20    # match the project's commit style
```

For non-trivial diffs, also pull the actual hunks of files with substantial changes (`git diff <file>`). Don't grep around — read the diffs. Skim huge files (`head -200`, `tail -200`) rather than reading them whole; the goal is enough context to spot logical clusters.

### Phase 2 — Cluster

Group changes into **logical units**, not by file or by directory. A unit is whole when it stands on its own as a `feat`, `fix`, `patch`, `refactor`, or `chore` (see `commit-style`). Useful lenses:

- **By feature**: server config + matching frontend wiring + tests + docs all ride together if they exist to support one capability.
- **By cross-cutting concern**: docker / deployment / config-tier changes naturally cluster.
- **By independence**: a small UX patch (zoom widget cleanup, menu fix) that doesn't depend on a larger unit gets its own commit.
- **Cleanup that piggy-backs**: trivial unused-var deletions, comment fixes, etc., usually fold into the most semantically related commit rather than a separate `chore`.

Identify which files span multiple commits — these are the **multi-commit files** and need split-staging (Phase 4). Common offenders in this repo:

- `apps/web/src/App.svelte` — touches the shell for almost every UI commit
- `notes/agents.md`, `notes/to-do.md` — usually carry hunks for several different threads
- `apps/web/src/vite-env.d.ts` — type augmentations from multiple features pile up
- `apps/web/src/lib/wiki/linkResolver.ts` — config layer + wiki helpers in the same file
- shared registries (`shortcuts.ts`, `commands.ts`) when several features add entries

### Phase 3 — Plan and confirm

Present the proposed commits as a numbered list with a one-paragraph blurb per commit (what's in it, which files). Use the actual title you'd write (lowercased, scoped, casual — see `commit-style`). Don't bury the user in file-level detail; aim for a screenful.

Then ask one question via `AskUserQuestion` with these typical options:

- "Yes, proceed; auto-commit each" — straight-line execution
- "Yes, proceed; pause and confirm each" — slower but safer
- "Fewer, larger commits" — the user's signal to collapse adjacent units
- "Just commit N and stop" — when they want to vet the first one before committing

If the user picks "Fewer, larger commits", consolidate the most-similar adjacent units (often: small UI patches, notes-only commits, anything that touches the same shell component). Update the plan and proceed; don't re-ask.

### Phase 4 — Stage and commit, one unit at a time

For each commit:

1. **Stage cleanly-owned files** with `git add <paths>` and `git rm <paths>` for deletions. Don't use `git add .` or `git add -A` — they pull in noise and stage cross-commit files in full.
2. **For multi-commit files**, use the **snapshot-and-revert** technique below.
3. `git diff --cached --stat | tail -5` to sanity-check the staged surface area.
4. Run `git commit -m "$(cat <<'EOF' …)"` with the HEREDOC pattern from `commit-style`. Include the standard `Co-Authored-By` trailer.
5. Tick the todo entry; move to the next.

### Phase 5 — Verify clean

```bash
git status      # expect: nothing to commit, working tree clean
git log --oneline -<N>
```

State the per-commit caveat explicitly (see "Caveats" below) so the user isn't surprised if a mid-sequence commit doesn't build in isolation.

---

## The snapshot-and-revert technique

For files whose hunks span multiple commits. Avoids `git add -p` (which doesn't drive cleanly from a non-interactive shell) and avoids hand-crafting patches.

```bash
# Phase 4 step 2, per multi-commit file:

# (a) once at the start, snapshot the full working version
cp <file> /tmp/<basename>.full

# (b) for each commit that touches the file, in order:
#   - either edit <file> down to ONLY that commit's changes
#     (use Edit to revert the other-commit hunks back to HEAD or the prior staged state)
#   - or, if the file is already in the right state, skip the edit
git add <file>
git commit -m "..."
cp /tmp/<basename>.full <file>   # restore the full version for the next commit
```

Two practical patterns for picking what to keep:

- **Forward-reset**: `git show HEAD:<file> > /tmp/<file>.head; cp /tmp/<file>.head <file>`, then apply only the current commit's chunks via `Edit`. Best when the current commit is small and isolated within a file with many other-commit hunks.
- **Backward-trim**: keep the full version, use `Edit` to revert the *other* commits' hunks back to HEAD/prior. Best when the current commit owns most of the file's diff.

Always restore from `/tmp/<basename>.full` after staging, before moving on — don't trust the file's edited state to roll forward correctly to the next commit.

For interleaved single-hunk changes (e.g. `notes/agents.md` rule 2 has three independent sub-edits in adjacent lines), forward-reset wins: revert to HEAD, then apply only the one sub-edit you want.

## Caveats to flag at the end

State these explicitly when reporting the final tree:

- **Per-commit buildability is not guaranteed.** Splitting a working tree by intent ≠ verifying each commit compiles or passes tests. If "scaffolding lands here, integration lands there" was the natural cut, intermediate commits may not stand alone.
- **The final tip equals the pre-staging working tree.** Always confirm `git status` is clean and `git diff HEAD~<N>` covers exactly what was on the tree before you started.
- If buildability per commit is required, offer to either (a) rebase and run `pnpm verify` / `uv run pytest` per commit, or (b) fold dependent pairs (e.g. a passes-only commit + the consumer commit that wires them up).

## When to bail out and ask

- Ambiguous scope: a file's diff serves two unrelated purposes and the user needs to call which one matters.
- Unsigned-off destructive operations: if the working tree contains deletions you're unsure about, confirm before staging the deletion.
- A commit message you can't honestly write (e.g. you can't tell if it's a `fix` or a `patch`): ask, don't guess.
- The user mid-sequence redirects ("actually fold these two") — re-present the updated plan, don't barrel ahead.

## Cross-references

- `commit-style` — message format, types, scope, description style; the no-unprompted-commits rule
- `feature-completion` — what makes a unit *complete* (the unit shipping in a single commit must be whole)
- `comment-style` — same lowercase / no-trailing-period rules apply to commit subjects
- `notes/agents.md` rule 2 — the "no git push or deploy without being asked" rule (still applies — never push the resulting commits without explicit instruction)
