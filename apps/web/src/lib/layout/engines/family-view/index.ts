/*
 * FamilyTreeEditor - FamilyViewEngine: bounded-window default view.
 *
 * Phase 1 promotion of the Phase 0 walking skeleton. Wraps
 * `computeLayout` to expose the engine's family-view-specific shape
 * (`FamilyViewLayout`) to the renderer. The shared `LayoutEngine`
 * contract (positions + edges) is intentionally not consumed here yet
 * — `FamilyViewCanvas` reads the richer `FamilyViewLayout` so the
 * couple-box geometry, union anchors, and (Phase 1+) collapse badges
 * survive to the renderer.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { computeLayout, type LayoutOptions } from "$lib/layout/engines/family-view/layout";
import type { FamilyViewLayout } from "$lib/layout/engines/family-view/types";
import type { PersonId, Tree } from "$lib/domain/types";

export interface FamilyViewInput {
    readonly tree: Tree;
    readonly focus: PersonId;
    readonly options?: LayoutOptions;
}

export class FamilyViewEngine {
    readonly id = "family-view";

    layout(input: FamilyViewInput): FamilyViewLayout {
        return computeLayout(input.tree, input.focus, input.options ?? {});
    }
}

export { selectBoundedSubset } from "$lib/layout/engines/family-view/subset";
export type { RankedSubset, RejectionReason } from "$lib/layout/engines/family-view/subset";
export {
    computeLayout,
    CARD_H,
    AUTO_COLLAPSE_THRESHOLD,
} from "$lib/layout/engines/family-view/layout";
export type { LayoutOptions } from "$lib/layout/engines/family-view/layout";
export {
    useExpansionState,
    expansionStorageKey,
    clearAllExpansion,
} from "$lib/layout/engines/family-view/expansion";
export { usePath, badgeOnPath } from "$lib/layout/engines/family-view/path";
export type { PathHighlight } from "$lib/layout/engines/family-view/path";
export {
    usePrimaryUnionState,
    primaryUnionStorageKey,
    clearAllPrimaryUnion,
    defaultPrimaryUnion,
    unionsOf,
} from "$lib/layout/engines/family-view/primaryUnion";
export type { PrimaryUnionState } from "$lib/layout/engines/family-view/primaryUnion";
export {
    orientCouple,
    orientByIds,
    resolvePrimary,
    primaryPartnerOf,
    primaryChildrenOf,
    unionCount,
    otherUnionsOf,
    resolveRenderablePair,
} from "$lib/layout/engines/family-view/couples";
export type { OrientedCouple, RenderablePair } from "$lib/layout/engines/family-view/couples";
export type {
    FamilyViewLayout,
    FamilyViewNode,
    FamilyViewEdge,
    FamilyViewEdgeRole,
    MultiUnionMate,
    UnionAnchor,
    BadgeNode,
} from "$lib/layout/engines/family-view/types";
