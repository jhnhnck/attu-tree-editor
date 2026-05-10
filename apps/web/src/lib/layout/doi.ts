/*
 * FamilyTreeEditor - Degree-of-Interest (DOI) post-pass.
 *
 * Phase 0 walking-skeleton scaffold. `stubDoiPass` is a pass-through —
 * it returns the input `LayoutResult` unchanged, marking no clusters.
 *
 * Phase 6 replaces this with the real DOI score (`aPriori - distance`),
 * cluster-glyph collapsing for contiguous low-DOI subtrees on the
 * proband-rooted spanning out-tree, and the `ClusterGlyph.svelte`
 * renderer integration.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { LayoutResult } from "$lib/layout/engine";
import type { PersonId } from "$lib/domain/types";

/**
 * Pass-through stub. Phase 6 promotes to a real post-pass that takes
 * `(LayoutResult, focus)` and returns an annotated `LayoutResult` with
 * cluster nodes for low-DOI subtrees.
 */
export function stubDoiPass(result: LayoutResult, _focus: PersonId): LayoutResult {
    return result;
}
