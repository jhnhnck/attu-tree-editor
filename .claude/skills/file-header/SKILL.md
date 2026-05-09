---
name: file-header
description: FamilyTreeEditor file header convention - SPDX MIT tag plus (python only) a structured breadcrumb docstring on every newly created source file. trigger when creating any new file under `apps/web/src/`, `apps/web/tests/`, `apps/server/attu_tree/`, `apps/server/tests/`, `packages/`, or `scripts/`; before writing the first line of a new `.py`, `.ts`, `.svelte`, `.svelte.ts`, `.js`, `.css`, `.sh`, `.zsh`, or `.bash` file; when using the `Write` tool to create a new source file; when answering questions about file headers, license markers, copyright notices, or SPDX in this repo.
---

# file-header

Canonical reference when **creating a new source file** in this repo. This skill is canonical; update it directly.

This skill applies to **new files only**. Existing files in this repo (e.g. `apps/server/attu_tree/main.py`) currently use a multi-line prose docstring header without SPDX; do not retrofit them mid-task. A bulk migration is a separate effort and should land as its own commit.

## the rule

Every new source file gets a two-part header:

1. an `SPDX-License-Identifier: MIT` line in the language's comment syntax
2. for python only: a one-line module docstring of the form `<dotted module path> | <short lowercase description>.`

Nothing else. No author line, no copyright year, no license prose, no decorative dividers above or below.

The repo's license is **MIT** (`LICENSE.md` at the repo root). If you find yourself about to type `Apache-2.0`, that's the doom-bot habit; this repo is MIT.

## by language

### python (`.py`)

```python
# SPDX-License-Identifier: MIT
"""<module path> | <short description>."""

import ...
```

The docstring must be the **first statement** after the SPDX comment - `ruff format` and `basedpyright` both expect it there, and PEP 257 picks it up as the module docstring.

Examples:

```python
# SPDX-License-Identifier: MIT
"""attu_tree.routers.trees | crud + share-grant routes for tree blobs."""
```

```python
# SPDX-License-Identifier: MIT
"""attu_tree.sync.autosave | revision-checked autosave merge."""
```

```python
# SPDX-License-Identifier: MIT
"""attu_tree.auth.hmac | hmac verification for bot-to-server requests."""
```

### typescript / javascript (`.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`)

SPDX only - no breadcrumb, no description. JS/TS has no native module-docstring concept and the file path already names the module.

prettier here uses **double quotes**; match that.

```typescript
// SPDX-License-Identifier: MIT

import { Tree } from "./domain/types";
```

```typescript
// SPDX-License-Identifier: MIT

import { test, expect } from "@playwright/test";
```

### svelte (`.svelte`)

place the SPDX line as an HTML comment on line 1, before the `<script>` block:

```svelte
<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
    let { tree } = $props();
</script>
```

`.svelte.ts` (runes-only modules) follows the regular typescript rule: `// SPDX-License-Identifier: MIT` on line 1.

### shell (`.sh`, `.zsh`, `.bash`)

Shebang first, then SPDX, then any usage / purpose comment block (these earn their keep on scripts that lack `--help`).

```bash
#!/bin/bash
# SPDX-License-Identifier: MIT
# usage: bash scripts/seed_dev_db.sh
# resets the dev sqlite db and reseeds with fixture trees.
set -euo pipefail
```

### css (`.css`)

```css
/* SPDX-License-Identifier: MIT */

@import "tailwindcss";
```

### other formats

- HTML: `<!-- SPDX-License-Identifier: MIT -->` on the first line, before `<!DOCTYPE html>` is fine
- TOML / YAML / `.env`: **no header**. SPDX in config files is unusual and parsers don't always tolerate leading comments uniformly. The repo's `LICENSE.md` covers them.
- Markdown, JSON, `.gitignore`, `.dockerignore`, `.editorconfig`: no header.

## how to derive the breadcrumb (python only)

The breadcrumb is the **importable python module path** that this file's contents extend or define:

