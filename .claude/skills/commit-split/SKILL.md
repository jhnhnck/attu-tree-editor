---
name: commit-split
description: FamilyTreeEditor working-tree → meaningful-commits workflow. trigger on "organize", "split", "untangle", "break up", "chunk", "stage" a messy working tree into commits; when `git status` shows unrelated modifications. project overlay on top of the generic floor.
---

# commit-split (FamilyTreeEditor)

this is the project overlay. for the generic five-phase mechanics (inventory → cluster → plan and confirm → stage and commit → verify clean), the snapshot-and-revert technique, and the no-unprompted-commits rule, read `~/.claude/skills/commit-split/SKILL.md` once.

project-specific deltas below.

## hard rule

`commit-style` (project version) is the canonical hard-rule source: **never run `git commit` without explicit instruction in the current turn.** the project version cites `notes/agents.md` rule 2 — it does not expire mid-conversation.

## project-specific multi-commit files

these are the files in this repo most likely to span multiple commits — flag them during the cluster phase and use snapshot-and-revert (see user-level skill) during the stage phase.

- `apps/web/src/App.svelte` — touches the shell for almost every UI commit
- `notes/agents.md`, `notes/to-do.md` — usually carry hunks for several different threads
- `apps/web/src/vite-env.d.ts` — type augmentations from multiple features pile up
- `apps/web/src/lib/wiki/linkResolver.ts` — config layer + wiki helpers in the same file
- shared registries (`shortcuts.ts`, `commands.ts`) when several features add entries

## verify command

per-commit buildability check (offered to the user if requested): `pnpm verify` for the web side, `uv run pytest` from `apps/server/` for the server side. the user-level "caveats" section already explains that per-commit buildability isn't free; offer the rebase-and-verify or fold-dependent-pairs options when requested.

## cross-references

- `commit-style` (project version) — message format, types, scope, examples
- `feature-completion` — what makes a unit complete (and the `pnpm verify` gate)
- `notes/agents.md` rule 2 — never push without being asked
