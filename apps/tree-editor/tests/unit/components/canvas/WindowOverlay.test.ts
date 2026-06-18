// SPDX-License-Identifier: MIT

// phase-1 unit test for WindowOverlay snippet closure semantics.
// proves a body snippet rendered THROUGH the registry pipeline
// (DockRegistration → dockRegistry.render → WindowOverlay's
// {@render} call) closes over the parent's reactive state. without
// this guarantee a snippet rendered into the overlay would lose its
// link back to caller-owned $state, breaking every production
// caller that controls window contents via parent runes.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { clearRegistry, windowManager } from "@attu/ui";
import WindowOverlayCounterProbe from "./fixtures/WindowOverlayCounterProbe.svelte";

let target: HTMLElement;

beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
});

afterEach(() => {
    target.remove();
    windowManager.clear();
    clearRegistry();
});

describe("WindowOverlay — snippet closure over caller state", () => {
    it("clicking a button inside the popped-out body mutates the parent's counter", () => {
        // capture every increment fired from the snippet body. the
        // snippet declares `counter` in the probe's component scope
        // and writes to it on click; we read the post-write value via
        // the onIncrement callback bridge so the test (a plain .ts
        // module, not .svelte.ts) doesn't need its own $state rune.
        const observed: number[] = [];
        const app = mount(WindowOverlayCounterProbe, {
            target,
            props: { onIncrement: (n: number) => observed.push(n) },
        });
        flushSync();

        // pop the window out into the overlay. the host element
        // resolution inside WindowOverlay's $effect reads the
        // [data-canvas-host] ancestor; the probe component wraps
        // its content in that attribute so the overlay finds it.
        windowManager.popOut("counter-probe");
        flushSync();

        // the popped-out wrapper renders inside the overlay; query
        // the counter button from there and click it.
        const btn = target.querySelector<HTMLButtonElement>('[data-testid="counter-probe-button"]');
        expect(btn).not.toBeNull();
        btn?.click();
        flushSync();
        btn?.click();
        flushSync();

        // counter mutated through the snippet's closure twice; the
        // increments are observed in order via the callback.
        expect(observed).toEqual([1, 2]);

        void unmount(app);
    });
});
