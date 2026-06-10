/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - chrome-geometry invariant: modal dialog (open-dialog
 * shape) must intercept pointer hits over its surface, and its backdrop
 * must intercept clicks outside the dialog content so page content
 * underneath can never receive a click while the modal is open.
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
 * build a minimal repro of the modal-dialog shape used by `OpenDialog`,
 * `ShareDialog`, `SettingsDialog`, etc. - a `fixed inset-0 z-50` backdrop
 * wrapping a centered content panel with interactive children (header
 * close, a row button, footer buttons). underneath sits "page content"
 * with its own `translate3d` stacking context to mimic the family-view
 * canvas the dialog opens on top of - the historical bug class for
 * dialogs is the same as for the picker: a sibling card painted later in
 * dom order winning a hit aimed at the dialog content because the
 * dialog's z-index is trapped inside an unrelated stacking context.
 *
 * the dialog backdrop's `z-50` plus its `fixed inset-0` rect must
 * outrank every page-content sibling regardless of dom order or
 * transform on the page content.
 */
function buildRepro() {
    const container = document.createElement("div");
    container.innerHTML = `
        <div id="root">
            <div id="page">
                <div id="page-card-a" style="position:absolute;transform:translate3d(0px,0px,0);">
                    <div id="page-card-a-body" style="position:relative;">card a body</div>
                </div>
                <div id="page-card-b" style="position:absolute;transform:translate3d(0px,0px,0);">
                    <div id="page-card-b-body" style="position:relative;">card b body</div>
                </div>
            </div>
            <div id="dialog-backdrop" style="position:fixed;z-index:50;">
                <div id="dialog-panel" style="position:relative;">
                    <header id="dialog-header" style="position:relative;">
                        <button id="dialog-close" type="button" style="position:relative;">close</button>
                    </header>
                    <div id="dialog-body" style="position:relative;">
                        <button id="dialog-row" type="button" style="position:relative;">row</button>
                        <input id="dialog-input" type="text" style="position:relative;" />
                    </div>
                    <footer id="dialog-footer" style="position:relative;">
                        <button id="dialog-cancel" type="button" style="position:relative;">cancel</button>
                        <button id="dialog-ok" type="button" style="position:relative;">ok</button>
                    </footer>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(container);

    const root = container.querySelector("#root") as HTMLDivElement;
    const pageCardA = container.querySelector("#page-card-a") as HTMLDivElement;
    const pageCardABody = container.querySelector("#page-card-a-body") as HTMLDivElement;
    const pageCardB = container.querySelector("#page-card-b") as HTMLDivElement;
    const pageCardBBody = container.querySelector("#page-card-b-body") as HTMLDivElement;
    const backdrop = container.querySelector("#dialog-backdrop") as HTMLDivElement;
    const panel = container.querySelector("#dialog-panel") as HTMLDivElement;
    const header = container.querySelector("#dialog-header") as HTMLElement;
    const closeBtn = container.querySelector("#dialog-close") as HTMLButtonElement;
    const body = container.querySelector("#dialog-body") as HTMLDivElement;
    const row = container.querySelector("#dialog-row") as HTMLButtonElement;
    const input = container.querySelector("#dialog-input") as HTMLInputElement;
    const footer = container.querySelector("#dialog-footer") as HTMLElement;
    const cancel = container.querySelector("#dialog-cancel") as HTMLButtonElement;
    const ok = container.querySelector("#dialog-ok") as HTMLButtonElement;

    // root viewport - 1024 x 768
    setRect(root, { x: 0, y: 0, w: 1024, h: 768 });
    // page cards laid out across the viewport so they overlap dialog content
    // when the dialog opens on top
    setRect(pageCardA, { x: 200, y: 200, w: 400, h: 300 });
    setRect(pageCardABody, { x: 200, y: 200, w: 400, h: 300 });
    setRect(pageCardB, { x: 500, y: 400, w: 400, h: 300 });
    setRect(pageCardBBody, { x: 500, y: 400, w: 400, h: 300 });

    // backdrop covers the whole viewport (fixed inset-0)
    setRect(backdrop, { x: 0, y: 0, w: 1024, h: 768 });
    // panel centered, ~600x400
    setRect(panel, { x: 212, y: 184, w: 600, h: 400 });
    setRect(header, { x: 212, y: 184, w: 600, h: 40 });
    setRect(closeBtn, { x: 770, y: 192, w: 24, h: 24 });
    setRect(body, { x: 212, y: 224, w: 600, h: 280 });
    setRect(row, { x: 232, y: 260, w: 240, h: 32 });
    setRect(input, { x: 232, y: 300, w: 240, h: 28 });
    setRect(footer, { x: 212, y: 504, w: 600, h: 80 });
    setRect(cancel, { x: 600, y: 530, w: 80, h: 32 });
    setRect(ok, { x: 700, y: 530, w: 80, h: 32 });

    document.elementFromPoint = makeStackingAwareElementFromPoint(root);

    return {
        container,
        root,
        pageCardA,
        pageCardB,
        backdrop,
        panel,
        closeBtn,
        row,
        input,
        cancel,
        ok,
    };
}

describe("chrome-geometry: modal dialog", () => {
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

    // each interactive child of the dialog content must be hit-testable
    // at the center of its mocked rect. failure mode: a page-content card
    // with translate3d wins because the dialog's z-50 doesn't compete
    // with it correctly under the bug
    it("the close button at top-right of the panel intercepts a pointer at its center", () => {
        const { container, closeBtn } = buildRepro();
        cleanup = () => container.remove();
        const r = closeBtn.getBoundingClientRect();
        const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        expect(hit).toBe(closeBtn);
    });

    it("the row button in the body intercepts a pointer at its center (overlaps page card a)", () => {
        const { container, row, pageCardA } = buildRepro();
        cleanup = () => container.remove();
        const r = row.getBoundingClientRect();
        // sanity: the row's center sits inside page-card-a so the hit
        // resolution actually has to choose between them
        const pcA = pageCardA.getBoundingClientRect();
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        expect(cx >= pcA.left && cx <= pcA.right && cy >= pcA.top && cy <= pcA.bottom).toBe(true);
        const hit = document.elementFromPoint(cx, cy);
        expect(hit).toBe(row);
    });

    it("the input in the body intercepts a pointer at its center", () => {
        const { container, input } = buildRepro();
        cleanup = () => container.remove();
        const r = input.getBoundingClientRect();
        const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        expect(hit).toBe(input);
    });

    it("the cancel button in the footer intercepts a pointer at its center (overlaps page card b)", () => {
        const { container, cancel, pageCardB } = buildRepro();
        cleanup = () => container.remove();
        const r = cancel.getBoundingClientRect();
        const pcB = pageCardB.getBoundingClientRect();
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        expect(cx >= pcB.left && cx <= pcB.right && cy >= pcB.top && cy <= pcB.bottom).toBe(true);
        const hit = document.elementFromPoint(cx, cy);
        expect(hit).toBe(cancel);
    });

    it("the ok button in the footer intercepts a pointer at its center (overlaps page card b)", () => {
        const { container, ok, pageCardB } = buildRepro();
        cleanup = () => container.remove();
        const r = ok.getBoundingClientRect();
        const pcB = pageCardB.getBoundingClientRect();
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        expect(cx >= pcB.left && cx <= pcB.right && cy >= pcB.top && cy <= pcB.bottom).toBe(true);
        const hit = document.elementFromPoint(cx, cy);
        expect(hit).toBe(ok);
    });

    // modal-blocking invariant: a click in the gap between the dialog
    // panel and the viewport edge must land on the backdrop (which the
    // `onclick={(e) => e.target === e.currentTarget && onclose()}` handler
    // then maps to close), never on the page content underneath. this is
    // the load-bearing assertion that distinguishes a modal from a popover
    it("a click outside the panel but inside the viewport lands on the backdrop, not page content", () => {
        const { container, backdrop, pageCardA, pageCardB } = buildRepro();
        cleanup = () => container.remove();
        // point at (100, 600) - outside the panel (212..812, 184..584)
        // but well inside the backdrop and the page-card area
        const hit = document.elementFromPoint(100, 600);
        expect(hit).toBe(backdrop);
        // sanity: that point is not inside either page card's mocked rect
        // in this build, so backdrop is the only ranked hit at the root
        // stacking context. we just want to confirm page content is NOT
        // the returned element
        expect(hit).not.toBe(pageCardA);
        expect(hit).not.toBe(pageCardB);
    });

    it("a click on a page-card area outside the panel still lands on the backdrop", () => {
        const { container, backdrop, pageCardB } = buildRepro();
        cleanup = () => container.remove();
        // page-card-b sits at (500..900, 400..700); pick a point inside
        // page-card-b but outside the panel (panel ends at x=812)
        // - (850, 650) qualifies
        const pcB = pageCardB.getBoundingClientRect();
        const cx = 850;
        const cy = 650;
        expect(cx >= pcB.left && cx <= pcB.right && cy >= pcB.top && cy <= pcB.bottom).toBe(true);
        const hit = document.elementFromPoint(cx, cy);
        // the backdrop's explicit z-index:50 outranks page-card-b's
        // implicit (transform-only) stacking context at z=auto≈0
        expect(hit).toBe(backdrop);
    });
});
