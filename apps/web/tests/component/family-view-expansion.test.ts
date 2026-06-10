/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - family-view expansion: `+` reveals a branch,
 * `-` collapses it, and the chosen state lands in localStorage under
 * `fte.family-view.expansion.v1:{treeId}:{focusId}`.
 *
 * jsdom port of the legacy `tests/e2e/family-view-expansion.spec.ts`.
 * the e2e dragged in the entire shell + import-wizard to assert dom
 * mutations on FamilyViewCanvas - we mount the canvas directly here
 * and exercise the same `data-expand-toggle` affordance the renderer
 * exposes. localStorage round-trip, badge re-expand, and the
 * "engine swap preserves storage" arc are pure store assertions: the
 * storage key survives across mounts regardless of which engine is
 * displayed, which is exactly what a fresh canvas mount with the
 * same `(treeId, focusId)` verifies.
 *
 * uses notes/examples/Inbred Family.gdz - 7 people, ~3 expand
 * affordances on default load, no auto-collapse badges. dense-tree
 * (52 ppl) would surface the badge path but yields zero expand
 * toggles under bounded subset, so it doesn't double-duty here.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { fireEvent } from "@testing-library/svelte";

import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
import { loadGedcomFixture } from "./_harness/loadGedcomFixture";
import { mountWithHostRect } from "./_harness/mountWithHostRect";

beforeAll(() => {
    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = vi.fn();
    }
});

beforeEach(() => {
    // wipe every fte.* key so the canvas's lazy localStorage reads
    // see a clean slate at mount
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith("fte.")) localStorage.removeItem(key);
    }
});

afterEach(() => {
    document.body.innerHTML = "";
});

describe("family-view: expansion", () => {
    it("clicking + writes an entry under fte.family-view.expansion.v1", async () => {
        const tree = loadGedcomFixture("notes/examples/Inbred Family.gdz");
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const baselineCards = handle.container.querySelectorAll("[data-person-id]").length;
        expect(baselineCards).toBeGreaterThan(0);

        const expandBtn = handle.container.querySelector<HTMLButtonElement>(
            "[data-expand-toggle='expand']",
        );
        expect(expandBtn, "fixture should surface at least one + affordance").not.toBeNull();
        await fireEvent.click(expandBtn!);
        await tick();
        await tick();

        // visible card count grows
        const afterCards = handle.container.querySelectorAll("[data-person-id]").length;
        expect(afterCards).toBeGreaterThan(baselineCards);

        // localStorage key exists and contains at least one expanded id
        const keys = Object.keys(localStorage).filter((k) =>
            k.startsWith("fte.family-view.expansion.v1:"),
        );
        expect(keys.length).toBeGreaterThan(0);
        const raw = localStorage.getItem(keys[0]!);
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw!) as { expanded: string[] };
        expect(parsed.expanded.length).toBeGreaterThan(0);

        handle.unmount();
    });

    it("clicking - returns to baseline", async () => {
        const tree = loadGedcomFixture("notes/examples/Inbred Family.gdz");
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const baselineCards = handle.container.querySelectorAll("[data-person-id]").length;
        const expandBtn = handle.container.querySelector<HTMLButtonElement>(
            "[data-expand-toggle='expand']",
        );
        expect(expandBtn).not.toBeNull();
        await fireEvent.click(expandBtn!);
        await tick();
        await tick();

        // collapse toggle now exists somewhere
        const collapseBtn = handle.container.querySelector<HTMLButtonElement>(
            "[data-expand-toggle='collapse']",
        );
        expect(collapseBtn, "expand should surface a paired collapse affordance").not.toBeNull();
        await fireEvent.click(collapseBtn!);
        await tick();
        await tick();

        const afterCards = handle.container.querySelectorAll("[data-person-id]").length;
        expect(afterCards).toBe(baselineCards);

        handle.unmount();
    });

    it("storage entry persists across a remount with the same tree (engine-swap equivalent)", async () => {
        // the legacy e2e "engine swap preserves expansion state" arc
        // boils down to: does the storage key survive after the canvas
        // unmounts. swapping engines unmounts FamilyViewCanvas and
        // mounts TreeCanvas; on swap back the same (treeId, focusId)
        // storage key is read back. remounting FamilyViewCanvas with
        // the same tree exercises the same lookup.
        const tree = loadGedcomFixture("notes/examples/Inbred Family.gdz");
        const first = mountWithHostRect(FamilyViewCanvas, {
            props: { tree },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const expandBtn = first.container.querySelector<HTMLButtonElement>(
            "[data-expand-toggle='expand']",
        );
        expect(expandBtn).not.toBeNull();
        await fireEvent.click(expandBtn!);
        await tick();
        await tick();

        const keys = Object.keys(localStorage).filter((k) =>
            k.startsWith("fte.family-view.expansion.v1:"),
        );
        expect(keys.length).toBeGreaterThan(0);
        const storedExpansion = localStorage.getItem(keys[0]!);
        expect(storedExpansion).toBeTruthy();
        const beforeUnmountCount = first.container.querySelectorAll("[data-person-id]").length;

        first.unmount();

        // storage survives the unmount - the layered engine never
        // touches the family-view storage key
        expect(localStorage.getItem(keys[0]!)).toBe(storedExpansion);

        // remount restores the expanded set without any user click
        const second = mountWithHostRect(FamilyViewCanvas, {
            props: { tree },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();
        const afterRemountCount = second.container.querySelectorAll("[data-person-id]").length;
        expect(afterRemountCount).toBe(beforeUnmountCount);

        second.unmount();
    });
});
