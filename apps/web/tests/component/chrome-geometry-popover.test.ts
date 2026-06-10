/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - chrome-geometry invariant: popover anchored to a
 * chrome-bar button (modeled on SaveStatusPill's expand-on-click panel)
 * must keep its interactive children reachable by pointer.
 *
 * historical bugs: SaveStatusPill popover opened off-screen (323fa72)
 * and the same family of "popover painted behind cards" issues that
 * motivated 620ce7c. this spec checks the survive-shape: with the
 * popover at z-40 above a sibling overlay at a lower z, a pointer
 * dispatched at each interactive child of the popover lands on that
 * child, not the sibling.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
    captureElementFromPoint,
    makeStackingAwareElementFromPoint,
    setRect,
} from "./_harness/stackingContextHitTest";

/**
 * mimic SaveStatusPill's open-popover dom: a relative container, a
 * trigger button, and a `position:absolute; z-index:40` popover panel
 * containing a couple of interactive children (a "force save" button
 * and a close-X). a sibling overlay sits later in dom order at z-30 (or
 * a higher z if the test wants to verify the regression-target shape).
 */
function buildRepro(opts: { overlayZ: number; popoverZ?: number }) {
    const pZ = opts.popoverZ ?? 40;
    const container = document.createElement("div");
    container.innerHTML = `
        <div id="root" style="position:relative;">
            <div id="pill-host" style="position:relative;">
                <button id="trigger" type="button">Saved</button>
                <div id="popover" role="dialog" style="position:absolute;z-index:${String(pZ)};">
                    <button id="force-save" type="button">Force save</button>
                    <button id="dismiss" type="button" aria-label="dismiss">x</button>
                </div>
            </div>
            <div id="overlay" style="position:fixed;z-index:${String(opts.overlayZ)};">
                later-painted overlay
            </div>
        </div>
    `;
    document.body.appendChild(container);

    const root = container.querySelector("#root") as HTMLDivElement;
    const host = container.querySelector("#pill-host") as HTMLDivElement;
    const trigger = container.querySelector("#trigger") as HTMLButtonElement;
    const popover = container.querySelector("#popover") as HTMLDivElement;
    const forceSave = container.querySelector("#force-save") as HTMLButtonElement;
    const dismiss = container.querySelector("#dismiss") as HTMLButtonElement;
    const overlay = container.querySelector("#overlay") as HTMLDivElement;

    setRect(root, { x: 0, y: 0, w: 1000, h: 600 });
    // pill anchored at the bottom-left chrome bar
    setRect(host, { x: 20, y: 540, w: 80, h: 24 });
    setRect(trigger, { x: 20, y: 540, w: 80, h: 24 });
    // popover floats above the trigger (bottom-full pattern from SaveStatusPill)
    setRect(popover, { x: 20, y: 460, w: 256, h: 72 });
    setRect(forceSave, { x: 32, y: 500, w: 232, h: 24 });
    setRect(dismiss, { x: 244, y: 468, w: 20, h: 20 });
    // overlay covers the whole popover - the collision rectangle
    setRect(overlay, { x: 0, y: 440, w: 1000, h: 120 });

    document.elementFromPoint = makeStackingAwareElementFromPoint(root);

    return { container, root, trigger, popover, forceSave, dismiss, overlay };
}

function centerOf(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

describe("chrome-geometry: chrome-bar popover", () => {
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

    // each interactive child must win against the lower-z sibling overlay
    // at its own center point. this is the everyday invariant the
    // shipping code depends on.
    it("each interactive child wins a pointer aimed at its center vs a z-30 overlay", () => {
        const { container, forceSave, dismiss } = buildRepro({ overlayZ: 30 });
        cleanup = () => container.remove();
        for (const child of [forceSave, dismiss]) {
            const { x, y } = centerOf(child);
            const hit = document.elementFromPoint(x, y);
            expect(hit).toBe(child);
        }
    });

    // adversarial: a sibling overlay at z-50 (modal-level) painted later
    // in dom order should win - we want the invariant suite to *know*
    // this case fails so that anyone bumping the popover's z above
    // modal-z trips a documented test.
    it("pre-fix shape: z-50 sibling overlay intercepts the popover's children (regression target)", () => {
        const { container, forceSave, overlay } = buildRepro({ overlayZ: 50 });
        cleanup = () => container.remove();
        const { x, y } = centerOf(forceSave);
        const hit = document.elementFromPoint(x, y);
        expect([forceSave, overlay]).toContain(hit);
        expect(hit).toBe(overlay);
    });

    // a pointer aimed at the popover body (not on any interactive child)
    // still lands on the popover container - confirms the popover panel
    // itself remains hittable even where it doesn't enclose a button.
    it("popover body wins against a z-30 sibling overlay at a non-button collision point", () => {
        const { container, popover, overlay } = buildRepro({ overlayZ: 30 });
        cleanup = () => container.remove();
        // point inside the popover rect but between the two buttons
        const x = 150;
        const y = 480;
        const hit = document.elementFromPoint(x, y);
        expect([popover, overlay]).toContain(hit);
        expect(hit).toBe(popover);
    });
});
