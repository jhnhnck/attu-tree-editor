# pre-mortem - family-view debug overlay & diagnostics

**Bottom line:** proceed with revisions (folded into `plan.md` before approval).

## Risks

- **[high] premise** - phase 1's `showOffSubsetPeople` relies on subset rejection reasons that `subset.ts` may not expose. plan claims `subset.ts` is read-only, but the rationale data probably needs to be added there. either rescope `subset.ts` as in-scope, or simplify the overlay to "in-subset vs not, no reason". · **probe:** in phase 0, read `subset.ts:selectBoundedSubset` and confirm whether reasons are computed and observable from outside.
- **[high] premise** - phase 4's `showCoiBreakdown` needs per-pair `(d_i, d_j, contribution)` rows; `computeAncestorOverlap` currently returns only `{duplicates, coi}`. plan says "do not refactor `consanguinity.ts`" but the breakdown is computed inside it and discarded. either expand the return shape (small refactor, low risk) or recompute the breakdown in the overlay (duplicates work). · **probe:** in phase 0, read `consanguinity.ts:computeAncestorOverlap` and decide widen-return vs duplicate-the-walk.
- **[medium] integration** - phase 3's `logFocusEvents` needs to observe `canvasController.centerOnPerson` invocations. if the controller is called from outside FamilyViewCanvas (e.g. App.svelte handles selection-change → centerOn), the event source isn't in scope as drawn. · **probe:** trace one palette-jump call path end-to-end before phase 3; identify the single point where the centerOn intention is decided.
- **[medium] scope** - issues 1 and 3 likely share the secondary-union expansion gap. plan acknowledges this but doesn't define what triggers a phase-2 reframe. risk: phase 2 starts anyway out of inertia and builds duplicate overlays. · **probe:** codify the explicit phase-1 exit decision rule.
- **[medium] integration** - `window.__treeDebug` is currently typed by the layered engine. extending with a family-view shape + `engine` discriminator turns the type into a union, which may cascade through any code that reads `__treeDebug.*` without an engine check. · **probe:** grep tests + scripts for existing readers; confirm they all gate on `engine` or are layered-only.
- **[medium] expertise** - DoDs reference "a tree with a known floating person" / "a 3-spouse focus" / "a pedigree with hand-computed coi" but don't name fixtures. risk: no such fixture exists, producing one is a sub-project per phase. · **probe:** in phase 0, audit existing fixtures and pick a canonical one per bug class; if no fixture exists for the polygamy case, fixture creation is in phase 2's scope.
- **[low] scope** - phase 5 bundles parity overlays (grid, node-bounds, last-edit halo) with metrics readout and e2e expansion. five tasks in one phase, low cohesion. risk: phase drags and parity items get skipped. · **probe:** split phase 5 only if it grows; for now accept as-is but mark metrics readout cuttable.
- **[low] operational** - no contrast/accessibility note for new overlay colors. low priority but worth a phase-5 audit if any debug colors collide with ui chrome.

## Walking-skeleton check

**green with one revision.** phase 0 already touches every layer (`debugTypes.ts` → `FamilyViewCanvas` → `FamilyViewDebugOverlay` → `App.svelte` → e2e). one toggle (`showVisibleSubset`) paints one overlay; one toggle (`exposeFamilyDebug`) exposes the handle. that's the right shape.

**revision:** add the subset-rationale probe and the coi-breakdown probe to phase 0 DoD. without them, phases 1 and 4 each start on an unverified data-shape assumption. both probes are read-only and cheap (5-10 minutes each).

## Phase-order revisions

| original | proposed | reason |
|---|---|---|
| phase 0 wiring only | phase 0 wiring + three read-only probes (subset rationale, coi breakdown, `__treeDebug` readers) | both phase 1 and phase 4 depend on upstream data shapes that may need work; probe now, not later |
| phase order 0→1→2→3→4→5 | unchanged | risk ordering is sound; phase 1 attacks the most-uncertain root cause first |
| e2e only in phase 0 + 5 | per-phase e2e added to each DoD | "one big test at the end" tends to drift; small tests per phase keep DoDs honest |

## Definition-of-done additions

- **phase 0** - probe outcomes documented for `subset.ts` rejection reasons; probe outcome documented for `consanguinity.ts` breakdown export shape; `__treeDebug` reader grep documented; one e2e smoke landing with two assertions (toggle paints, window handle populated).
- **phase 1** - if `showOffSubsetPeople` requires modifying `subset.ts`, that modification is in this phase (scope expansion accepted now, not deferred); exit-check decision recorded - does phase 2 stand as-written or fold in.
- **phase 2** - explicit fixture named (3-spouse focus); if no fixture exists, fixture creation is part of phase 2.
- **phase 3** - palette-jump call path documented in the plan log before instrumenting (the single point where centerOn intention is decided).
- **phase 4** - decision recorded: widen `computeAncestorOverlap` return type vs duplicate the walk in the overlay; whichever ships in this phase.
- **phase 5** - each layered-parity toggle has a one-line "matches `DebugOverlay.svelte` X" reference for reviewer; metrics readout is cuttable if phase runs hot; contrast audit included.

## Adversarial sanity check

what would have to be true for the plan to ship as written?

1. family-view's `FamilyViewLayout` shape is stable enough to back every overlay — confirmed by the explore agents' map.
2. the existing ctrl+shift+d wiring in `App.svelte` is engine-aware enough that adding a `selectedEngine` branch doesn't break layered toggles — addressed by the engine-gated section refactor accepted at approval time.
3. `subset.ts` exposes rejection reasons or can be cheaply taught to — **unconfirmed; probe in phase 0**.
4. `canvasController.centerOnPerson` calls are observable from within FamilyViewCanvas — **unconfirmed; probe at phase 3 entry**.
5. `consanguinity.ts` exports enough structure for the breakdown table — **unconfirmed; probe in phase 0**.

if phase 5 explodes, the most likely upstream cause is phase 0 not actually probing - so risks 3 and 5 above are the dominant failure modes. both are mitigated by the phase-0 DoD additions.
