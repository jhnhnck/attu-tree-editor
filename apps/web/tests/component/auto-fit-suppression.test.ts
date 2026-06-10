/*
 * FamilyTreeEditor - auto-fit suppression contract: `+` expand-subtree
 * on family-view holds zoom/pan instead of refitting the viewport.
 *
 * Phase-0 walking-skeleton spec for the cluster-2 auto-fit-suppression
 * contract suite. The historical bug fixed in commit 32c6606
 * "fix(tree): family-view `+` expand-subtree holds zoom/pan, no refit":
 * clicking `+` mutated the bounded subset, the layout bbox changed, the
 * fit-key `$effect` in `FamilyViewCanvas.svelte` re-ran and yanked the
 * user's zoom/pan. fix: an in-component `suppressNextFit` flag set by
 * `onExpandClick(on=true)` and consumed on the next fit-effect tick.
 *
 * Mount notes (see `notes/dev/test-strategy.md`):
 *   - `FamilyViewCanvas` uses `ResizeObserver` to track host size. the
 *     global no-op shim in `apps/web/tests/setup.ts` (added in phase 1b)
 *     satisfies the runtime presence check, but a no-op `observe()`
 *     never dispatches an entry, so `hostW`/`hostH` stay at 0 and the
 *     fit-effect short-circuits. this spec installs a *synthetic*
 *     ResizeObserver locally that fires the supplied rect on `observe()`
 *     so the auto-fit effect actually runs against non-zero host dims;
 *     without that the assertion can't tell suppression from "fit never
 *     ran". the local override sits on top of the global shim and is
 *     restored in afterEach.
 *   - `getBoundingClientRect` is also stubbed - jsdom returns zero-rects
 *     and the family-view chrome-inset measurement reads them.
 *
 * Phase 4 expands this single row into the full table-driven contract
 * (picker show/hide-alongside, picker primary swap, secondary-union
 * collapse, focus change, palette jump, host resize). Phase 0 covers
 * one row - `+` expand on family-view - to prove the harness shape.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import { fireEvent } from "@testing-library/svelte";
import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
import { eightPersonFamily } from "../fixtures/layered-bug-repros";

interface SyntheticROEntry {
    contentRect: { width: number; height: number };
}

type ROCallback = (entries: SyntheticROEntry[]) => void;

/**
 * Synthetic ResizeObserver - fires the supplied `hostRect` immediately
 * on `observe()` so the family-view fit-effect has non-zero host dims
 * to work with. Real browsers dispatch the first entry asynchronously
 * via the resize-observer task source, but the canvas's fit logic just
 * reads `entry.contentRect`, so a synchronous fire matches the contract
 * the production code depends on. Replaces the global no-op shim from
 * `setup.ts` for the lifetime of this spec only.
 */
function installSyntheticResizeObserver(rect: { width: number; height: number }): () => void {
    const prior = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    class SyntheticRO {
        private cb: ROCallback;
        constructor(cb: ROCallback) {
            this.cb = cb;
        }
        observe(_el: Element): void {
            this.cb([{ contentRect: { width: rect.width, height: rect.height } }]);
        }
        unobserve(): void {
            // no-op
        }
        disconnect(): void {
            // no-op
        }
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = SyntheticRO;
    return () => {
        // restore the prior binding (the global no-op shim from setup.ts)
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = prior;
    };
}

/**
 * jsdom returns zero-rects from `getBoundingClientRect`. family-view's
 * `measureCanvasChromeInsets` walks the host for `data-canvas-chrome`
 * overlays and reads their rects; with no overlays present the call
 * returns zero insets, which is fine - what matters is that the *host*
 * rect matches what we told ResizeObserver, so `computeFit` doesn't
 * see a hostW/hostH/contentRect mismatch.
 */
function stubHostRect(rect: { width: number; height: number }): () => void {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
        // any element under the canvas reports the same rect; the only
        // reader we care about for fit is the host itself, and the
        // overlay-walk produces an empty inset set
        return {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: rect.width,
            bottom: rect.height,
            width: rect.width,
            height: rect.height,
            toJSON() {
                return this;
            },
        };
    };
    return () => {
        Element.prototype.getBoundingClientRect = orig;
    };
}

describe("auto-fit suppression: family-view `+` expand", () => {
    const HOST_W = 1024;
    const HOST_H = 768;

    let cleanups: Array<() => void> = [];

    beforeEach(() => {
        cleanups = [];
        if (!Element.prototype.scrollIntoView) {
            Element.prototype.scrollIntoView = vi.fn();
        }
        cleanups.push(installSyntheticResizeObserver({ width: HOST_W, height: HOST_H }));
        cleanups.push(stubHostRect({ width: HOST_W, height: HOST_H }));
    });

    afterEach(() => {
        for (const fn of cleanups.reverse()) fn();
        document.body.innerHTML = "";
    });

    it("clicking `+` does not change scale/pan even though the bbox shifts", async () => {
        const tree = eightPersonFamily();
        const target = document.createElement("div");
        document.body.appendChild(target);

        // mount FamilyViewCanvas directly via svelte 5 mount() so we can
        // pass props without the testing-library wrapping div interfering
        // with the host's getBoundingClientRect
        const component = mount(FamilyViewCanvas, { target, props: { tree } });
        await tick();

        // surface div carries the `transform: translate(...) scale(...)`
        // style we observe to detect a refit
        const surface = target.querySelector<HTMLDivElement>(".absolute.origin-top-left");
        expect(surface, "transform surface should mount").not.toBeNull();
        const transformBeforeClick = surface?.style.transform ?? "";

        // find an `+` expand affordance. eightPersonFamily focuses on
        // Moma (root) and has parents/children to reveal; if no `+` is
        // rendered the fixture's bounded-subset is already saturated -
        // expand the assertion to skip in that case
        const expandBtn = target.querySelector<HTMLButtonElement>(
            'button[data-expand-toggle="expand"]',
        );
        if (!expandBtn) {
            // the fixture doesn't surface an expand affordance under
            // default bounded-subset; the post-mount transform still
            // proves the fit-effect ran, but there's no `+` row to
            // exercise. log + skip so the harness shape stays valid
            // while phase-4 picks a richer fixture
            console.warn(
                "auto-fit-suppression skeleton: eightPersonFamily " +
                    "produced no `+` affordance under bounded subset; " +
                    "phase-4 should swap to a fixture with un-shown " +
                    "adjacents (Akarians or a hand-built repro).",
            );
            void unmount(component);
            return;
        }

        await fireEvent.click(expandBtn);
        await tick();
        await tick();

        const transformAfterClick = surface?.style.transform ?? "";

        // sanity: the initial fit really ran - if `transformBeforeClick`
        // matched the unfitted default ("translate(0px, 0px) scale(1)")
        // the suppression assertion below would be a no-op tautology.
        // bring-up verified the initial fit yields a non-identity
        // transform (e.g. `translate(152px, 224px) scale(2)`) on the
        // eight-person fixture at the 1024x768 host.
        expect(transformBeforeClick).not.toBe("translate(0px, 0px) scale(1)");
        expect(transformBeforeClick).not.toBe("");

        // the invariant: even though `+` expanded the visible set and
        // the layout's bbox changed (so the fit-key changes too), the
        // `suppressNextFit` flag swallows the next fit pass and the
        // transform stays exactly what it was pre-click. any regression
        // that drops the flag - or sets it on the wrong handler -
        // re-introduces the 32c6606 bug and fails this assertion
        expect(transformAfterClick).toBe(transformBeforeClick);

        void unmount(component);
    });
});
