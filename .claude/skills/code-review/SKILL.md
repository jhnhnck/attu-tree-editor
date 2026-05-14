---
name: code-review
description: FamilyTreeEditor multi-pass code review of uncommitted changes, a branch vs main, or a specific file/PR. trigger on "review", "audit", "check this code", "look for bugs", "is this any good", "second pass"; before opening a PR; before merging; after a large refactor lands. produces a written report. defers to style skills (`commit-style`, `comment-style`, `file-header`, `pydantic`, `design-and-ui-changer`) — does not restate their rules.
---

# code review

structured multi-pass review producing a written report. judgment work, not a checklist. invoke the listed style skills as needed; do not re-derive their rules here.

## how to run

### 1. establish scope

- **uncommitted changes** — `git diff HEAD` and `git status`. fastest, most common.
- **branch vs main** — `git diff main...HEAD` and `git log --oneline main..HEAD`.
- **specific files / directories** — `git log -p <path>` for history; `Read` for current state.
- **github PR** — `gh pr view <num>` and `gh pr diff <num>`.

if scope is ambiguous, ask once.

### 2. read before judging

`Read` every changed file in full, not just the diff. context outside the hunk often determines correctness. half the value of a review is catching what the author looked at and dismissed.

for large diffs, partition: layout + canvas, server + auth, persistence + sync, ui + components, tests + docs. review one partition at a time.

### 3. produce the report

structure findings under fixed headings (skip a heading if empty):

- **Correctness & logic** — bugs, off-by-one, null handling, async sequencing, races
- **Design** — abstractions, naming, scope creep, dead code
- **Tests** — gaps in coverage; specific cases to add
- **Documentation** — drift between code and notes
- **Security** — see [repo-specifics.md](repo-specifics.md) pass 6; project-specific
- **Style** — only when a style skill rule is violated; cite, don't restate

each finding: `- file:line — one-sentence problem · one-sentence fix`. severity tags `[blocker] / [important] / [nit]` go in front when more than ~5 findings exist.

end with one-line **bottom line**: "ship it", "ship after blockers", "rework needed".

## the seven passes

run each pass over the scoped changes. they're orthogonal.

1. **correctness & logic** — inputs, paths, async ordering (TOCTOU windows around `await`), mutation vs immutability, dates, errors. project-specific gotchas in [repo-specifics.md](repo-specifics.md).
2. **design** — single responsibility, abstraction shape, naming, state placement, dead code, hard-coded constants. ask: "if i had to maintain this in six months, would the diff make sense?"
3. **bugs commonly seen here** — cross-check against the high-volume patterns in [repo-specifics.md](repo-specifics.md) pass 3 (CSS transitions, per-frame style writes, undo history, `{#each}` keying, SQL injection, CORS, blob size).
4. **tests** — defer to `feature-completion` for "did you add tests". this pass does the qualitative work: coverage shape, edge cases worth adding (see [repo-specifics.md](repo-specifics.md) pass 4), mocks, e2e gaps, flakiness sources.
5. **documentation** — drift between code and `notes/agents.md`, `notes/features/`, `notes/to-do.md`, `README.md`, inline docs. see [repo-specifics.md](repo-specifics.md) pass 5.
6. **security** — project threat model in [repo-specifics.md](repo-specifics.md) pass 6. complements `/security-review` (generic OWASP); run both for high-risk surfaces.
7. **style** — cite style skills; don't restate. file headers → `file-header`. comments → `comment-style`. commits → `commit-style`. UI → `design-and-ui-changer`. pydantic → `pydantic`. flag only when a rule from those skills is broken. format: `- file:line — violates comment-style §<section>`.

## report shape

```
## Code review — <short scope>

**Bottom line:** ship after blockers (3 blockers, 6 important, 4 nits).

### Correctness & logic
- [blocker] apps/web/src/lib/sync/sync.svelte.ts:84 — read of `revision` then `await fetch(...)` then write; new revision can land in between. Fix: capture revision into the request body, server revision-checks via `apply_save`.

### Design
- ...

### Tests
- ...

### Documentation
- notes/features/wiki-integration.md §2.1 still says editor-side ports map; the compose change removed that.

### Security
- [blocker] ...

### Style
- comment-style §inline-case: 4 violations in `edgeRouter.ts` (uppercase first letter)
```

stay strict on the bottom line — "ship it" means you'd merge it as-is.

## what this skill does not do

- run tests or commit anything.
- auto-apply fixes; each finding is a suggestion the user accepts or rejects.
- replace `/security-review`; complement it for high-risk surfaces.
- replace the user's judgment; when in doubt, flag and explain.
