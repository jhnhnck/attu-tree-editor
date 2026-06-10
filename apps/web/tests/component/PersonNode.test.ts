/*
 * FamilyTreeEditor - PersonNode renders content per detail level + gender tint
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import PersonNode from "$lib/components/tree/PersonNode.svelte";
import type { Person } from "$lib/domain/types";

function person(overrides: Partial<Person> = {}): Person {
    return {
        id: "AAAAA",
        given: "Alpha",
        surname: "Bravo",
        gender: "u",
        spouseIds: [],
        display: "z1",
        birth: { era: "PC", year: 1500 },
        death: { era: "PC", year: 1570 },
        ...overrides,
    };
}

// PersonNode mounts every level variant once and toggles visibility via CSS
// (data-level on the button + display: contents on the matching .lvl).
// Tests that previously asserted on the button's textContent now scope to the
// active variant - the level-N wrapper - because the inactive variants are
// still in the DOM and contribute to textContent.
function visibleText(btn: HTMLElement): string {
    const lvl = btn.dataset.level ?? "0";
    const active = btn.querySelector(`.lvl[data-lvl="${lvl}"]`);
    return active?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("PersonNode", () => {
    it("at level 0, shows full name and date range without a portrait when none is set", () => {
        render(PersonNode, { person: person() });
        const btn = screen.getByRole("treeitem");
        expect(btn).toHaveTextContent("Alpha Bravo");
        expect(btn).toHaveTextContent("1500 - 1570 PC");
        expect(document.querySelector("img")).toBeNull();
    });

    it("stamps the era on both sides when birth and death cross the PC/TT boundary", () => {
        render(PersonNode, {
            person: person({
                birth: { era: "TT", year: 50 },
                death: { era: "PC", year: 25 },
            }),
        });
        expect(screen.getByRole("treeitem")).toHaveTextContent("50 TT - 25 PC");
    });

    it("includes the era on a single-sided date", () => {
        const p = person({ birth: { era: "PC", year: 1234 } });
        delete p.death;
        render(PersonNode, { person: p });
        expect(screen.getByRole("treeitem")).toHaveTextContent("b. 1234 PC");
    });

    it("at level 0 with a portraitUrl, renders the image", () => {
        render(PersonNode, { person: person(), portraitUrl: "blob:abc" });
        const img = document.querySelector<HTMLImageElement>("img");
        expect(img?.getAttribute("src")).toBe("blob:abc");
    });

    it("at level 1 drops the portrait but keeps name + dates", () => {
        render(PersonNode, { person: person(), level: 1 });
        const btn = screen.getByRole("treeitem");
        expect(btn).toHaveTextContent("Alpha Bravo");
        expect(btn).toHaveTextContent("1500 - 1570 PC");
    });

    it("at level 2 shows just the full name", () => {
        render(PersonNode, { person: person(), level: 2 });
        const text = visibleText(screen.getByRole("treeitem"));
        expect(text).toContain("Alpha Bravo");
        expect(text).not.toContain("1500");
    });

    it("at level 3 shows the surname only", () => {
        render(PersonNode, { person: person(), level: 3 });
        const text = visibleText(screen.getByRole("treeitem"));
        expect(text).toBe("Bravo");
    });

    it("at level 4 shows initials only", () => {
        render(PersonNode, { person: person(), level: 4 });
        const text = visibleText(screen.getByRole("treeitem"));
        expect(text).toBe("AB");
    });

    it("at level 5 the box is empty", () => {
        render(PersonNode, { person: person(), level: 5 });
        const btn = screen.getByRole("treeitem");
        expect(btn.dataset.level).toBe("5");
        expect(visibleText(btn)).toBe("");
    });

    it("at levels 4 and 5 carries a native title with full name + lifespan", () => {
        // far-zoom cards drop the name from the visible card; the native
        // title attribute surfaces it on hover so the user can identify a
        // card before zooming in. level 4 = initials, level 5 = dot.
        for (const level of [4, 5] as const) {
            const { unmount } = render(PersonNode, { person: person(), level });
            const btn = screen.getByRole("treeitem");
            expect(btn.getAttribute("title")).toBe("Alpha Bravo · 1500 - 1570 PC");
            unmount();
        }
    });

    it("at levels 0-3 carries no title (name is already visible)", () => {
        for (const level of [0, 1, 2, 3] as const) {
            const { unmount } = render(PersonNode, { person: person(), level });
            const btn = screen.getByRole("treeitem");
            expect(btn.getAttribute("title")).toBeNull();
            unmount();
        }
    });

    it("at far zoom with no dates, title is just the name", () => {
        const p = person();
        delete p.birth;
        delete p.death;
        render(PersonNode, { person: p, level: 4 });
        expect(screen.getByRole("treeitem").getAttribute("title")).toBe("Alpha Bravo");
    });

    it("at far zoom with no name, title falls back to (unnamed)", () => {
        render(PersonNode, { person: person({ given: "", surname: "" }), level: 5 });
        expect(screen.getByRole("treeitem").getAttribute("title")).toBe(
            "(unnamed) · 1500 - 1570 PC",
        );
    });

    it("paints male tint blue", () => {
        render(PersonNode, { person: person({ gender: "m" }) });
        expect(document.querySelector(".bg-sky-700\\/35")).not.toBeNull();
    });

    it("paints female tint pink", () => {
        render(PersonNode, { person: person({ gender: "f" }) });
        expect(document.querySelector(".bg-pink-700\\/35")).not.toBeNull();
    });

    it("paints unknown tint amber", () => {
        render(PersonNode, { person: person({ gender: "u" }) });
        expect(document.querySelector(".bg-amber-600\\/30")).not.toBeNull();
    });

    it("applies the faded class for z0 display", () => {
        render(PersonNode, { person: person({ display: "z0" }) });
        expect(document.querySelector(".is-faded")).not.toBeNull();
    });

    it("dispatches onselect on single click", async () => {
        const onselect = vi.fn();
        render(PersonNode, { person: person(), onselect });
        await fireEvent.click(screen.getByRole("treeitem"));
        expect(onselect).toHaveBeenCalledWith("AAAAA");
    });

    it("dispatches onedit on double click", async () => {
        const onedit = vi.fn();
        render(PersonNode, { person: person(), onedit });
        await fireEvent.dblClick(screen.getByRole("treeitem"));
        expect(onedit).toHaveBeenCalledWith("AAAAA");
    });

    it("falls back to (unnamed) at level 0 when given+surname are blank", () => {
        render(PersonNode, { person: person({ given: "", surname: "" }) });
        expect(screen.getByRole("treeitem")).toHaveTextContent("(unnamed)");
    });

    // visual fix-up plan stubs — converted per phase as fixes land.
    // see notes/features/family-view-visual-fixup.md
    it("issue #1: name allows up to two lines (line-clamp-2)", () => {
        render(PersonNode, {
            person: person({ given: "Kadar", surname: "Arkaran and Amarkan" }),
        });
        // the name span at level 0 must allow two-line wrap so wide names
        // don't clip against the card's bottom border. paired with the
        // layout-engine heuristic that grows the card for long names.
        const lvl0 = document.querySelector('.lvl[data-lvl="0"] .line-clamp-2');
        expect(lvl0).not.toBeNull();
    });

    it("issue #3: portrait slot uses .portrait-slot when a photo is present", () => {
        render(PersonNode, { person: person(), portraitUrl: "blob:abc" });
        // the slot class signals to css that the photo area expands with
        // the card's intrinsic height (flex: 1 1 auto, min-height: 2.5rem).
        const slot = document.querySelector('[data-portrait-slot="true"]');
        expect(slot).not.toBeNull();
        expect(slot?.classList.contains("portrait-slot")).toBe(true);
    });

    it("issue #11: no avatar slot rendered when no portrait is present", () => {
        render(PersonNode, { person: person() });
        // Silhouette placeholder removed entirely - cards without a
        // portrait render only name + date, no avatar slot.
        expect(document.querySelector('[data-silhouette="true"]')).toBeNull();
        expect(document.querySelector('[data-portrait-slot="true"]')).toBeNull();
    });

    it("renders an empty portrait slot when portraitBlobId is set but the URL is not yet resolved", () => {
        // The layout engine sizes the card as `CARD_H_WITH_PORTRAIT`
        // whenever `portraitBlobId` is set; if the blob URL hasn't
        // arrived yet, the slot must still render (without an img)
        // so the tall card doesn't show an empty top band.
        render(PersonNode, { person: person({ portraitBlobId: "blob:pending" }) });
        const slot = document.querySelector('[data-portrait-slot="true"]');
        expect(slot).not.toBeNull();
        expect(slot?.getAttribute("data-portrait-pending")).toBe("true");
        expect(slot?.querySelector("img")).toBeNull();
    });

    it("issue #2: card carries data-has-date='false' when birth + death are both absent", () => {
        // Phase 5: the CSS hook for centering the name+avatar block when
        // there is no date row. The `[data-level='0'][data-has-date='false']`
        // selector adds `justify-content: center` so the empty bottom band
        // disappears on portrait cards without dates. jsdom won't compute
        // the CSS rule itself; assert the data attribute the rule relies on.
        const p = person();
        delete p.birth;
        delete p.death;
        render(PersonNode, { person: p });
        const btn = screen.getByRole("treeitem");
        expect(btn.dataset.hasDate).toBe("false");
    });

    it("issue #2: card carries data-has-date='true' when at least one date is present", () => {
        render(PersonNode, { person: person() });
        const btn = screen.getByRole("treeitem");
        expect(btn.dataset.hasDate).toBe("true");
    });

    it("issue #7: selected card adds is-selected class so the selection-ring CSS applies", () => {
        // Phase 5: the selection ring is `box-shadow: inset 0 0 0 3px`
        // attached to `.is-selected`; the visible-corner-gap fix is the
        // `border-radius: 0.5rem` bump (6→8px) in the same stylesheet,
        // not a class-level change. This test guards the class hook;
        // the visual e2e snapshot guards the geometry.
        render(PersonNode, { person: person(), selected: true });
        const btn = screen.getByRole("treeitem");
        expect(btn.classList.contains("is-selected")).toBe(true);
        expect(btn.getAttribute("aria-selected")).toBe("true");
    });

    // roving-tabindex: selected card or the canvas-flagged first-focusable
    // card carries tabindex=0; every other card carries tabindex=-1 so the
    // tree appears as a single tab-stop from outside.
    it("default (not selected, not first-focusable) carries tabindex=-1", () => {
        render(PersonNode, { person: person() });
        expect(screen.getByRole("treeitem").getAttribute("tabindex")).toBe("-1");
    });

    it("selected card carries tabindex=0", () => {
        render(PersonNode, { person: person(), selected: true });
        expect(screen.getByRole("treeitem").getAttribute("tabindex")).toBe("0");
    });

    it("isFirstFocusable card carries tabindex=0 even without selection", () => {
        render(PersonNode, { person: person(), isFirstFocusable: true });
        expect(screen.getByRole("treeitem").getAttribute("tabindex")).toBe("0");
    });
});
