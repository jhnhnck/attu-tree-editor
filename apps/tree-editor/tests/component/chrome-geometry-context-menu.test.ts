/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - chrome-geometry invariant: a person-card right-click
 * context menu (the floating `ContextMenu.svelte` rendered at viewport
 * coordinates) must win pointer-hit-testing against the underlying
 * canvas and sibling cards. each menu item must intercept a pointer
 * aimed at its center even when the click sits inside a later-dom-order
 * card with its own translate3d stacking context.
 *
 * Pattern parity with `chrome-geometry-picker.test.ts` and the (a) probe:
 * minimal innerHTML harness, per-element rect mocks, stacking-context-aware
 * `elementFromPoint` stub from `_harness/stackingContextHitTest.ts`,
 * installed per test and restored in afterEach.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
    captureElementFromPoint,
    makeStackingAwareElementFromPoint,
    setRect,
} from "./_harness/stackingContextHitTest";

/**
 * build the context-menu repro: a canvas containing two sibling person
 * cards each with `translate3d` (the family-view layout pattern). the
 * user right-clicks on card-a; the floating `ContextMenu.svelte` mounts
 * at the click point as a `fixed z-50` sibling of the canvas. menu items
 * are rendered as `<button role="menuitem">` rows inside it.
 *
 * historical bug class (mirrors the picker's): if the floating menu is
 * mounted *inside* a card container's translate3d stacking context, its
 * `z-50` is trapped and a later-dom-order sibling card painted over it.
 * fix: the menu mounts at the document/canvas root, NOT inside any card.
 * this repro encodes the correct mount: menu sits at the canvas root as
 * the last sibling.
 */
function buildRepro(opts: { mountInsideCard: boolean }) {
    const container = document.createElement("div");
    const menuRowsHtml = `
        <button id="menu-item-edit" type="button" role="menuitem" style="position:relative;">edit person</button>
        <button id="menu-item-delete" type="button" role="menuitem" style="position:relative;">delete person</button>
        <button id="menu-item-link" type="button" role="menuitem" style="position:relative;">add link</button>
    `;
    const menuHtml = `
        <div id="ctx-menu" role="menu" style="position:fixed;z-index:50;">
            ${menuRowsHtml}
        </div>
    `;
    container.innerHTML = `
        <div id="canvas">
            <div id="card-a" style="position:absolute;transform:translate3d(0px,0px,0);">
                <div id="card-a-body" style="position:relative;">card a body</div>
                ${opts.mountInsideCard ? menuHtml : ""}
            </div>
            <div id="card-b" style="position:absolute;transform:translate3d(0px,0px,0);">
                <div id="card-b-body" style="position:relative;">card b body</div>
            </div>
            ${opts.mountInsideCard ? "" : menuHtml}
        </div>
    `;
    document.body.appendChild(container);

    const canvas = container.querySelector("#canvas") as HTMLDivElement;
    const cardA = container.querySelector("#card-a") as HTMLDivElement;
    const cardABody = container.querySelector("#card-a-body") as HTMLDivElement;
    const cardB = container.querySelector("#card-b") as HTMLDivElement;
    const cardBBody = container.querySelector("#card-b-body") as HTMLDivElement;
    const menu = container.querySelector("#ctx-menu") as HTMLDivElement;
    const itemEdit = container.querySelector("#menu-item-edit") as HTMLButtonElement;
    const itemDelete = container.querySelector("#menu-item-delete") as HTMLButtonElement;
    const itemLink = container.querySelector("#menu-item-link") as HTMLButtonElement;

    // canvas covers the viewport
    setRect(canvas, { x: 0, y: 0, w: 1000, h: 600 });
    // card-a at the right side; user right-clicks at its right edge so the
    // menu spawns overlapping the later sibling card-b
    setRect(cardA, { x: 300, y: 200, w: 200, h: 120 });
    setRect(cardABody, { x: 300, y: 200, w: 200, h: 120 });
    // card-b painted later in dom order, sitting right of card-a, overlaps
    // the menu's footprint
    setRect(cardB, { x: 480, y: 280, w: 200, h: 120 });
    setRect(cardBBody, { x: 480, y: 280, w: 200, h: 120 });
    // menu anchored at the right-edge of card-a (490, 240), 200x100
    setRect(menu, { x: 490, y: 240, w: 200, h: 100 });
    // each item ~ 200x32, stacked
    setRect(itemEdit, { x: 490, y: 244, w: 200, h: 28 });
    setRect(itemDelete, { x: 490, y: 276, w: 200, h: 28 });
    setRect(itemLink, { x: 490, y: 308, w: 200, h: 28 });

    document.elementFromPoint = makeStackingAwareElementFromPoint(canvas);

    return { container, canvas, cardA, cardB, menu, itemEdit, itemDelete, itemLink };
}

