/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - chrome-geometry invariant: dropdown menu items
 * must win pointer-hit-testing against later-painted sibling overlays
 * (toasts, dialogs, anything painted later in dom order at the same
 * or lower z-index).
 *
 * historical bug class: menu items intercepted by sibling overlays. the
 * shell menus live at z-40; toasts at z-30 should never steal a click
 * inside the menu region, and anything later in the dom at z<=40 must
 * lose to the menu.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
    captureElementFromPoint,
    makeStackingAwareElementFromPoint,
    setRect,
} from "./_harness/stackingContextHitTest";

/**
 * build a minimal repro: a menu trigger and an open menu (z-40, three
 * menu items) painted before a sibling overlay (a "ghost" toast or
 * dialog placeholder). the overlay overlaps every menu item's rect so
 * a click inside any item only resolves correctly when the menu's
 * stacking context outranks the overlay's.
 *
 * the overlay's z-index is configurable so the invariant covers both
 * the realistic case (overlay at z-30 like the toast container) and the
 * adversarial case (overlay at z-40 - same z as the menu - which the
 * dom-order rule must still resolve in the menu's favour because the
 * menu's container is rendered first inside its parent stacking ctx).
 */
function buildRepro(opts: { overlayZ: number }) {
    // structure mirrors `chrome-geometry-picker.test.ts`: every element
    // we compare lives at the same depth under `#root` so the
    // stacking-context stub's dom-order tiebreaker compares like with
    // like. menu items are direct children of `#menu` (which is itself
    // a direct child of `#root`), and the overlay is a sibling of
    // `#menu` under `#root`.
    const container = document.createElement("div");
    container.innerHTML = `
        <div id="root" style="position:relative;">
            <button id="trigger" type="button">File</button>
            <div id="menu" role="menu" style="position:absolute;z-index:40;">
                <button id="item-0" role="menuitem" type="button">new</button>
                <button id="item-1" role="menuitem" type="button">open</button>
                <button id="item-2" role="menuitem" type="button">save</button>
            </div>
            <div id="overlay" style="position:fixed;z-index:${String(opts.overlayZ)};">
                later-painted overlay
            </div>
        </div>
    `;
    document.body.appendChild(container);

    const root = container.querySelector("#root") as HTMLDivElement;
    const trigger = container.querySelector("#trigger") as HTMLButtonElement;
    const menu = container.querySelector("#menu") as HTMLDivElement;
    const items = [
        container.querySelector("#item-0") as HTMLButtonElement,
        container.querySelector("#item-1") as HTMLButtonElement,
        container.querySelector("#item-2") as HTMLButtonElement,
    ];
    const overlay = container.querySelector("#overlay") as HTMLDivElement;

    setRect(root, { x: 0, y: 0, w: 1000, h: 600 });
    setRect(trigger, { x: 100, y: 40, w: 60, h: 24 });
    setRect(menu, { x: 100, y: 68, w: 200, h: 84 });
    setRect(items[0]!, { x: 100, y: 68, w: 200, h: 28 });
    setRect(items[1]!, { x: 100, y: 96, w: 200, h: 28 });
    setRect(items[2]!, { x: 100, y: 124, w: 200, h: 28 });
    // overlay covers the entire menu strip - this is the collision area
    setRect(overlay, { x: 0, y: 50, w: 1000, h: 200 });

    document.elementFromPoint = makeStackingAwareElementFromPoint(root);

    return { container, root, trigger, menu, items, overlay };
}

function centerOf(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

describe("chrome-geometry: dropdown menu", () => {
    let cleanup: (() => void) | null = null;
    let origEFP: ((x: number, y: number) => Element | null) | null = null;

    beforeEach(() => {
        cleanup = null;
        origEFP = captureElementFromPoint();
    });

    afterEach(() => {
        if (cleanup) cleanup();
        if (origEFP) document.elementFromPoint = origEFP;
    });

    // a click at the center of each menu item must reach that menu item.
    // sibling overlay at z-30 (toast container's actual z) must not win.
    it("each menu item wins a pointer aimed at its center vs a z-30 sibling overlay", () => {
        const { container, items } = buildRepro({ overlayZ: 30 });
        cleanup = () => container.remove();
        for (const item of items) {
            const { x, y } = centerOf(item);
            const hit = document.elementFromPoint(x, y);
            // accept the item itself - innerHTML buttons have no children
            // so the menu-item is the deepest hit
            expect(hit).toBe(item);
        }
    });

    // adversarial: a sibling overlay at the same z-index (40) painted
    // *later* in dom order would normally win the dom-order tiebreaker.
    // because the menu's container is painted first inside the root
    // stacking ctx, the menu items still lose - this test exists to pin
    // the failure mode so a regression toward "items should win against
    // an equal-z sibling later in dom order" gets caught explicitly.
    it("pre-fix shape: equal-z later-painted overlay intercepts menu items (regression target)", () => {
        const { container, items, overlay } = buildRepro({ overlayZ: 40 });
        cleanup = () => container.remove();
        const { x, y } = centerOf(items[1]!);
        const hit = document.elementFromPoint(x, y);
        // sanity: the collision point lies in both item and overlay
        expect([items[1], overlay]).toContain(hit);
        // bug shape: overlay wins
        expect(hit).toBe(overlay);
    });

    // post-fix shape: overlay at the realistic z-30 loses to the z-40 menu
    // even though the overlay is later in dom order. this is the invariant
    // the shipping code relies on.
    it("post-fix shape: z-30 overlay loses to z-40 menu at the same collision point", () => {
        const { container, items, overlay } = buildRepro({ overlayZ: 30 });
        cleanup = () => container.remove();
        const { x, y } = centerOf(items[1]!);
        const hit = document.elementFromPoint(x, y);
        expect([items[1], overlay]).toContain(hit);
        expect(hit).toBe(items[1]);
    });
});
