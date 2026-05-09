/*
 * FamilyTreeEditor - EdgeLayer renders divorced stub caps with a non-dashed
 * class. Regression test for the cap-dasharray bug: stub caps used to inherit
 * `.edge-divorced { stroke-dasharray: 6 4 }` from their role, leaving the
 * tiny cap mark invisible (the dash gap was longer than the cap itself).
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { render, type RenderResult } from "@testing-library/svelte";
import EdgeLayer from "$lib/components/tree/EdgeLayer.svelte";
import type { RenderedSegment } from "$lib/components/tree/edges";

/**
 * Minimal divorced-couple bond expressed as two stub segments — the shape
 * `route()` emits when the bond span exceeds the bond-stub threshold.
 */
function divorcedStubPair(): RenderedSegment[] {
    return [
        {
            id: "bond:A|B:0/stub-l",
            kind: "stub",
            role: "divorced",
            x1: 0,
            y1: 50,
            x2: 60,
            y2: 50,
        },
        {
            id: "bond:A|B:0/stub-r",
            kind: "stub",
            role: "divorced",
            x1: 940,
            y1: 50,
            x2: 1000,
            y2: 50,
        },
    ];
}

function paths(rendered: RenderResult<typeof EdgeLayer>): SVGPathElement[] {
    return Array.from(rendered.container.querySelectorAll("path"));
}

describe("EdgeLayer — stub-cap dasharray regression", () => {
    it("renders divorced-stub caps with the dedicated solid class, not edge-divorced", () => {
        const rendered = render(EdgeLayer, { edges: divorcedStubPair() });
        const allPaths = paths(rendered);
        const capPaths = allPaths.filter((p) => p.classList.contains("edge-stub-cap"));
        // Exactly one cap path is emitted per role bucket (here, divorced).
        expect(capPaths.length).toBe(1);
        // The cap path must NOT carry the divorced class — that would re-introduce
        // the dash inheritance and make the caps invisible again.
        for (const p of capPaths) {
            expect(p.classList.contains("edge-divorced")).toBe(false);
        }
    });

    it("married-couple stub caps also use edge-stub-cap (consistent across roles)", () => {
        const married: RenderedSegment[] = divorcedStubPair().map((s) => ({
            ...s,
            role: "married",
        }));
        const rendered = render(EdgeLayer, { edges: married });
        const capPaths = paths(rendered).filter((p) =>
            p.classList.contains("edge-stub-cap"),
        );
        expect(capPaths.length).toBe(1);
        // Married has no dasharray, but we still want the dedicated class so
        // future role-level styling can't accidentally regress the bug.
        for (const p of capPaths) {
            expect(p.classList.contains("edge-married")).toBe(false);
        }
    });

    it("does not emit a cap path when there are no stub segments", () => {
        const justBonds: RenderedSegment[] = [
            {
                id: "bond:C|D:0",
                kind: "bond",
                role: "married",
                x1: 0,
                y1: 50,
                x2: 100,
                y2: 50,
            },
        ];
        const rendered = render(EdgeLayer, { edges: justBonds });
        const capPaths = paths(rendered).filter((p) =>
            p.classList.contains("edge-stub-cap"),
        );
        expect(capPaths.length).toBe(0);
    });
});
