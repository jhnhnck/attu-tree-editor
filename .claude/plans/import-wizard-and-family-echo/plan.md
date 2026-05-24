# import wizard + family echo coverage

## context

Three threads bundled into one plan because they all converge on `lib/io/importFile.ts`:

1. **Family Echo HTML import.** The `.html` export from familyecho.com (e.g. `My-Family-24-May-2026-103040590.html` in the repo root) is self-contained: the full FamilyScript lives in a hidden `<input id="newscript">` and portrait images are inlined as base64 data URIs in hidden `<img id="image-N">` tags, keyed by the FS `r` tag's imageid. No network or share-link needed. Today this format isn't supported at all.

2. **FamilyScript parser gaps.** [parse.ts](../../../apps/web/src/lib/io/familyscript/parse.ts) has documented bugs and silently drops most of the spec:
   - `q` is mis-written to `person.locationOrigin` ([parse.ts:210-212](../../../apps/web/src/lib/io/familyscript/parse.ts#L210)); spec says it's surname-at-birth.
   - ID regex `[A-Z0-9]{5}` ([parse.ts:31](../../../apps/web/src/lib/io/familyscript/parse.ts#L31)) rejects spec-legal mixed-case any-length IDs.
   - Gender accepts only `m/f/u`; spec has `o` (other).
   - Couple `m` (marriage date) is ignored even though `CoupleRecord.marriageDate` exists ([types.ts:178](../../../apps/web/src/lib/domain/types.ts#L178)).
   - `O` (birth order) dropped despite domain slot at [types.ts:146](../../../apps/web/src/lib/domain/types.ts#L146).
   - `V/W/Q` (parent pedi codes) dropped despite `ParentRef.pedi` slot.
   - `X/Y/K/L` (2nd/3rd parent set) dropped despite `parentIds: ParentRef[]` supporting multi-parent.
   - `n N J v y` (given-at-birth, nickname, suffix, birth/death place) have no domain slot yet but are common.

3. **Import wizard UX.** [App.svelte:1052-1130](../../../apps/web/src/App.svelte#L1052) currently does a silent immediate import on file-pick or canvas drop, replacing the active tree. User wants: drag-drop dialog, up to N files merged on import, free-text tree-name field prefilled from the first file's detected name, a confirm-Import button, and (when a tree is open) a replace-vs-merge-into-current radio. Critical: **"replace" means autosave-the-current-then-open-new, never delete**.

**Latent foundation bug** that surfaced during exploration: [readBundle()](../../../apps/web/src/lib/io/bundle/read.ts#L62) returns `portraits: PortraitBlob[]` but [importFile()](../../../apps/web/src/lib/io/importFile.ts#L34) discards them. GEDZIP imports silently lose portraits today. HTML import depends on the same persistence path being functional, so this fix is part of phase 0 rather than its own phase.

**Architecturally moot concerns** (verified during pre-mortem): the FS serializer was retired ([tokens.ts header](../../../apps/web/src/lib/io/familyscript/tokens.ts#L2)); only `parse.ts` + `tokens.ts` exist. No round-trip-asymmetry worry for new `r`/`q` parsing — there's nothing on the other side.

## goals

- HTML import lands: drop a Family Echo `.html` and get the tree + portraits in the editor.
- FS parser bugs fixed and all tags that map to an existing domain slot are wired.
- 5 new optional Person slots added (`nickname`, `suffix`, `surnameAtBirth`, `birthPlace`, `deathPlace`) so the common FS attributes round-trip through GEDCOM/GEDZIP.
- Import wizard supports drag-drop, multi-file merge, tree-name override, Import-button confirm, replace-or-merge radio.
- Portraits round-trip end-to-end from every import path (existing GEDZIP-drops-portraits bug fixed).
- Unmappable FS tags filed in [notes/to-do.md](../../../notes/to-do.md) as a tracked known-gap.

## non-goals

- New export formats (export stays GEDZIP-only).
- Family Echo share-link / `ap_image_read.php` network fetch path. HTML is self-contained; this is unnecessary.
- GEDCOM parser changes beyond serializer-side mapping for new Person slots.
- Real-time multi-user collaboration.
- 2nd/3rd parent set TYPE codes for the obscure pedi values (`g` godparent, `r` surrogate) — pedi enum extension can land later if needed.
- Pet metadata (`R`), contact info (`e w B P t k u a C`), bio narrative (`o`), color label (`G`), custom fields (`1-9`), couple lifecycle dates other than marriage (`r b w t n y s d a f z`). All filed as known-gap to-dos.
- Interactive merge-conflict resolution UI. Conflicts produce findings; "first source wins" per existing `mergeTrees` semantics.
- Auto-migration of existing IDB trees with `q`-tag-misassigned `locationOrigin` data. See risk note below.

## constraints

- Permissive schema rule ([CLAUDE.md](../../../CLAUDE.md) hard-rule 4): validate-as-finding, never reject.
- `CURRENT_SCHEMA_VERSION = "3.4.0"`; any new optional Person slot needs a `Migration` entry in [schema.ts](../../../apps/web/src/lib/domain/schema.ts) (no-op for old data; fields are optional).
- Test stack: vitest unit + Playwright e2e. HTML parsing uses `DOMParser` in browser and node's `jsdom` (already in use elsewhere) in unit tests.
- Existing single-file silent-import behavior is removed; all import flows go through the wizard. Drag-drop on the bare canvas opens the wizard with the dropped file preselected.

## accepted risks

The `q` reassignment is a semantic flip: existing IDB trees imported from FS before this lands have surname-at-birth values stored in `person.locationOrigin`. Auto-migration is unsafe because legitimate `locationOrigin` values (typed in the inspector) would be misclassified by any heuristic. Mitigation: ship the fix, add a release note, and add a one-shot "move locationOrigin → surnameAtBirth" dev-console command. Multi-file merge accepts orphan portrait blobs in IDB when a non-winning source contributes a portrait that loses the conflict; eager GC can land later via the existing `gcUnreferencedBlobs` pass. Pre-mortem report sits beside this plan at [pre-mortem.md](pre-mortem.md).

## phase 0 — walking skeleton (wizard frame + payload contract + portrait persistence)

**status:** not started.

The thinnest end-to-end slice that exercises every layer the final wizard will touch: dialog UI → format detection → parser → portrait persistence (`putBlob` → IDB) → `treeStore.reset` → renderer. Single file only, no merge, no HTML, no FS gap fixes. The slice **does** include tree-name override and replace-vs-merge-radio (the pre-mortem flagged these as skeleton-shape, not polish).

Land:
- New `lib/components/import/ImportWizard.svelte` opened from the import action in [App.svelte](../../../apps/web/src/App.svelte) and from canvas drag-drop. Drag-drop on the wizard itself works.
- New `ImportPayload { tree: Tree; portraits: PortraitBlob[]; sourceFormat }` returned from a refactored `importFile()`. Bundle reader's existing `portraits[]` now flows through to a new `persistImportPayload()` helper that walks portraits, calls `putBlob` per blob, links results to `person.portraitBlobId`, then calls `treeStore.reset(tree)`.
- Free-text tree-name field, prefilled from the parsed `tree.name`.
- When a tree is open: a replace-or-merge-into-current radio. Selecting replace triggers a forced autosave of the active tree before the imported tree opens. Selecting merge is wired but only meaningful from phase 5 forward — for now, single-file merge just folds the imported tree into the active one via existing `mergeTrees`.
- Import button; the wizard does nothing until clicked. Cancel closes without touching state.

Critical files:
- [apps/web/src/lib/io/importFile.ts](../../../apps/web/src/lib/io/importFile.ts) — refactor return type to `ImportPayload`.
- [apps/web/src/App.svelte](../../../apps/web/src/App.svelte) — replace silent-import path with wizard invocation; route canvas drag-drop into wizard.
- new `apps/web/src/lib/components/import/ImportWizard.svelte`.
- new `apps/web/src/lib/io/persistImportPayload.ts` — payload → IDB → treeStore.

DoD (cross-phase): existing GEDZIP fixture with embedded portraits imports through the wizard and the portraits **actually appear on the cards in the canvas** (today they don't, even though the bundle reader extracts them). All three existing format fixtures (FS / GEDCOM / GEDZIP) still load and produce the same person counts as today. New unit test `ImportPayload` shape covers portrait pass-through. Existing single-file silent-import code paths are deleted, not just bypassed.

## phase 1 — html import

**status:** not started.

New parser at `apps/web/src/lib/io/familyecho-html/parse.ts` that:
1. Parses the HTML via `DOMParser` (browser) / `jsdom` (tests).
2. Reads the value of `<input id="newscript">` and hands the text to existing `parseFamilyScript()`.
3. Walks all `<img id="image-N">` elements, decodes each base64 data URI into a `Map<imageid, { ext, bytes }>`.
4. For each person whose extras include the new `r` capture, looks up the matching image bytes and produces a `PortraitBlob` with the resolved person id.
5. Returns the phase-0 `ImportPayload`.

In the FS parser, add a minimal `case "r"` that extracts the first space-separated token (the imageid) and stores it in `personExtras` under a recognized key so the HTML wrapper can read it. The imageid is **consumed at import time** and never persisted on Person.

Add `.html` detection to [detect.ts](../../../apps/web/src/lib/io/detect.ts) — extension `.html` + the marker `<input ... id="newscript"` in the first 16 KB; falls back to `unknown` for arbitrary HTML.

Critical files:
- new `apps/web/src/lib/io/familyecho-html/parse.ts` + sibling `tokens.ts` if useful.
- [apps/web/src/lib/io/familyscript/parse.ts](../../../apps/web/src/lib/io/familyscript/parse.ts) — add `r` capture in the person switch.
- [apps/web/src/lib/io/detect.ts](../../../apps/web/src/lib/io/detect.ts) — new `familyecho-html` discriminant.
- [apps/web/src/lib/io/importFile.ts](../../../apps/web/src/lib/io/importFile.ts) — route the new format.
- new `apps/web/tests/unit/io/familyecho-html/parse.test.ts` using a small fixture.

DoD: canonical `My-Family-24-May-2026-103040590.html` (or a trimmed fixture derived from it) imports through the wizard. Embedded portraits land on the matched cards. The `r` tag's imageid does **not** appear on persisted Person records (verified via a "no leaky import metadata" assertion). FS imports continue to round-trip through tests unchanged.

## phase 2 — familyscript parser bug fixes

**status:** not started.

Minimum-blast-radius slice: the four bugs that change existing behavior, isolated so they're easy to revert or hot-fix.

- `q` tag — move target slot from `person.locationOrigin` to a new optional `person.surnameAtBirth` (slot added here for this bug; full new-slot suite + migration lands in phase 4). Until phase 4 ships, the slot is unmigrated and old IDB trees keep their (wrongly-labeled) `locationOrigin` data untouched.
- ID regex — relax to `/^[A-Za-z0-9]+$/` per spec.
- Gender — accept `g o` and emit `GenderStruct { kind: "other" }`.
- Couple `m` — parse to `CoupleRecord.marriageDate` (HaracalndeDate-aware). GEDCOM serializer already reads this field, so it flows out on GEDZIP export with no further work.

Critical files:
- [apps/web/src/lib/io/familyscript/parse.ts](../../../apps/web/src/lib/io/familyscript/parse.ts)
- [apps/web/src/lib/io/familyscript/tokens.ts](../../../apps/web/src/lib/io/familyscript/tokens.ts) — extend `FS_GENDER_FROM_CODE`.
- [apps/web/src/lib/domain/types.ts](../../../apps/web/src/lib/domain/types.ts) — add `surnameAtBirth?: string` to `Person`.
- [apps/web/tests/unit/io/familyscript/parse.test.ts](../../../apps/web/tests/unit/io/familyscript/parse.test.ts) — re-baseline existing `q`-tag tests; add bug-fix tests.

DoD: per-bug fixture-based test. Existing FS test goldens that asserted `locationOrigin` from `q` are updated, not preserved. No schema bump yet (the new field is optional and reading old trees leaves it undefined).

## phase 3 — familyscript tag coverage into existing slots

**status:** not started.

Pure mapping work, no new domain slots, no schema bump. Each tag has a domain home already:

- `O` (birth order, supports decimals) → `person.birthOrder?: number`. Decimal values floor to integer or store as-is depending on what `birthOrder` allows today (verify).
- `V` / `W` / `Q` (parent set type code, values `b/a/d/s/f/r/g/o`) → `ParentRef.pedi`. Map the codes to existing `ParentPedi` values; codes outside the existing enum emit a finding but don't reject. Primary set (`m`/`f`) reads `V`; second set (`X`/`Y`) reads `W`; third set (`K`/`L`) reads `Q`.
- `X` (2nd-set mother), `Y` (2nd-set father), `K` (3rd-set mother), `L` (3rd-set father) → push additional `ParentRef`s onto `person.parentIds[]` with role mother/father and pedi from the matching `W`/`Q`.

Critical files:
- [apps/web/src/lib/io/familyscript/parse.ts](../../../apps/web/src/lib/io/familyscript/parse.ts) — extend the switch; introduce a pedi-code mapping table in `tokens.ts`.
- [apps/web/src/lib/io/familyscript/tokens.ts](../../../apps/web/src/lib/io/familyscript/tokens.ts) — add `FS_PEDI_FROM_CODE`.
- new `apps/web/tests/unit/io/familyscript/coverage.test.ts` with one fixture per tag.

DoD: a single test file walks the spec tag list and asserts each tag in this phase produces the intended domain effect. Multi-parent fixture with primary + 2nd + 3rd parent sets imports as a person with 6 `ParentRef`s carrying the correct roles + pedis. No regressions in phase-2 tests.

## phase 4 — schema bump + new optional person slots + gedcom mapping

**status:** not started.

The risky phase: new optional fields on `Person`, a schema bump, and matching GEDCOM tag mapping so the new data survives GEDZIP export.

New optional slots on `Person`:
- `givenAtBirth?: string` (FS tag `n`)
- `nickname?: string` (FS tag `N`)
- `suffix?: string` (FS tag `J`)
- `birthPlace?: string` (FS tag `v`)
- `deathPlace?: string` (FS tag `y`)

(`surnameAtBirth` was already added in phase 2; revisit no-op migration coverage here.)

- Bump `CURRENT_SCHEMA_VERSION` 3.4.0 → 3.5.0.
- Add a no-op `Migration` entry — old data is forward-compatible because all new fields are optional.
- GEDCOM serialize + parse for each new field: `nickname` → `2 NICK`; `suffix` → `2 NSFX`; `givenAtBirth` → `2 GIVN` (under a `2 NAME _BIRT` block or similar standard structure — verify against existing name-tag handling in [gedcom/parse.ts](../../../apps/web/src/lib/io/gedcom/parse.ts) and [gedcom/serialize.ts](../../../apps/web/src/lib/io/gedcom/serialize.ts)); `birthPlace` → `2 PLAC` under the `1 BIRT` block; `deathPlace` → `2 PLAC` under `1 DEAT`; `surnameAtBirth` → `2 _MAR_NAME` or `2 SURN` under a `_BIRT` name block (pick whichever existing flowed mapping is closest).
- Wire FS tags `n N J v y` to the new slots in `parseFamilyScript`.
- File unmappable FS tags into [notes/to-do.md](../../../notes/to-do.md) under a new `### family echo / familyscript coverage` heading: `e w B P t k u a C` (contact), `R` (pet), `o` (bio narrative), `G` (color label), `1-9` (custom), couple lifecycle (`r b w t n y s d a f z`, couple `g`).

Critical files:
- [apps/web/src/lib/domain/types.ts](../../../apps/web/src/lib/domain/types.ts)
- [apps/web/src/lib/domain/schema.ts](../../../apps/web/src/lib/domain/schema.ts) — bump version + migration entry.
- [apps/web/src/lib/io/gedcom/parse.ts](../../../apps/web/src/lib/io/gedcom/parse.ts), [apps/web/src/lib/io/gedcom/serialize.ts](../../../apps/web/src/lib/io/gedcom/serialize.ts) — bidirectional tag mapping.
- [apps/web/src/lib/io/familyscript/parse.ts](../../../apps/web/src/lib/io/familyscript/parse.ts) — wire the new slots.
- [notes/to-do.md](../../../notes/to-do.md) — known-gap list.

DoD: GEDZIP round-trip test for a tree carrying all five new fields (write → read → write produces equivalent content). Schema migration applied to a synthetic 3.4.0 tree returns it unchanged with `appliedMigrations: [{ from: '3.4.0', to: '3.5.0', description: ... }]`. FS fixture using all five new tags imports correctly. `notes/to-do.md` entries added with one bullet per unmappable tag family.

## phase 5 — multi-file merge + wizard polish

**status:** not started.

Wizard accepts N files (UI shows a list of dropped files; user can remove individual entries). Each file's parsed `ImportPayload` is shown as a row with filename, format badge, person count, portrait count, findings count. On Import:

- Parse all files (in parallel; collect failures inline per row).
- Left-fold via existing [`mergeTrees`](../../../apps/web/src/lib/io/merge/merge.ts). Fold order = file-drop order. This is **deterministic** so the same set of files in the same order always produces the same `bIdMap` suffixing.
- If "merge into current" is selected, the active tree is the leftmost input to the fold.
- All `PortraitBlob[]` accumulate; `persistImportPayload` writes them all and resolves `portraitBlobId` against the post-merge id map.
- Conflict findings (`ambiguous-match`, `unmatched-person`, etc.) summarize as "N conflicts" in the wizard footer with a disclosure to see the list before clicking Import.

Polish:
- Drag-drop visual states (hover-accept, hover-reject for `.exe`/folder/zero-byte).
- Error states for unrecognized files inline in their row, don't block Import for the others.
- E2E Playwright spec: open wizard, drop HTML + FS fixtures, type a name, pick merge-into-current, click Import, assert the merged tree appears under the typed name with the union of people and the HTML's portraits attached to matched persons.

Critical files:
- new `apps/web/src/lib/io/import/composeMerge.ts` — n-way left-fold helper.
- `apps/web/src/lib/components/import/ImportWizard.svelte` — full UX.
- new `apps/web/tests/e2e/import-wizard.spec.ts`.
- [apps/web/src/lib/io/merge/merge.ts](../../../apps/web/src/lib/io/merge/merge.ts) — extend `MergeSource` type to include `"html"` and `"gedzip"` so source-of-truth findings render correctly (or document why we keep the existing two values).

DoD: Playwright spec passes against a built dev server. Fold-determinism test asserts that `compose([a, b, c])` and `compose([a, b, c])` produce identical `bIdMap` keying. Three-way fixture (FS + GEDCOM + HTML, all containing the person `START`) merges with N=3 source counts surfaced as findings; portraits from the HTML side land on the matched person.

## verification

End-to-end manual smoke (after phase 5):
1. `pnpm dev` and open the app.
2. Open the import action from the menu bar (or drag a file onto the canvas).
3. Drop `My-Family-24-May-2026-103040590.html` from the repo root.
4. Confirm the wizard shows the file row with `familyecho-html` badge, person count ≈ 15, 1 portrait.
5. Type a tree name. Click Import. Confirm tree appears with the typed name and the START person's portrait shows on the card.
6. Reopen the wizard; drop a second FS fixture; select "merge into current"; click Import. Confirm union of people; conflicts surfaced as findings.

Test suites:
- `pnpm test:unit` covers parser fixtures (phase 1 / 2 / 3 / 4) and merge composition (phase 5).
- `pnpm test:e2e` covers the wizard spec (phase 5).
- `pnpm typecheck` after each phase; schema bump in phase 4 has its own targeted migration test.
- After phase 5 ships, run `pnpm verify` (the project's combined gate).
