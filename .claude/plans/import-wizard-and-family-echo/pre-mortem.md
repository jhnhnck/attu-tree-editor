# pre-mortem — import wizard + family echo coverage

Red-team review of the draft plan, run before phase 1 work begins. Risks below were folded into [plan.md](plan.md); this file is the audit trail.

## walking skeleton verdict — one layer short, fixed in revision

Initial draft had phase 0 wrapping the existing silent flow in a dialog. That touched UI → routing → parser → IDB → renderer **for single file only, with no portrait payload**. The scariest one-way decision — the `ImportPayload`-with-portraits shape flowing from parser to `putBlob` to `treeStore.reset` — wasn't exercised until phase 1.

**Resolution:** phase 0 was expanded to land both the dialog frame AND the `ImportPayload` contract AND portrait persistence end-to-end. The existing GEDZIP-drops-portraits bug becomes a side-effect fix of locking the payload contract early. Tree-name field and replace-vs-merge radio also moved into phase 0, since they're skeleton-shape (UX surface that constrains downstream phases), not polish.

## phase order

Portraits-first is correct, but the stronger reason is **the `ImportPayload` shape is a one-way schema decision that constrains phases 1 and 5**. If HTML import landed first with ad-hoc portrait pairing, a phase-1 refactor would cascade back through it. Naming the phase "lock the import payload contract" rather than "fix the portrait bug" reframes the priority.

Multi-file merge was considered for an earlier slot — rejected because `mergeTrees` already exists and is tested. Left-folding a tested pairwise merge is mechanical. The genuinely uncertain pieces of phase 5 are conflict-findings UX and **identity stability across folds**: `mergeTrees`' `ensureFreshId` appends `-2 / -3` suffixes, so fold order matters for resulting IDs. Captured as a phase-5 DoD line (deterministic-fold assertion).

## hidden coupling

**FS round-trip and `r` tag.** Initial worry: the FS parser drops unknown tags into `extras`, which a serializer would re-emit verbatim. If phase 1 consumes `r` (imageid → portraitBlobId) without symmetric emission, FS round-trip silently loses portrait links. **Resolved as moot:** the FS serializer was retired (only `parse.ts` + `tokens.ts` exist in `lib/io/familyscript/`). No round-trip asymmetry concern.

**Schema bump and GEDZIP round-trip.** Adding `nickname / suffix / surnameAtBirth / birthPlace / deathPlace` to `Person` means the GEDCOM serializer ([gedcom/serialize.ts](../../../apps/web/src/lib/io/gedcom/serialize.ts)) and parser ([gedcom/parse.ts](../../../apps/web/src/lib/io/gedcom/parse.ts)) need updated tag mapping or those fields evaporate on export. Existing serialize tests will pass (no fixture has the new fields) — a **false green**. Phase 4 DoD updated: "GEDCOM tag mapped both ways" rather than "round-trip tests pass."

**Schema migration registry.** Phase 4 bumps the version. The `migrations` array at [schema.ts](../../../apps/web/src/lib/domain/schema.ts) needs a 3.4.0 → 3.5.0 entry that's a no-op for old data (all new fields optional). Easy to forget; users with persisted IDB trees from prior versions break otherwise. Migration entry is now an explicit phase 4 deliverable.

**Couple `marriageDate` already in the domain but unused by the renderer.** Phase 2 wires FS couple `m` → `CoupleRecord.marriageDate`. GEDCOM serialize/parse already reads this field, so it flows out on export with no further work. The renderer may or may not display it today; phase 2 lands the data capture, UI exposure is downstream.

**Merge + portraits.** `mergeFields` keeps the target's `portraitBlobId` and only fills it from the source when target lacks one. With three-way left-fold this leaves orphaned blobs in IDB when a non-winning source contributed a portrait. **Accepted risk:** documented in plan's `accepted risks` section. Existing `gcUnreferencedBlobs` pass can sweep later. Not a phase-5 blocker.

**`MergeSource` type only covers `"familyscript" | "gedcom"`.** HTML imports need a source tag (either `"html"` or transparently `"familyscript"` since the payload is FS). Findings UX will display source-of-truth incorrectly if HTML gets tagged as FS. Trivial fix; added to phase 5 critical-files list.

## DoD specificity

Initial draft had vague phase DoDs ("wizard works", "merge works"). Tightened to:

- **Phase 0:** portraits **actually appear on cards** for GEDZIP fixture; existing FS / GEDCOM / GEDZIP fixtures load with identical person counts to today; silent-import code paths **deleted**, not bypassed.
- **Phase 1:** canonical `My-Family-24-May-2026-103040590.html` imports; portraits land on matched cards; FE imageid does **not** appear on persisted Person (no leaky import metadata).
- **Phase 2:** per-bug fixture; existing `q`-tag goldens updated (intentional behavioral change).
- **Phase 3:** spec-walking coverage test, one assertion per tag; multi-parent fixture with primary + 2nd + 3rd parent sets produces 6 `ParentRef`s.
- **Phase 4:** GEDZIP round-trip test for tree carrying all five new fields; explicit migration entry test; one bullet per unmappable tag family in `notes/to-do.md`.
- **Phase 5:** Playwright spec passes; fold-determinism test asserts `compose([a, b, c])` and `compose([a, b, c])` produce identical `bIdMap` keying.

## the `q` reassignment risk

This is the single most dangerous change in the plan. Three populations of existing data carry surname-at-birth values in `person.locationOrigin`:

1. **Future FS imports** — correct after the fix, no migration needed.
2. **FS files on user disks** — moot: no FS serializer exists, so the editor has never written FS files containing `q` data.
3. **Already-persisted IDB trees** — `locationOrigin` field contains data that **might** be surname-at-birth (if imported from FS) OR a genuine location (if typed in the inspector). No heuristic safely distinguishes these.

**Decision:** do not auto-migrate. Land the fix, add a release note, and offer a one-shot "move locationOrigin → surnameAtBirth" dev-console command in the inspector (or as a debug menu item) for users to opt into. Auto-migration would silently corrupt trees where the user **did** legitimately set `locationOrigin`.

## scope decisions

**Phase 3 was split** — initial single phase combined parser bug fixes, schema bump, and tag coverage. Three different blast radii. Split into:

- phase 2: parser bug fixes only (smallest radius; easy revert)
- phase 3: tag coverage into existing slots (medium radius; mechanical)
- phase 4: schema bump + new slots + GEDCOM mapping (largest radius; touches migration system)

**Phase 5 was compressed** — drag-drop visual states, error rows, and the e2e spec stayed in phase 5; tree-name field and replace-radio moved into phase 0. Net phase count: 6 (0 through 5).

## bottom line

Plan is sound to start. The walking skeleton is real (portrait persistence through IDB is the load-bearing layer; phase 0 proves it). Phase ordering puts the constraining decisions early. The single semantic-flip change (`q` mapping) is isolated to phase 2 and explicitly chooses not to auto-migrate.
