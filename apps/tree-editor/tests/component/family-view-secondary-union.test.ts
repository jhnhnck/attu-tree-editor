/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - family-view secondary-union expansion: the `˅`
 * picker offers a "also show ... alongside" action that surfaces the
 * non-primary union next to the primary at the same rank, and a
 * paired "hide" action that tears it back down. localStorage round-
 * trips under `fte.family-view.secondary-union.v1:{treeId}:{focusId}`.
 * the `secondaryUnion` prop (master switch) gates whether the
 * show-alongside menu entry renders at all.
 *
 * jsdom port of the legacy
 * `tests/e2e/family-view-secondary-union.spec.ts`.
 *
 * fixture: tests/fixtures/multi-union.ged - aron has F1 (mira, calen,
 * primary) and F2 (sera, iva, non-primary). default load: mira + calen
 * visible. show-alongside should surface sera + iva.
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

describe("family-view: secondary-union expansion", () => {
    it("show-alongside / hide round-trip surfaces and removes the secondary union + writes/clears localStorage", async () => {
        const tree = loadGedcomFixture("apps/tree-editor/tests/fixtures/multi-union.ged");
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        // baseline - sera + iva hidden
        expect(cardsWithText(handle.container, /Sera/)).toHaveLength(0);
        expect(cardsWithText(handle.container, /Iva/)).toHaveLength(0);

        // open the picker
        const picker = handle.container.querySelector<HTMLButtonElement>(
            "[data-union-picker='toggle']",
        );
        expect(picker).not.toBeNull();
        await fireEvent.click(picker!);
        await tick();
        const menu = handle.container.querySelector("[data-union-picker='menu']");
        expect(menu).not.toBeNull();

        const showAlongside = menu!.querySelector<HTMLButtonElement>(
            "[data-union-picker-action='show-alongside']",
        );
        expect(
            showAlongside,
            "show-alongside menu entry should render with secondaryUnion=true",
        ).not.toBeNull();
        await fireEvent.click(showAlongside!);
        await tick();
        await tick();

        // sera + iva should now be on the canvas
        expect(cardsWithText(handle.container, /Sera/)).toHaveLength(1);
        expect(cardsWithText(handle.container, /Iva/)).toHaveLength(1);

        // localStorage entry exists under the secondary-union prefix
        const keys = Object.keys(localStorage).filter((k) =>
            k.startsWith("fte.family-view.secondary-union.v1:"),
        );
        expect(keys.length).toBeGreaterThan(0);
        const raw = localStorage.getItem(keys[0]!);
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw!) as { byPerson?: Record<string, number[]> };
        expect(parsed.byPerson).toBeDefined();
        expect(Object.keys(parsed.byPerson ?? {}).length).toBeGreaterThan(0);

        // re-open the picker - the menu re-renders, and the entry that
        // was "show-alongside" should now be "hide-alongside"
        const picker2 = handle.container.querySelector<HTMLButtonElement>(
            "[data-union-picker='toggle']",
        );
        await fireEvent.click(picker2!);
        await tick();
        const menu2 = handle.container.querySelector("[data-union-picker='menu']");
        expect(menu2).not.toBeNull();

        const hideAlongside = menu2!.querySelector<HTMLButtonElement>(
            "[data-union-picker-action='hide-alongside']",
        );
        expect(hideAlongside).not.toBeNull();
        await fireEvent.click(hideAlongside!);
        await tick();
        await tick();

        // sera + iva back to hidden
        expect(cardsWithText(handle.container, /Sera/)).toHaveLength(0);
        expect(cardsWithText(handle.container, /Iva/)).toHaveLength(0);

        handle.unmount();
    });

    it("with secondaryUnion=false the show-alongside entry never renders", async () => {
        const tree = loadGedcomFixture("apps/tree-editor/tests/fixtures/multi-union.ged");
        const handle = mountWithHostRect(FamilyViewCanvas, {
            props: { tree, secondaryUnion: false },
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

        // the wave-1 set-primary action survives
        const setPrimary = menu!.querySelectorAll("[data-union-picker-action='set-primary']");
        expect(setPrimary.length).toBeGreaterThan(0);

        // but show-alongside is absent when the master switch is off
        const showAlongside = menu!.querySelectorAll("[data-union-picker-action='show-alongside']");
        expect(showAlongside.length).toBe(0);

        handle.unmount();
    });
});
