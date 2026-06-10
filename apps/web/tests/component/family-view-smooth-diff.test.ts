/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - family-view smooth-diff plumbing: the
 * `smoothDiff` prop drives the `data-smooth-diff="true"` attribute and
 * `.family-view-smooth-card` class on every rendered card wrapper, and
 * the same attribute lands on `data-badge-id` collapse badges. with
 * the prop off, both hooks disappear without affecting card
 * visibility.
 *
 * jsdom port of the legacy `tests/e2e/family-view-smooth-diff.spec.ts`.
 * the e2e steered clear of mid-animation frame golden checks (which
 * are inherently flaky); the same restraint applies here. we assert
 * the plumbing - attribute presence/absence + composition with
 * `data-on-path` - not the css transition itself.
 *
 * fixtures: multi-union.ged for the basic on/off path, dense-tree.ged
 * for the badge-attribute path (52 ppl forces auto-collapse, surfaces
 * a `+N` badge with no user interaction).
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";

import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
import { loadGedcomFixture } from "./_harness/loadGedcomFixture";
import { mountWithHostRect } from "./_harness/mountWithHostRect";

beforeAll(() => {
    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = vi.fn();
    }
});

beforeEach(() => {
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith("fte.")) localStorage.removeItem(key);
    }
});

afterEach(() => {
    document.body.innerHTML = "";
});

describe("family-view: smooth-diff plumbing", () => {
    it("default load: every card wrapper carries data-smooth-diff + .family-view-smooth-card", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/multi-union.ged");
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const wrappers = handle.container.querySelectorAll(
            ".family-view-smooth-card[data-smooth-diff='true']",
        );
        expect(wrappers.length).toBeGreaterThan(0);

        // each wrapper contains exactly one PersonNode card (the inner
        // [data-person-id] element). count parity is the composition
        // contract the renderer commits to.
        const innerCards = handle.container.querySelectorAll(
            ".family-view-smooth-card[data-smooth-diff='true'] [data-person-id]",
        );
        expect(innerCards.length).toBe(wrappers.length);

        handle.unmount();
    });

    it("smoothDiff=false: attribute and class are absent but cards still render", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/multi-union.ged");
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, smoothDiff: false },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        // cards still render
        const cards = handle.container.querySelectorAll("[data-person-id]");
        expect(cards.length).toBeGreaterThan(0);

        // but neither hook is anywhere on the dom
        expect(
            handle.container.querySelectorAll(".family-view-smooth-card").length,
            ".family-view-smooth-card class should be off when smoothDiff=false",
        ).toBe(0);
        expect(
            handle.container.querySelectorAll("[data-smooth-diff='true']").length,
            "data-smooth-diff attribute should be off when smoothDiff=false",
        ).toBe(0);

        handle.unmount();
    });

    it("badges also carry data-smooth-diff (dense-tree forces auto-collapse)", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/dense-tree.ged");
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const badges = handle.container.querySelectorAll(
            "[data-badge-id][data-smooth-diff='true']",
        );
        expect(
            badges.length,
            "dense-tree default subset should surface at least one badge",
        ).toBeGreaterThan(0);

        handle.unmount();
    });

    it("smooth-diff composes with data-on-path: a card carries both attrs simultaneously when selected", async () => {
        // the legacy e2e called this out as composition under live
        // interaction; here we drive it deterministically by passing
        // selectedId as a prop so the renderer marks the focus card
        // as on-path (one-card path).
        const tree = loadGedcomFixture("apps/web/tests/fixtures/multi-union.ged");
        const aronId = tree.rootId;
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, selectedId: aronId },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        // exactly one wrapper should be on-path
        const onPath = handle.container.querySelectorAll<HTMLElement>("[data-on-path='true']");
        expect(onPath.length).toBe(1);

        // and that wrapper should also carry data-smooth-diff + the class
        const both = handle.container.querySelectorAll(
            ".family-view-smooth-card[data-smooth-diff='true'][data-on-path='true']",
        );
        expect(both.length).toBe(1);

        handle.unmount();
    });
});
