/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - family-view multi-union UI: the `˅` picker shows
 * up on a multi-union person's visible partner card, listing alternate
 * unions, and "set primary to X" swaps the visible partner + children.
 *
 * jsdom port of the legacy `tests/e2e/family-view-multi-union.spec.ts`.
 * the e2e drove the wizard against `multi-union.ged`; here we load the
 * fixture directly via `loadGedcomFixture` and mount the canvas. all
 * picker affordances are real dom buttons under data-attributes so
 * `fireEvent.click` exercises the exact handlers the e2e clicked.
 *
 * fixture: tests/fixtures/multi-union.ged - aron has two unions:
 * F1 (mira, calen, _PRIMARY Y) and F2 (sera, iva, _PRIMARY N). on
 * default load mira + calen visible; sera + iva hidden behind the `˅`
 * picker on mira's card.
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
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith("fte.")) localStorage.removeItem(key);
    }
});

afterEach(() => {
    document.body.innerHTML = "";
});

function cardsWithText(root: ParentNode, needle: RegExp): Element[] {
    return Array.from(root.querySelectorAll("[data-person-id]")).filter((el) =>
        needle.test(el.textContent ?? ""),
    );
}

describe("family-view: multi-union picker", () => {
    it("default load shows primary union (Mira + Calen), hides secondary (Sera + Iva)", async () => {
        const tree = loadGedcomFixture("apps/tree-editor/tests/fixtures/multi-union.ged");
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        expect(cardsWithText(handle.container, /Mira/)).toHaveLength(1);
        expect(cardsWithText(handle.container, /Calen/)).toHaveLength(1);
        expect(cardsWithText(handle.container, /Sera/)).toHaveLength(0);
        expect(cardsWithText(handle.container, /Iva/)).toHaveLength(0);

        // the `˅` picker is on the multi-union mate slot
        const picker = handle.container.querySelector<HTMLButtonElement>(
            "[data-union-picker='toggle']",
        );
        expect(picker).not.toBeNull();

        handle.unmount();
    });

    it("˅ picker swap-primary action swaps the visible union + writes the override to localStorage", async () => {
        const tree = loadGedcomFixture("apps/tree-editor/tests/fixtures/multi-union.ged");
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        const picker = handle.container.querySelector<HTMLButtonElement>(
            "[data-union-picker='toggle']",
        );
        expect(picker).not.toBeNull();
        await fireEvent.click(picker!);
        await tick();

        const menu = handle.container.querySelector("[data-union-picker='menu']");
        expect(menu).not.toBeNull();

        // scope to the swap action - wave-2 phase 4 added a
        // sibling show-alongside action with similar text
        const seraSwap = Array.from(
            menu!.querySelectorAll<HTMLButtonElement>("[data-union-picker-action='set-primary']"),
        ).find((b) => /Sera/.test(b.textContent ?? ""));
        expect(seraSwap, "menu should list a 'set primary to Sera' action").toBeDefined();
        await fireEvent.click(seraSwap!);
        await tick();
        await tick();

        // after swap: Sera + Iva visible; Mira + Calen hidden
        expect(cardsWithText(handle.container, /Sera/)).toHaveLength(1);
        expect(cardsWithText(handle.container, /Iva/)).toHaveLength(1);
        expect(cardsWithText(handle.container, /Mira/)).toHaveLength(0);
        expect(cardsWithText(handle.container, /Calen/)).toHaveLength(0);

        // primary-union override key was written
        const keys = Object.keys(localStorage).filter((k) =>
            k.startsWith("fte.family-view.primary-union.v1:"),
        );
        expect(keys.length).toBeGreaterThan(0);
        const raw = localStorage.getItem(keys[0]!);
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw!) as { byPerson: Record<string, number> };
        expect(Object.values(parsed.byPerson).length).toBeGreaterThan(0);

        handle.unmount();
    });
});
