# Pre-mortem — ui-invariant-tests

**Bottom line:** proceed with revisions (folded into `plan.md` before approval)

### Risks

- [high] premise — geometry-approach option (c) "assert intent only" cannot catch the historical [620ce7c](620ce7c) picker-behind-cards bug, because z-index was set correctly and `translate3d` ate the stacking context regardless of value. plan originally listed (c) as a live option. · probe: write the (c)-flavored assertion against [620ce7c](620ce7c)~1; confirm it passes when the bug is live. takes ~20 min in phase 0; eliminates one branch. **resolution:** option (c) removed from the plan during pre-mortem fold.
- [high] dependency / integration — `HyperbolicCanvas.svelte` uses real canvas2d / requestAnimationFrame / pointer-capture. mounting in jsdom likely throws on `getContext` or unmounts immediately. phase 5 parity matrix requires it to mount. · probe: phase 0 attempts bare `mount(HyperbolicCanvas, …)` and records the failure mode. if it can't mount cleanly, phase 5 ships with `expectedSkip: hyperbolic` rows or needs a happy-dom escape hatch for that engine. **resolution:** probe added to phase 0 DoD; phase 5 explicitly allows `expectedSkip` cells.
- [medium] integration — phase 3 selection-state-machine using a `mockCanvasController` would pass regardless of the real bug (the historical defect *was* the real controller's missing call). · probe: drive selection through real store + real component shells; assert against store output. **resolution:** phase 3 wording flipped to "real stores + jsdom-mounted shells; mocks last-resort with documented rationale per call site."
- [medium] premise — "80% of historical incidents reproduce as failures pre-fix" is aspirational without a sampled probe. several bugs were fixture-specific (Akarians 1802 people) or viewport-specific (Pixel 7 emulation), neither of which exists in jsdom. · probe: phase 0 picks 3 closed bugs from different clusters; replays each. if <2/3 reproduce, downgrade the success measure to "deterministic for non-viewport bug-classes." **resolution:** historical replay added to phase 0 DoD; per-phase replay already in main DoD.
- [medium] scope — phase 1 originally said "for any golden whose coverage isn't reproducible structurally, file an explicit follow-up before deletion." user explicitly said "delete all 8, no replacement." **resolution:** hedge removed; phase 1 deletes unconditionally.
- [medium] dependency — svelte 5 runes + vitest + jsdom is a young stack; new specs need richer apis (synthetic pointer dispatch with proper composedPath, mounted-and-then-portalled menus). may discover jsdom's pointer-events implementation is incomplete. · probe: in phase 0, dispatch `pointerdown` against a `position: fixed` portal-rendered menu; assert composedPath includes the menu. cheap. **resolution:** probe added implicitly to the phase-0 chrome-geometry walking-skeleton spec.
- [low] scope — phase 1b "migrate eligible e2e to jsdom" is sized vaguely; 20 specs is non-trivial. budget risk, not correctness risk. · probe: classify first; if `migrate` count > 8, split phase 1b into 1b/1c by surface. **resolution:** split-condition added to phase 1.
- [low] operational — visual-golden deletion is reversible only via git; team loses muscle memory. **resolution:** accepted; user explicit.

### Walking-skeleton check

phase 0 covers all 7 new test categories — good. **two holes filled during fold:**

1. no hyperbolic mount attempt → added to phase 0 DoD
2. no historical-incident replay → added to phase 0 DoD (forces the geometry approach to prove itself against a real bug, not a synthetic one)

post-fold verdict: walking skeleton is sufficient.

### Phase-order revisions

| original | proposed | folded? |
|---|---|---|
| phase 1 = audit + delete goldens (with "file follow-ups" hedge) | phase 1 = delete goldens unconditionally; classify e2e | yes |
| phase 5 (parity matrix) covers all 3 engines | unchanged, but DoD allows `expectedSkip: hyperbolic` cells with rationale from phase-0 probe | yes |
| phase 3 mocks canvas controller | prefers real-store + shell-mount; mocks last-resort with per-site rationale | yes |

### Definition-of-done additions

- **phase 0** — mount `HyperbolicCanvas.svelte` in jsdom; record outcome (mounts / fails / requires shim)
- **phase 0** — historical replay of [620ce7c](620ce7c) picker-behind-cards with chosen geometry approach; if it doesn't catch the bug, approach is wrong, pivot
- **phase 0** — dispatch pointer event against portal-rendered menu; confirm composedPath shape jsdom emits
- **phase 1** — drop the "file follow-ups" hedge per user instruction
- **phase 3** — for each entry-point test, document whether it uses real or mocked canvas controller and why
- **phase 5** — `expectedSkip` cells carry a non-empty one-line rationale; matrix harness asserts presence
- **all phases** — per-phase historical-incident replay against 3 closed `notes/bugs.md` entries from that phase's cluster (already in main DoD)
