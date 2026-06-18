---
name: comment-style
description: FamilyTreeEditor comment conventions - case, punctuation, brevity, section dividers, todo tags, and noqa reasons. trigger when editing or creating any source file under `apps/web/src/`, `apps/server/attu_tree/`, `apps/web/tests/`, `apps/server/tests/`, or `packages/`; when writing inline or block comments in `.py`, `.ts`, `.svelte`, or `.svelte.ts`; when adding `# noqa` (python) or `// eslint-disable` / `// @ts-expect-error` (ts); when adding or reviewing module-level section dividers; when answering questions about comment formatting in this repo.
---

# comment-style

Authoritative reference when writing comments in this repo. Applies to python, typescript, svelte, and shell. This skill is canonical; update it directly. Source: `notes/agents.md` section 5 ("shared style") and section 12 ("personality / style").

## default: write no comment

Only write a comment when the *why* is non-obvious. If removing the line would not confuse a future reader, do not write it. Do not restate what well-named identifiers already say. Do not write "added for issue #X" or "used by Y" - those rot.

## hard rules

- **all lowercase** including the start of sentences. exception: when lowercasing creates ambiguity (proper nouns, acronyms, in-universe terms like `HaracalndeDate`)
- **no trailing period** on single-line comments; periods only when multiple sentences make them necessary
- **one space after `#`** (python) or **one space after `//`** (ts/svelte/js) always
- **regular dashes (-) only**; never em-dashes
- **brief**. if a comment needs paragraphs, the code probably needs restructuring
- comment the *why*, not the *what*
- american english spelling

## inline vs block

inline: same line as code, **two spaces** before the comment marker, short.

```python
elapsed_days = int(time_diff_sec / SECONDS_PER_DAY)  # floor div keeps tz-safe
```

```typescript
const id = randomId();  // not stable across reloads; that's fine for in-memory only
```

block: above the line(s), same indent. one blank line before a block that starts a new logical section; no blank line between the comment and the code it describes.

```python
# check if we already passed the rollover
if datetime.now(UTC) >= friday_rollover:
    friday += timedelta(days=7)
```

```typescript
// fflate's instanceof check fails across realms; node-mode tests sidestep this
const reader = new Uint8Array(buf);
```

if an inline comment needs a full sentence, promote it to a block comment instead.

## examples - good vs bad

```python
# good
x = x + 1  # compensate for boundary

# bad - capitalized
# Check if we already passed trigger time

# bad - trailing period
# handles the paused case.

# bad - restates the code
count = count + 1  # add 1 to count
```

```typescript
// good
const stamped = { ...manifest, schemaVersion: CURRENT_SCHEMA_VERSION };  // writer stamps; reader migrates

// bad - capitalized + restates the code
// Sets the schema version
const stamped = { ...manifest, schemaVersion: CURRENT_SCHEMA_VERSION };

// bad - em-dash + trailing period
// stamps the schema version — readers will migrate forward.
```

## section dividers

**module level only** - never inside functions or classes.

### python

format: `# --- <label> ---`

```python
# --- initialization ---

logger = get_logger(__name__)


# --- utilities ---


def some_function(): ...
```

`apps/server/attu_tree/models.py` uses a heavier divider (a row of `#`-fenced dashes); don't extend that style outward but don't rewrite it on sight either.

### typescript / svelte

format: `// --- <label> ---` at module top level. svelte components rarely need them - section the file by `<script>` / markup / `<style>` instead.

avoid `# ======`, `# ####`, `// ====`, or bare dividers without a label.

## todo / note / fixme tags

use sparingly. format: all-caps tag, colon, space, lowercase message. only `TODO`, `NOTE`, `FIXME` - no `HACK`, `XXX`, or other variants.

```python
# TODO: handle the legacy schema_version=0 case
# NOTE: snowflakes are str on the wire, never int
# FIXME: this drops timezone info on parse
```

```typescript
// TODO: switch to parentIds[] once the migration lands
// NOTE: cropper outputs webp; bundle/write expects bytes, not Blob
```

`notes/to-do.md` is the canonical place for tracked work; in-code `TODO` is for tactical reminders that belong next to the code.

## suppression markers must carry a reason

every suppression of a lint or type-check rule must explain *why*. the reason should be specific to the case at hand, not a restatement of the rule name.

### python `# noqa`

```python
something()  # noqa: PLW0603 - lazy singleton initialization requires global
```

`# noqa` or `# noqa: CODE` with no reason is rejected.

### typescript

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party callback uses any
function onLegacy(payload: any) { ... }

// @ts-expect-error -- relatives-tree const enum can't be referenced under isolatedModules
const rel: RelType = 'blood' as unknown as RelType;
```

`@ts-ignore` is forbidden; use `@ts-expect-error` (it complains if the error stops happening). `// pyright: ignore[code]` follows the same shape as `# noqa`.

### svelte / html attribute escapes

if you need to disable a rule inside a `.svelte` file, prefer `<!-- eslint-disable-next-line ... -- reason -->` immediately above the offending line.

## what not to write

- no commented-out code in production files; use a `wip/` directory or stash if you need to keep it around briefly
- no redundant file-header comments - the `file-header` skill governs that
- no decorative ascii-art dividers
- no "what the code does" comments
- no references to issue numbers, PRs, or "the X flow" - those rot
- no em-dashes (`—`) anywhere; use `;` or `-`

## cross-references

- `notes/agents.md` section 5 - shared style
- `notes/agents.md` section 12 - personality / style
- `file-header` skill - the one place a docstring/comment-like line is allowed to end with a period
- `commit-style` skill - the same lowercase / no-trailing-period rules apply to commit messages
