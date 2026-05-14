/*
 * FamilyTreeEditor - family-view group-frame render-pass stub
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * Phase 0 of the relationship-vocabulary plan
 * (notes/plans/relationship-vocabulary.md). The group-frame pass runs
 * AFTER `place.ts` and emits convex-hull / band / ribbon frames around
 * named groups (dynasties, houses, households, factions, orders,
 * covenants).
 *
 * Today's stub: reads from `tree.groups` (which doesn't exist yet in
 * the v1 schema) and returns an empty array. Phase 6a of the
 * relationship-vocabulary plan (schema 3.2.0 -> 3.3.0) populates
 * `tree.groups` and replaces this stub with real hull / band / ribbon
 * geometry.
 *
 * The pass is wired into `FamilyViewLayout.groups` so the renderer
 * already calls into it; switching it on is a renderer-only change.
 */

import type { PersonId } from "$lib/domain/types";

export type GroupFrameKind = "hull" | "band" | "ribbon";

export type GroupKind =
    | "dynasty"
    | "house"
    | "clan"
    | "household"
    | "faction"
    | "order"
    | "covenant";

export interface GroupFrame {
    readonly id: string;
    readonly name: string;
    readonly kind: GroupKind;
    readonly frame: GroupFrameKind;
    readonly memberIds: readonly PersonId[];
}

/**
 * Phase 0 stub. Always returns an empty array.
 * Phase 6a reads `tree.groups[]` (added in schema 3.3.0) and emits one
 * `GroupFrame` per group with computed geometry derived from the
 * placed-node positions.
 */
export function buildGroups(): readonly GroupFrame[] {
    return [];
}
