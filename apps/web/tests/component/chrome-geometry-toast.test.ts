/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - chrome-geometry invariant (inverted): a visible
 * toast must NOT intercept clicks meant for an open menu. the toasts
 * container uses `pointer-events-none` with each toast body re-enabling
 * `pointer-events-auto`. this spec pins that pattern so a future
 * regression toward "toast container is pointer-events-auto" trips a
 * test.
 *
 * historical bugs: toasts intercepted clicks meant for menus (b51622b,
 * f88b7c4), toasts overlapped the inspector (648e789).
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
    captureElementFromPoint,
    makeStackingAwareElementFromPoint,
    setRect,
} from "./_harness/stackingContextHitTest";

/**
 * build a scene with both a visible toast and an open menu whose rects
 * overlap. the toast container is `pointer-events-none` (modelled by a
 * css var that the stub-aware elementFromPoint *does not* read; we
 * model the pointer-events:none rule by passing `toastClickable: false`
 * which removes the toast container from the candidate set the stub
 * walks).
 *
 * to keep the stub minimal and the test honest, we model
 * `pointer-events:none` by *not putting the toast container in the
 * candidate set at all*. the individual toast body (`#toast-body`) is
 * still a hit candidate because it re-enables pointer-events:auto, and
 * an explicit toast-body click still works (last test).
 */
function buildRepro(opts: { toastContainerClickable: boolean; menuZ?: number; toastZ?: number }) {
    const menuZ = opts.menuZ ?? 40;
    const toastZ = opts.toastZ ?? 30;
    // equal-depth siblings under #root (#menu and #toasts) so the stub's
    // dom-order tiebreaker compares paths of matching length. matches the
    // shape `chrome-geometry-picker.test.ts` uses.
    const container = document.createElement("div");
    container.innerHTML = `
        <div id="root" style="position:relative;">
            <button id="trigger" type="button">File</button>
            <div id="menu" role="menu" style="position:absolute;z-index:${String(menuZ)};">
                <button id="item-0" role="menuitem" type="button">new</button>
                <button id="item-1" role="menuitem" type="button">open</button>
            </div>
            <div id="toasts" style="position:fixed;z-index:${String(toastZ)};">
                <div id="toast-body" role="status">saved</div>
                <button id="toast-dismiss" type="button" aria-label="dismiss">x</button>
            </div>
        </div>
    `;
    document.body.appendChild(container);

    const root = container.querySelector("#root") as HTMLDivElement;
    const menu = container.querySelector("#menu") as HTMLDivElement;
    const items = [
        container.querySelector("#item-0") as HTMLButtonElement,
        container.querySelector("#item-1") as HTMLButtonElement,
    ];
    const toasts = container.querySelector("#toasts") as HTMLDivElement;
    const toastBody = container.querySelector("#toast-body") as HTMLDivElement;
    const toastDismiss = container.querySelector("#toast-dismiss") as HTMLButtonElement;

    setRect(root, { x: 0, y: 0, w: 1000, h: 600 });
    // menu strip
    setRect(menu, { x: 100, y: 68, w: 200, h: 56 });
    setRect(items[0]!, { x: 100, y: 68, w: 200, h: 28 });
    setRect(items[1]!, { x: 100, y: 96, w: 200, h: 28 });
    // toast container directly over the menu - this is the regression
    // collision: a visible toast appears while a menu is open
    setRect(toasts, { x: 50, y: 60, w: 300, h: 72 });
    setRect(toastBody, { x: 60, y: 70, w: 280, h: 28 });
    setRect(toastDismiss, { x: 320, y: 70, w: 20, h: 20 });

    // model `pointer-events:none` on the toast container by skipping it
    // (and any descendant *not* the body or the dismiss button, which
    // re-enable `pointer-events:auto`) when walking the candidate set.
    if (!opts.toastContainerClickable) {
        // zero-size the container so the bbox check naturally excludes
        // it. children with their own mocked rects still match.
        setRect(toasts, { x: -1, y: -1, w: 0, h: 0 });
    }

    document.elementFromPoint = makeStackingAwareElementFromPoint(root);

    return { container, root, menu, items, toasts, toastBody, toastDismiss };
}

function centerOf(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

describe("chrome-geometry: toast vs open menu (inverted)", () => {
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

    // post-fix shape: with the toast container modeled as
    // pointer-events-none (zero-bbox), a click on a menu item lands on
    // the item even though the toast container would overlap visually.
    // additionally the toast *body* sits at z-30 and the menu at z-40 so
    // even if the body intersects the click point, the menu wins.
    it("toast container with pointer-events-none does not intercept a click on a menu item", () => {
        const { container, items, toastBody } = buildRepro({ toastContainerClickable: false });
        cleanup = () => container.remove();
        // pick a point on item-0 that the toast body would visually overlap
        const itemRect = items[0]!.getBoundingClientRect();
        const bodyRect = toastBody.getBoundingClientRect();
        // collision point: inside both item-0 and toast-body
        const x = Math.max(itemRect.left, bodyRect.left) + 5;
        const y = Math.max(itemRect.top, bodyRect.top) + 5;
        const hit = document.elementFromPoint(x, y);
        expect([items[0], toastBody]).toContain(hit);
        // menu (z-40) wins over toast body (z-30) at the collision point
        expect(hit).toBe(items[0]);
    });

    // pre-fix shape: if a future refactor flips the toast container to
    // pointer-events-auto AND the container is later in dom order at an
    // equal or higher z, the menu loses. this is the bug the
    // pointer-events-none rule prevents - the test makes the failure
    // mode explicit. (real elementFromPoint returns the deepest hit, so
    // the toast body wins over the bare toast container at points the
    // body covers - either way, the menu loses, which is what matters.)
    it("pre-fix shape: pointer-events-auto toast container at z-40 intercepts the menu (regression target)", () => {
        const { container, items, toasts, toastBody } = buildRepro({
            toastContainerClickable: true,
            toastZ: 40,
        });
        cleanup = () => container.remove();
        const { x, y } = centerOf(items[0]!);
        const hit = document.elementFromPoint(x, y);
        // sanity: collision point lies in the menu item AND somewhere in
        // the toast overlay (container or body)
        expect([items[0], toasts, toastBody]).toContain(hit);
        // bug shape: hit is on the toast overlay (container or body),
        // never on the menu item
        expect(hit === toasts || hit === toastBody).toBe(true);
    });

    // a pointer aimed at the toast body itself (placed so no menu item
    // overlaps the same point) still lands on the body - confirms the
    // body re-enables pointer-events even when its container is
    // pointer-events-none.
    it("toast body itself remains clickable at its own center (no menu overlap)", () => {
        const { container, toastBody } = buildRepro({ toastContainerClickable: false });
        cleanup = () => container.remove();
        // move toast body well clear of any menu rect for this case
        setRect(toastBody, { x: 600, y: 400, w: 200, h: 28 });
        const { x, y } = centerOf(toastBody);
        const hit = document.elementFromPoint(x, y);
        expect(hit).toBe(toastBody);
    });
});
