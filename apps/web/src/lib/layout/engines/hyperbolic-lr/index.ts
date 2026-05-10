/*
 * FamilyTreeEditor - StubHyperbolicEngine: z=0 placeholder.
 *
 * Phase 0 walking-skeleton scaffold. Implements `LayoutEngine` by returning
 * every visible person at z=0 (the disk centre) with no edges and no
 * obstacles. Lets `HyperbolicCanvas.svelte` mount and dispatch through the
 * engine boundary without the math being implemented yet.
 *
 * Phase 5 replaces this body with Lamping–Rao recursive wedge allocation
 * (hourglass mode) once the Phase 2 spike has validated the math and
 * documented the wedge-negotiation algorithm.
 *
 * Not invoked by the worker yet (Phase 0 short-circuits hyperbolic at the
 * canvas component boundary). Defined so the file exists at its final path
 * with the final interface.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { LayoutNode, LayoutNodeId } from "$lib/layout/ir";
import type { LayoutEngine, LayoutInput, LayoutPosition, LayoutResult } from "$lib/layout/engine";

export class StubHyperbolicEngine implements LayoutEngine {
    readonly id = "hyperbolic";

    layout(input: LayoutInput): LayoutResult {
        const positions = new Map<LayoutNodeId, LayoutPosition>();
        const nodes = new Map<LayoutNodeId, LayoutNode>();
        const origin: LayoutPosition = {
            space: "hyperbolic",
            z: { re: 0, im: 0 },
        };
        for (const personId of input.visible) {
            positions.set(personId, origin);
            nodes.set(personId, {
                id: personId,
                kind: "person",
                personId,
                rank: 0,
            });
        }
        return {
            engineId: this.id,
            space: "hyperbolic",
            positions,
            edges: [],
            nodes,
            obstacles: [],
        };
    }
}
