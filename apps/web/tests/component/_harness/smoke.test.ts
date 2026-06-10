/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - smoke test for the phase-1b test harness bootstrap.
 *
 * proves the helper trio - global shims in `tests/setup.ts`,
 * `loadGedcomFixture`, and `mountWithHostRect` - cooperates well enough to
 * mount `FamilyViewCanvas` against a real on-disk fixture and produce
 * observable dom. phase-1c migrations build on top of this baseline; if
 * the smoke goes red, the migrations cannot proceed.
 *
 * uses `notes/examples/Inbred Family.gdz` as the canonical small fixture:
 * smallest gdz handy, exercises the bundle reader path (proves the .gdz
 * branch of `loadGedcomFixture`), and runs in well under a second.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";

import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
import { loadGedcomFixture } from "./loadGedcomFixture";
import { mountWithHostRect } from "./mountWithHostRect";

describe("phase 1b harness smoke", () => {
    beforeEach(() => {
        // FamilyViewCanvas calls scrollIntoView when selection lands; jsdom
        // stubs the prototype but not the function. matches the local stub
        // used in `auto-fit-suppression.test.ts`.
        if (!Element.prototype.scrollIntoView) {
            Element.prototype.scrollIntoView = vi.fn();
        }
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("loadGedcomFixture(.gdz) + mountWithHostRect(FamilyViewCanvas) renders at least one card", async () => {
        const tree = loadGedcomFixture("notes/examples/Inbred Family.gdz");
        expect(tree.id).toBeTruthy();
        expect(Object.keys(tree.people).length).toBeGreaterThan(0);

        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const cards = handle.container.querySelectorAll("[data-person-id]");
        expect(cards.length, "expected at least one rendered person card").toBeGreaterThan(0);

        handle.unmount();
    });

    it("loadGedcomFixture(.ged) parses the tiny fixture", () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/tiny.ged");
        expect(tree.id).toBeTruthy();
        expect(Object.keys(tree.people).length).toBeGreaterThan(0);
    });

    it("loadGedcomFixture throws a clear error for a missing path", () => {
        expect(() => loadGedcomFixture("apps/web/tests/fixtures/__nope__.ged")).toThrowError(
            /fixture not found/i,
        );
    });

    it("loadGedcomFixture throws on an unsupported extension", () => {
        expect(() => loadGedcomFixture("apps/web/tests/fixtures/portrait-blue.png")).toThrowError(
            /unsupported extension/i,
        );
    });
});
