/*
 * FamilyTreeEditor - family-view overlay render-pass stub
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * Phase 0 of the relationship-vocabulary plan
 * (notes/plans/relationship-vocabulary.md). The overlay pass runs AFTER
 * the skeleton route pass and emits non-skeletal edges:
 *
 *  - sworn-bond / oath / ritual edges (chained stroke)
 *  - transformation / reincarnation / merge / split / alias identity arcs
 *  - severance decorations on existing skeleton edges
 *
 * Today's stub: reads from `tree.relationships` (which doesn't exist yet
 * in the v1 schema) and returns an empty array. Phase 4 of the
 * relationship-vocabulary plan (schema 3.0.0 -> 3.1.0) populates
 * `tree.relationships` and replaces this stub with real routing.
 *
 * The pass is wired into `FamilyViewLayout.overlays` so the renderer
 * already calls into it; switching it on is a renderer-only change.
 */

import type { PersonId } from "$lib/domain/types";

/** Kinds of overlay segment the renderer knows about. None are emitted in v1. */
export type OverlayKind =
    | "sworn-bond"
    | "oath"
    | "ritual"
    | "transformed-from"
    | "reincarnated-as"
    | "merged-from"
    | "split-into"
    | "alias-of"
    | "severance";

export interface OverlaySegment {
    readonly id: string;
    readonly kind: OverlayKind;
    readonly sourceIds: readonly PersonId[];
    readonly targetIds: readonly PersonId[];
}

/**
 * Phase 0 stub. Always returns an empty array.
 * Phase 4 reads `tree.relationships[]` (added in schema 3.1.0) and
 * emits one or more `OverlaySegment` entries per relationship record.
 */
export function buildOverlays(): readonly OverlaySegment[] {
    return [];
}
