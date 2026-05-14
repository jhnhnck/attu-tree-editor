/*
 * FamilyTreeEditor - FamilyViewEngine: bounded-window default view.
 *
 * Phase 0 walking skeleton. Wraps `selectBoundedSubset` + `computeLayout`
 * to expose the engine's family-view-specific shape (`FamilyViewLayout`)
 * to the renderer. The shared `LayoutEngine` contract (positions + edges)
 * is intentionally not consumed here yet — `FamilyViewCanvas` reads the
 * richer `FamilyViewLayout` so the couple-box geometry and union anchors
 * survive to the renderer. Phase 6 may flatten this through `LayoutResult`
 * once the cross-engine renderer abstraction is exercised by all three
 * engines.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { computeLayout } from "$lib/layout/engines/family-view/layout";
import { selectBoundedSubset } from "$lib/layout/engines/family-view/subset";
import type { FamilyViewLayout } from "$lib/layout/engines/family-view/types";
import type { PersonId, Tree } from "$lib/domain/types";

export interface FamilyViewInput {
    readonly tree: Tree;
    readonly focus: PersonId;
}

export class FamilyViewEngine {
    readonly id = "family-view";

    layout(input: FamilyViewInput): FamilyViewLayout {
        const subset = selectBoundedSubset(input.tree, input.focus);
        return computeLayout(input.tree, subset, input.focus);
    }
}

export { selectBoundedSubset } from "$lib/layout/engines/family-view/subset";
export { computeLayout, CARD_H } from "$lib/layout/engines/family-view/layout";
export type {
    FamilyViewLayout,
    FamilyViewNode,
    FamilyViewEdge,
    FamilyViewEdgeRole,
    UnionAnchor,
} from "$lib/layout/engines/family-view/types";
