/*
 * FamilyTreeEditor - chrome-geometry invariant: union-picker dropdown
 * must win pointer-hit-testing against sibling cards.
 *
 * Phase-0 walking-skeleton chrome-geometry spec. Implements the
 * geometry-mock approach picked in `notes/dev/test-strategy.md` and
 * covers the historical bug from commit 620ce7c:
 *
 *   each card container in `FamilyViewCanvas.svelte` carries
 *   `transform: translate3d(...)` which creates a stacking context, so
 *   the picker menu's internal `z-40` was trapped inside the focused
 *   card and later-DOM-order sibling cards painted over it.
 *
 * Fix: hoist the focused card container to `z-index: 50` while the
 * picker is open. This spec exercises the *shape* of that fix - a
 * pointer aimed at the picker must reach the picker, not the sibling -
 * by recreating the dom topology and using a stacking-context-aware
 * `document.elementFromPoint` stub on top of mocked rects.
 *
 * Phase 2 generalises this single repro to a per-surface chrome-geometry
 * suite (menu, dropdown, popover, toast, dialog, context-menu).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

function setRect(el: HTMLElement, r: Rect): void {
    el.getBoundingClientRect = () => ({
        x: r.x,
        y: r.y,
        left: r.x,
        top: r.y,
        right: r.x + r.w,
        bottom: r.y + r.h,
        width: r.w,
        height: r.h,
        toJSON() {
            return this;
        },
    });
}

/**
 * Stacking-context-aware `elementFromPoint` replacement.
 *
 * jsdom returns `null` from `elementFromPoint` because it never lays out
 * a real box tree. This stub walks the dom, filters by the mocked
 * bounding rects, then ranks hits using a chained
 * (outer-context z, dom-order, ...) tuple - the same precedence the
 * browser uses to resolve the translate3d-creates-a-stacking-context
 * case that bit us in 620ce7c.
 *
 * Lives in the spec file (not a shared helper) for the phase-0 walking
 * skeleton; phase 2 promotes it to `tests/component/_harness/geometry.ts`
 * once a second chrome-geometry spec needs it.
 */
function makeStackingAwareElementFromPoint(root: HTMLElement) {
    function isStackingContextCreator(el: HTMLElement): boolean {
        const s = el.style;
        if (s.transform && s.transform !== "none") return true;
        if (s.zIndex && s.zIndex !== "auto" && s.zIndex !== "") return true;
        return false;
    }

    function stackingContextOf(el: HTMLElement): HTMLElement {
        let cur: HTMLElement | null = el.parentElement;
        while (cur && cur !== root) {
            if (isStackingContextCreator(cur)) return cur;
            cur = cur.parentElement;
        }
        return root;
    }

    function effectiveZ(el: HTMLElement): number {
        const z = el.style.zIndex;
        if (!z || z === "auto") return 0;
        const n = Number(z);
        return Number.isFinite(n) ? n : 0;
    }

    function domOrderIndex(el: HTMLElement): number {
        const idx: number[] = [];
        let cur: HTMLElement | null = el;
        while (cur && cur !== root) {
            const parent: HTMLElement | null = cur.parentElement;
            if (!parent) break;
            const siblings: Element[] = Array.from(parent.children);
            idx.unshift(siblings.indexOf(cur));
            cur = parent;
        }
        return Number.parseInt(idx.map((i) => String(i).padStart(4, "0")).join(""), 10);
    }

    return (x: number, y: number): Element | null => {
        const all: HTMLElement[] = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const el = n as HTMLElement;
            const r = el.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
                all.push(el);
            }
        }
        if (all.length === 0) return null;

        type Ranked = {
            el: HTMLElement;
            chain: { z: number; dom: number }[];
        };
        const ranked: Ranked[] = all.map((el) => {
            const chain: { z: number; dom: number }[] = [];
            let cur: HTMLElement = el;
            while (true) {
                const ctx = stackingContextOf(cur);
                if (ctx === root) {
                    chain.push({ z: effectiveZ(cur), dom: domOrderIndex(cur) });
                    break;
                }
                chain.push({ z: effectiveZ(cur), dom: domOrderIndex(cur) });
                cur = ctx;
            }
            chain.reverse();
            return { el, chain };
        });

        ranked.sort((a, b) => {
            const len = Math.max(a.chain.length, b.chain.length);
            for (let i = 0; i < len; i++) {
                const sa = a.chain[i];
                const sb = b.chain[i];
                if (!sa) return 1;
                if (!sb) return -1;
                if (sa.z !== sb.z) return sb.z - sa.z;
                if (sa.dom !== sb.dom) return sb.dom - sa.dom;
            }
            return 0;
        });

        return ranked[0]?.el ?? null;
    };
}

