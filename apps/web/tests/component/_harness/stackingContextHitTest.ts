/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - test helper: stacking-context-aware elementFromPoint
 * stub + per-element bounding-rect mock. extracted from the phase-0
 * `chrome-geometry-picker.test.ts` spec once a second chrome-geometry
 * spec needed the same machinery (phase 2 menu/popover/toast/dialog/
 * context-menu suite).
 *
 * jsdom returns null from `elementFromPoint` (no box tree). these helpers
 * fake one: every element that the test cares about gets a mocked rect,
 * and the replacement `elementFromPoint` walks the dom + the synthetic
 * stacking-context chain to pick a winner the way a browser would. the
 * stacking rules model the bits that bit us in commit 620ce7c: a parent
 * with `transform != none` creates a stacking context that confines its
 * descendants' `z-index`, sibling stacking contexts compare via their
 * own z-index then dom order.
 */

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * stub `getBoundingClientRect` on a single element. unlike
 * `mountWithHostRect` (which overrides the prototype to return one rect
 * for every element) this is per-element, so a test can lay out a small
 * scene with each surface at its own position.
 */
export function setRect(el: HTMLElement, r: Rect): void {
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
 * stacking-context-aware `elementFromPoint` replacement.
 *
 * walks `root`, collects every element whose mocked rect contains
 * (x, y), then ranks them by an outermost-stacking-context-first chain
 * of (z-index, dom-order). a parent with `style.transform != none` or an
 * explicit `style.zIndex` creates a stacking context for the purpose of
 * this stub (matches the css subset the family-view canvas uses).
 *
 * install the return value as `document.elementFromPoint` for the body
 * of the test and restore the original in `afterEach`.
 */
export function makeStackingAwareElementFromPoint(
    root: HTMLElement,
): (x: number, y: number) => Element | null {
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
 * capture the live `document.elementFromPoint` so a test can restore it
 * after installing the stub. returns null if jsdom did not provide one
 * (older versions / odd test setups).
 */
export function captureElementFromPoint(): ((x: number, y: number) => Element | null) | null {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const fn = document.elementFromPoint;
    return typeof fn === "function" ? fn.bind(document) : null;
}