describe("chrome-geometry: person-card context menu", () => {
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

    // each menu item must win the hit at its own center even though the
    // point sits inside card-b's translate3d footprint. this is the
    // post-fix shape: the menu mounts at the canvas root (not inside
    // any card), so its z-50 sits at the top-level stacking context and
    // beats card-b's implicit (transform-only, z=auto) context
    it("the 'edit person' item intercepts a pointer at its center", () => {
        const { container, itemEdit } = buildRepro({ mountInsideCard: false });
        cleanup = () => container.remove();
        const r = itemEdit.getBoundingClientRect();
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        // 'edit' sits in the menu-only area above card-b's top edge
        // (y=280), so this asserts the simplest mount-correctness shape
        const hit = document.elementFromPoint(cx, cy);
        expect(hit).toBe(itemEdit);
    });

    it("the 'delete person' item intercepts a pointer at its center (overlaps card-b)", () => {
        const { container, itemDelete, cardB } = buildRepro({ mountInsideCard: false });
        cleanup = () => container.remove();
        const r = itemDelete.getBoundingClientRect();
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        const pcB = cardB.getBoundingClientRect();
        // sanity: this point sits inside card-b's mocked rect so hit
        // resolution actually has to rank menu vs card-b
        expect(cx >= pcB.left && cx <= pcB.right && cy >= pcB.top && cy <= pcB.bottom).toBe(true);
        const hit = document.elementFromPoint(cx, cy);
        expect(hit).toBe(itemDelete);
    });

    it("the 'add link' item intercepts a pointer at its center (overlaps card-b)", () => {
        const { container, itemLink, cardB } = buildRepro({ mountInsideCard: false });
        cleanup = () => container.remove();
        const r = itemLink.getBoundingClientRect();
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        const pcB = cardB.getBoundingClientRect();
        expect(cx >= pcB.left && cx <= pcB.right && cy >= pcB.top && cy <= pcB.bottom).toBe(true);
        const hit = document.elementFromPoint(cx, cy);
        expect(hit).toBe(itemLink);
    });

    // a pointer aimed at a region of the menu that is *not* on any item
    // (between rows is impossible with our packed rects, so use the menu's
    // own bbox at a y that overlaps an item - sub-pixel gaps don't repro
    // in jsdom; instead assert that a pointer at the menu's top-left corner
    // - inside `menu` but on `itemEdit` - resolves to the item, not the
    // menu chrome
    it("pointer at the menu's top-left intercepts the top item, not the menu chrome", () => {
        const { container, itemEdit, menu } = buildRepro({ mountInsideCard: false });
        cleanup = () => container.remove();
        const r = menu.getBoundingClientRect();
        // 1px inside the menu's top-left - lands inside itemEdit's rect
        const hit = document.elementFromPoint(r.left + 5, r.top + 5);
        // itemEdit nests inside menu, so the deepest descendant wins by
        // dom-order tie-break (later dom index for a deeper child)
        expect(hit).toBe(itemEdit);
    });

    // historical-replay (pre-fix shape): if the menu accidentally mounts
    // inside card-a's translate3d stacking context, its z-50 is trapped
    // and card-b (later dom order, no z but its own context) wins the
    // overlap. this guards against a future refactor accidentally
    // reparenting the menu under a card.
    it("regression target: menu mounted inside a card's stacking context loses to a later sibling card", () => {
        const { container, itemDelete, cardB } = buildRepro({ mountInsideCard: true });
        cleanup = () => container.remove();
        const r = itemDelete.getBoundingClientRect();
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        const pcB = cardB.getBoundingClientRect();
        expect(cx >= pcB.left && cx <= pcB.right && cy >= pcB.top && cy <= pcB.bottom).toBe(true);
        const hit = document.elementFromPoint(cx, cy);
        // bug shape: card-b body wins because the menu's z-50 is confined
        // to card-a's translate3d context, which has no z-index of its own
        // (z=auto ≈ 0) and loses to card-b's later dom order at the root
        expect([itemDelete, cardB, cardB.querySelector("#card-b-body")]).toContain(hit);
        expect(hit).not.toBe(itemDelete);
    });
});