| file path | breadcrumb |
|---|---|
| `apps/server/attu_tree/main.py` | `attu_tree.main` |
| `apps/server/attu_tree/routers/trees.py` | `attu_tree.routers.trees` |
| `apps/server/attu_tree/auth/__init__.py` | `attu_tree.auth` |
| `apps/server/attu_tree/sync/autosave.py` | `attu_tree.sync.autosave` |
| `apps/server/tests/test_health.py` | `tests.test_health` |
| `scripts/seed_dev_db.py` | `scripts.seed_dev_db` |

Rules:

- start from the package root (the directory containing the package's `__init__.py` or that's listed as the package in `pyproject.toml`), not from the repo root. for the server, the package root is `apps/server/attu_tree/`, so paths begin with `attu_tree.`.
- for `__init__.py`, use the package's own dotted path - **do not** include `__init__` in the breadcrumb
- for every other `.py` file, the breadcrumb is its full importable module path including the file basename (without `.py`)
- the breadcrumb is always lowercase with `.` separators - matches what you'd type after `import`

## description style

- **lowercase**, matching the comment-style aesthetic
- **brief** - one short clause; expand with a `-` (regular dash, never em-dash) only when a single clause is genuinely insufficient
- **end with a period** - PEP 257 requires it on one-line docstrings; this is the only place in the codebase where trailing periods on otherwise-comment-like text are correct
- **no implementation details** - say what the module *is*, not how it works
- **no references** to issue numbers, PRs, or "added for X" - those rot

```python
# good
"""attu_tree.sync.autosave | revision-checked autosave merge."""

# bad - capitalized
"""attu_tree.sync.autosave | Revision-checked autosave merge."""

# bad - no period
"""attu_tree.sync.autosave | revision-checked autosave merge"""

# bad - restates the breadcrumb
"""attu_tree.sync.autosave | the autosave module."""

# bad - implementation detail
"""attu_tree.sync.autosave | autosave merge using sqlalchemy core."""

# bad - issue reference (will rot)
"""attu_tree.sync.autosave | revision-checked autosave merge (added for #142)."""

# bad - em-dash
"""attu_tree.sync.autosave | autosave merge — checks revision before applying."""
```

## not in scope for this skill

- **existing files**: don't rewrite headers as part of unrelated work. a deliberate one-shot migration touches every file at once and lands as its own commit.
- **generated files**: `packages/api-client/` is generated from the openapi schema (see `pnpm gen:api`). leave whatever marker the generator emits; do not impose this skill's format on generated output.
- **`*.wip.ts` / `*.wip.py` / `wip/` directories**: excluded from linting per `apps/server/pyproject.toml` `[tool.ruff].exclude`. headers optional - skip them for scratch work.
- **vendored third-party code**: keep the upstream's header verbatim; do not impose this skill's format on code we didn't write.

## tooling notes

- `ruff format` and `ruff check` (apps/server): both happy with `# comment` then `"""docstring"""` as the first two statements
- `basedpyright`: treats the docstring as the module docstring, picks it up on hover
- `prettier` (apps/web): leaves the `// SPDX-License-Identifier: MIT` line alone
- `eslint`: no rules touch SPDX comments
- license scanners (REUSE, ScanCode, FOSSology, GitHub): all detect `SPDX-License-Identifier:` natively

## checklist before saving a new file

1. is the SPDX line the first non-shebang line? (line 1 for `.py`/`.ts`/`.svelte`/`.css`; line 2 for shell after the shebang)
2. for `.py`: is the docstring the next statement, with the right breadcrumb starting at `attu_tree.` (or `tests.`, `scripts.`) and a period at the end?
3. is the description lowercase and free of implementation/issue references?
4. is there a blank line between the header and the first import / first code statement?

If yes to all four, the header is correct.

## cross-references

- `comment-style` skill - lowercase / no-trailing-period rules apply to every other comment in the file (the python module docstring is the one exception)
- `LICENSE.md` at repo root - the actual MIT license text and copyright line
- `notes/agents.md` section 5 - the broader style guide
