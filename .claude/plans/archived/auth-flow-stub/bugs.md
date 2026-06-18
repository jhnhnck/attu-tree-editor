# bugs: auth-flow-stub

## open

## closed

- pre-existing (wave 9 regressed by contentFitsInView): auto-fit-suppression-handlers + auto-fit-suppression component tests fail because at initial render with small fixtures the layout bbox fits at scale=1 pan=(0,0), so contentFitsInView() returns true and fitToView() is never called. fix: `hasInitialFit` flag in `FamilyViewCanvas.svelte`; first invocation always calls fitToView(). **fixed 2026-05-28**
- pre-existing (wave 9 resize refit): "host resize via re-fired ResizeObserver entry updates the transform" failed because the synthetic RO's synchronous `observe()` call tracked `hostW`/`hostH`/`panX`/`panY`/`scale` as `$effect` dependencies, causing the RO effect to re-run on resize and reset dims via the initial rect. fix: `untrack(() => obs.observe(el))` in FamilyViewCanvas. **fixed 2026-05-28**
- pre-existing (wave 5 regressed test): family-view-path-highlight test line 138 expected 2 cards on-path but wave 5's activeFocus guard now correctly excludes the focus/root card. fix: expect 1 card; check Calen (the selected relative) is on-path, not Aron (the focus). **fixed 2026-05-28**
- pre-existing: OpenDialog.test.ts mocked `loadTree` returning `ok(tree(...))` but `loadTree` returns `ok({ tree, savedAt })`. fix: wrap tree in the correct shape. **fixed 2026-05-28**
- pre-existing: path.test.ts had unnecessary `!` assertion on `ids[2]`. fix: removed assertion. **fixed 2026-05-28**
