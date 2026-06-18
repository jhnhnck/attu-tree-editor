// SPDX-License-Identifier: MIT

// phase-0 invariant test for the data-canvas-chrome decision on popped-
// out window wrappers. proves that a popped-out box at the canonical
// cascade origin (host.right - 320, host.top + 60) contributes a
// non-trivial top inset when it carries `data-canvas-chrome` (which
// pulls visible-viewport content downward — wrong for the "drag aside
// to reference" use case) and ZERO inset when it does not.
//
// the verdict ("popped-out wrappers do NOT carry data-canvas-chrome")
// is baked into `WindowOverlay.svelte` and recorded in plan log.md.
// this test pins the load-bearing math so any future refactor of
// `measureCanvasChromeInsets` that flipped the carved-side selection
// would re-surface the decision instead of silently regressing it.

import { afterEach, describe, expect, it } from "vitest";
import { measureCanvasChromeInsets } from "@attu/ui";

// jsdom does not compute layout; getBoundingClientRect returns
// zero-size rects by default. patch each element's rect with the
// fixed values the probe and overlay use so the math runs against
// the real fitMath code path.
function stubRect(el: HTMLElement, rect: Partial<DOMRect>): void {
    const r: DOMRect = {
        x: rect.x ?? 0,
        y: rect.y ?? 0,
        width: rect.width ?? 0,
        height: rect.height ?? 0,
        top: rect.top ?? rect.y ?? 0,
        left: rect.left ?? rect.x ?? 0,
        right: (rect.left ?? rect.x ?? 0) + (rect.width ?? 0),
        bottom: (rect.top ?? rect.y ?? 0) + (rect.height ?? 0),
        toJSON: () => ({}),
    };
    el.getBoundingClientRect = (): DOMRect => r;
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("popped-out window data-canvas-chrome contribution", () => {
    it("ZERO insets when popped-out wrapper does NOT carry data-canvas-chrome (chosen behaviour)", () => {
        // host is 1440x900 at (0,0). popped-out box sits at
        // (host.right - 320, host.top + 60) = (1120, 60), 320 wide,
        // 150 tall. without the attribute, measureCanvasChromeInsets
        // sees no chrome producers and returns ZERO_INSETS.
        const main = document.createElement("main");
        const host = document.createElement("div");
        host.setAttribute("data-canvas-host", "");
        const popOut = document.createElement("div");
        // intentionally omit data-canvas-chrome
        host.appendChild(popOut);
        main.appendChild(host);
        document.body.appendChild(main);
        stubRect(host, { x: 0, y: 0, width: 1440, height: 900 });
        stubRect(popOut, { x: 1120, y: 60, width: 320, height: 150 });

        const insets = measureCanvasChromeInsets(host);
        expect(insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it("non-trivial inset when wrapper DOES carry data-canvas-chrome (rejected behaviour)", () => {
        // same geometry, attribute present. the fitMath anchor-side
        // selection picks the side with the smaller penetration: the
        // box sits in the top-right corner of the host, so its
        // vertical-from-top (~210) and horizontal-from-right (~320)
        // pair has top < right; the box's vertical penetration (210)
        // is smaller than its horizontal (320), so it lands as a top
        // inset. this is the behaviour we are rejecting — it pulls
        // visible-viewport content downward, out from under the
        // window the user just dragged aside to see.
        const main = document.createElement("main");
        const host = document.createElement("div");
        host.setAttribute("data-canvas-host", "");
        const popOut = document.createElement("div");
        popOut.setAttribute("data-canvas-chrome", "");
        host.appendChild(popOut);
        main.appendChild(host);
        document.body.appendChild(main);
        stubRect(host, { x: 0, y: 0, width: 1440, height: 900 });
        stubRect(popOut, { x: 1120, y: 60, width: 320, height: 150 });

        const insets = measureCanvasChromeInsets(host);
        // the rejected behaviour: chrome-on charges the box as a top
        // inset of ~210px (host.top - r.bottom, where r.bottom = 210).
        // we don't pin the exact pixel since fitMath's tie-break math
        // could shift by 1px under refactor; the test's contract is
        // "non-zero penetration on at least one edge" — which is the
        // contrast against the zero-inset case above.
        expect(insets.top + insets.right + insets.bottom + insets.left).toBeGreaterThan(100);
    });
});
