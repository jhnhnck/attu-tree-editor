/*
 * FamilyTreeEditor - HyperbolicEngine: Lamping–Rao hourglass over the
 * proband-rooted spanning trees.
 *
 * Phase 5 promotion of the Phase 0 stub. Implements `LayoutEngine` by
 * dispatching to `layoutHourglass()` and adapting the result to
 * `LayoutResult`. The renderer dispatches on `result.space === "hyperbolic"`
 * to mount HyperbolicCanvas.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { LayoutEngine, LayoutInput, LayoutResult } from "$lib/layout/engine";
import { layoutHourglass } from "$lib/layout/engines/hyperbolic-lr/layout";

export class HyperbolicEngine implements LayoutEngine {
    readonly id = "hyperbolic";

    layout(input: LayoutInput): LayoutResult {
        const { tree, visible, focus } = input;
        const out = layoutHourglass(tree, focus, visible);
        return {
            engineId: this.id,
            space: "hyperbolic",
            positions: out.positions,
            edges: out.edges,
            nodes: out.nodes,
            obstacles: out.obstacles,
        };
    }
}

/**
 * Legacy alias retained for one cycle so the worker dispatch table (which
 * referenced `StubHyperbolicEngine`) keeps importing without breakage
 * during the Phase-5 rollout. Delete when the worker imports `HyperbolicEngine`.
 */
export { HyperbolicEngine as StubHyperbolicEngine };