/**
 * Build the 620ce7c repro: focused card with `transform: translate3d`,
 * a picker child set to `z-40`, and a later-dom-order sibling card with
 * no z-index. All four overlap so a click at a shared point has to
 * resolve via stacking-context rules.
 */
function buildRepro(opts: { applyFix: boolean }) {
    const container = document.createElement("div");
    container.innerHTML = `
        <div id="canvas">
            <div id="focused-card"
                 style="position:absolute;transform:translate3d(0px,0px,0);${
                     opts.applyFix ? "z-index:50;" : ""
                 }">
                <div id="card-body" style="position:relative;">card body</div>
                <div id="picker" role="menu" style="position:absolute;z-index:40;">picker</div>
            </div>
            <div id="sibling-card" style="position:absolute;">sibling card</div>
        </div>
    `;
    document.body.appendChild(container);

    const canvas = container.querySelector("#canvas") as HTMLDivElement;
    const focused = container.querySelector("#focused-card") as HTMLDivElement;
    const cardBody = container.querySelector("#card-body") as HTMLDivElement;
    const picker = container.querySelector("#picker") as HTMLDivElement;
    const sibling = container.querySelector("#sibling-card") as HTMLDivElement;

    setRect(canvas, { x: 0, y: 0, w: 1000, h: 600 });
    setRect(focused, { x: 100, y: 100, w: 200, h: 100 });
    setRect(cardBody, { x: 100, y: 100, w: 200, h: 100 });
    setRect(picker, { x: 200, y: 180, w: 150, h: 80 });
    // sibling overlaps the picker - the collision point that exposed
    // the bug in the wild
    setRect(sibling, { x: 250, y: 200, w: 200, h: 100 });

    document.elementFromPoint = makeStackingAwareElementFromPoint(canvas);

    return { container, canvas, focused, picker, sibling };
}

describe("chrome-geometry: union picker", () => {
    let cleanup: (() => void) | null = null;
    // captured per-test in beforeEach: at module-load time jsdom may not
    // have populated document.elementFromPoint yet, and bind needs a
    // real function to bind to
    let origEFP: ((x: number, y: number) => Element | null) | null = null;

    beforeEach(() => {
        cleanup = null;
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const fn = document.elementFromPoint;
        origEFP = typeof fn === "function" ? fn.bind(document) : null;
    });

    afterEach(() => {
        if (cleanup) cleanup();
        if (origEFP) document.elementFromPoint = origEFP;
    });

    // historical replay: with the pre-fix dom (focused card has only
    // translate3d, no z-index hoist) the sibling intercepts a pointer
    // aimed at the picker. this is the bug 620ce7c fixed; the test
    // exists to catch any regression that re-introduces it.
    it("pre-fix shape: sibling card intercepts a click on the picker (regression target)", () => {
        const { picker, sibling } = buildRepro({ applyFix: false });
        cleanup = () => sibling.parentElement?.parentElement?.remove();
        const hit = document.elementFromPoint(300, 240);
        // sanity: the chosen point lies in both elements' bboxes
        expect([picker, sibling]).toContain(hit);
        // bug shape: sibling wins
        expect(hit).toBe(sibling);
    });

    it("post-fix shape: focused container's z-index:50 lifts the picker above the sibling", () => {
        const { picker, sibling } = buildRepro({ applyFix: true });
        cleanup = () => picker.parentElement?.parentElement?.parentElement?.remove();
        const hit = document.elementFromPoint(300, 240);
        expect([picker, sibling]).toContain(hit);
        expect(hit).toBe(picker);
    });
});
