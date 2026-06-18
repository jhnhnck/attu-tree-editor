---
name: commit-style
description: FamilyTreeEditor commit message conventions. trigger before drafting, writing, or proposing any commit message; before `git commit`. project overlay on top of the generic floor.
---

# commit-style (FamilyTreeEditor)

this is the project overlay. for format (`type(scope): description`), types, description style, the no-unprompted-commits rule, and the canonical example log lines, read `~/.claude/skills/commit-style/SKILL.md` once.

project-specific deltas below.

## hard rule (canonical here)

**never run `git commit` without explicit instruction in the current turn.** authorization earlier in the conversation doesn't expire but doesn't extend either — pause and confirm before each `git commit`. this is rule 2 from `notes/agents.md`; it is not optional.

## style additions

`notes/agents.md` section 12 personality rules: semicolons or regular dashes only (never em-dashes), american english. lowercase throughout, no trailing period.

## project scopes

pattern-match against the existing log first. common scopes:

- domain modules: `domain`, `date`, `schema`, `validate`
- io paths: `gedcom`, `gedzip`, `familyscript`, `bundle`, `merge`
- ui surfaces: `tree`, `editor`, `shell`, `form`
- state: `state`, `autosave`, `persistence`, `selection`
- server: `server`, `auth`, `sync`, `wiki`, `routers`, `migrations`
- meta: `notes`, `ci`, `deps`, `tooling`

two- or three-word scopes are fine when a single word is ambiguous (`feat(io/gedzip): ...`).

## what makes a unit complete

baseline rules from the generic skill apply. project additions:

- **`feat`** — implementation + tests + notes/docs + config/assets + `notes/to-do.md` updates, all in one commit.
- **`fix` / `patch`** — change + test; if the db layer or a script had to be touched, those go in too. `notes/to-do.md` updates marking the item complete go in the same commit.
- **`test`** — if a feature ships without tests, add a `notes/to-do.md` entry under the test section.

## pre-commit gate

walk `feature-completion` first. a commit is ready when its unit is whole *and* `pnpm verify` passes; not before.

## cross-references

- `notes/agents.md` rule 2 — the no-unprompted-commits rule (canonical home)
- `notes/agents.md` section 12 — personality / style
- `feature-completion` — pre-commit checklist
- `comment-style` — same lowercase / no-trailing-period rules for in-code comments
- `commit-split` (project version) — splitting a working tree into commits
