# route.ts stub-emission audit (Phase 0b, 14 May 2026)

Audit of [apps/web/src/lib/layout/passes/route.ts](../../apps/web/src/lib/layout/passes/route.ts)
in support of [layered-and-tooling.md](../plans/layered-and-tooling.md)
Phase 1 bug-17 fix. Also covers the client-side force-conflict knob
needed for Phase 3.

## Stub-emission paths

There are two distinct branches in `route.ts buildSegments()` that
emit `/stub-l` + `/stub-r` segment pairs. Both gate on the same
threshold; the bug 17 symptom only arises from path A.

### A. Same-rank horizontal bond (route.ts:376-417)

The same-rank branch decides the bond shape from a single check:

```ts
const maxBondSpan = Math.min(MAX_BOND_SPAN_CEILING, placed.bbox.width / 4);
// ...
const bondSpan = leftX(r) - rightX(l);        // gap between inner edges
const isLongBond = bondSpan > maxBondSpan;

if (isLongBond) {
    out.push({ id: `${bondIdBase}/stub-l`, kind: "stub", ... });
    out.push({ id: `${bondIdBase}/stub-r`, kind: "stub", ... });
} else {
    out.push({ id: bondIdBase, kind: "bond", x1: rightX(l), x2: leftX(r), ... });
}
```

`MAX_BOND_SPAN_CEILING = 25` units. `placed.bbox.width / 4` is the
active term on small trees; on Akarians (`bbox.width` ≈ several
hundred units) the ceiling dominates.

When `isLongBond`, the subsequent parent-drop emerges at the
children-centroid x (not the bond midpoint) so the drop lands near
its family rather than floating in empty canvas space.

### B. L-bond (cross-rank, route.ts:533-597)

The cross-rank branch always emits two vertical legs (`/v1`, `/v2`)
and a horizontal cross-piece between them. The cross-piece is
stubbed under the same `Math.abs(lx - ux) > maxBondSpan` check:

```ts
if (Math.abs(lx - ux) > maxBondSpan) {
    out.push({ id: `${bondIdBase}/stub-l`, ... });
    out.push({ id: `${bondIdBase}/stub-r`, ... });
} else {
    out.push({ id: `${bondIdBase}/h`, ... });
}
```

## Bug 17 root cause — different from the bug-log text

The [bugs.md:17](../bugs.md#L17) text describes the defect as a
*consequence* of off-center children — "the children's centroid
differs from the bond midpoint" — and names the suffix `:1/stu`.

**Both are inaccurate against current code.**

- **Suffix:** the actual current suffixes are `/stub-l` and `/stub-r`
  (set 9 May 2026 in commit dac9074-era refactor). The `:1/stu` form
  belonged to an earlier version of the code.
- **Cause:** the children-centroid is consulted *only* for the
  parent-drop x in the long-bond branch — `bondX = group.kids.reduce(...
  / group.kids.length`. It does NOT cause the bond to split. The
  bond splits because `bondSpan > maxBondSpan` is true, and on
  small fixtures the active threshold is `bbox.width / 4`, not
  the 25-unit ceiling.

The 8-person `eightPersonFamily()` repro from
`apps/web/tests/fixtures/layered-bug-repros.ts` triggers path A
because the 8-person tree's bbox is small (~14u wide), giving
`maxBondSpan ≈ 3.5u` — any couple whose `bondSpan` exceeds 3.5u
becomes two stubs. The Korak+Wife couple has children pulling
`bondSpan` past that threshold; Moma+Dada (single child Korak)
stays under.

## Phase 1 fix consequence

The plan's Phase 1 fix as written ("when both partners are at the
same rank, emit one continuous bond") is a **no-op** for the actual
code — the same-rank branch *already* emits one continuous bond
when `!isLongBond`. The real fix is to **floor the threshold** so
small bboxes don't trigger path A on short bonds.

Proposed Phase 1 fix (revised from rev 1):

```ts
// Floor maxBondSpan at 8 * ROW_H (matches BUNDLE_THRESHOLD, the
// "long horizontal bond" threshold used by Holten bundling). Below
// this span the bond is never visually "long" no matter how small
// the tree, so it should never be stubbed.
const maxBondSpan = Math.min(
    MAX_BOND_SPAN_CEILING,
    Math.max(BUNDLE_THRESHOLD, placed.bbox.width / 4),
);
```

Effects:
- 8-person fixture: `maxBondSpan = max(8*1, 3.5) = 8u`. Korak+Wife
  bond span is well under 8u → bond is a single segment. Bug 17
  fixed.
- 1802-person Akarians: `maxBondSpan = min(25, max(8, bbox.width/4))`
  = 25 (ceiling still dominates). No regression.
- Cross-rank L-bond: same threshold, same floor. Legitimate
  long-bond stubs (truly distant couples) still emit correctly.

**This fix does NOT need the "same-rank rule" the plan describes.**
The bug is in the threshold's lower bound, not in the rank check.

## What Phase 1 must not break

1. **L-bond stubs (path B) when partners are far apart in x.** Real
   cross-rank long bonds should keep stubbing. The fix above
   preserves path B because `MAX_BOND_SPAN_CEILING` and
   `BUNDLE_THRESHOLD` are both used as ceilings/floors of the same
   `maxBondSpan`, applied symmetrically to both paths.

2. **Long-bond children-centroid drop x.** When a bond IS long, the
   parent-drop anchors at children-centroid (not bond midpoint) to
   stay near the family. The fix only changes when bonds are
   classified as long; the post-classification geometry is unchanged.

3. **Bundle threshold (separate concern).** `BUNDLE_THRESHOLD =
   8 * ROW_H` is also the "long horizontal bond" threshold used by
   `bundleLongBonds()` for Holten-style bundling. Reusing it as the
   floor for `maxBondSpan` keeps both concepts aligned: a bond is
   "long enough to bundle" iff it's "long enough to stub."

## Force-conflict client-side knob (Phase 3 dependency)

The server has no force-conflict endpoint
([routers/trees.py:111](../../apps/server/attu_tree/routers/trees.py#L111));
409 is triggered when the client's `expected_revision` doesn't match
server state.

The client-side knob is **`syncStore.setRevision(n)`** in
[apps/web/src/lib/state/sync.svelte.ts](../../apps/web/src/lib/state/sync.svelte.ts):

```ts
setRevision(rev: number) {
    revision = rev;
    mode = "local";
}
```

To force a conflict in Phase 3's debug toolbox:

```ts
const current = syncStore.revision;
if (current !== null && current > 0) {
    syncStore.setRevision(current - 1);  // inject stale expectation
    // next autosave PUT will send expected_revision = current - 1
    // server compares to actual current → 409 → mode = "conflict"
}
```

Preconditions:
- user is signed in (`authStore.user` truthy)
- tree is server-loaded (`syncStore.revision !== null`)
- tree has been saved at least once (`revision > 0`)

If any precondition fails, the "force conflict" button is disabled
with a hover-title explaining why. No new server endpoint or env
gating is needed.

## Conclusion

- Phase 1 (bug 17): single-line edit at `route.ts:296`, floor
  `maxBondSpan` at `BUNDLE_THRESHOLD`. Plan body's "same-rank rule"
  is unnecessary.
- Phase 1 (bug 18): unchanged — tie-break in `order.ts`.
- Phase 3 (force-conflict): client-side knob is
  `syncStore.setRevision(revision - 1)`. No server work needed.

Plan-revise step at end of Phase 0 should fold these into the Phase
1 body.
