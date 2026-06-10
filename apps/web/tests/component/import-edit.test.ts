/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - phase-1c migration of `tests/e2e/import-edit.spec.ts`.
 *
 * the original drove the import-wizard file picker against tiny.ged, then
 * asserted: post-import card count >= 3, clicking a card opens the personal
 * inspector with `given` / `surname` fields, the X button closes the
 * inspector back to the empty state. file-picker semantics are the only
 * playwright-only piece - the rest is structural and ports cleanly into
 * jsdom by parsing the fixture in-process via `loadGedcomFixture` and
 * mounting `TreeCanvas` + `Inspector` against the parsed tree.
 *
 * see notes/dev/test-strategy.md for the geometry-via-stubbed-host-rect
 * pattern; this spec uses `mountWithHostRect` rather than re-inlining the
 * `getBoundingClientRect` shim.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";

import ImportEditHarness from "./_harness/ImportEditHarness.svelte";
import { loadGedcomFixture } from "./_harness/loadGedcomFixture";
import { mountWithHostRect } from "./_harness/mountWithHostRect";

// resolve an input by its associated <label for=...> text. mirrors what
// `@testing-library/svelte` `getByLabelText` does, but scoped to the
// harness container so the lookup doesn't leak out into sibling mounts.
function queryByLabelText(root: HTMLElement, text: string): HTMLInputElement | null {
    const labels = root.querySelectorAll<HTMLLabelElement>("label");
    for (const label of labels) {
        if ((label.textContent ?? "").trim() === text) {
            const id = label.getAttribute("for");
            if (id) {
                const el = root.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`);
                if (el) return el;
            }
        }
    }
    return null;
}

describe("import-edit (jsdom port of tests/e2e/import-edit.spec.ts)", () => {
    beforeEach(() => {
        // TreeCanvas / PersonNode rely on scrollIntoView when selection
        // lands; jsdom omits it. matches the local stub in
        // `auto-fit-suppression.test.ts` and `smoke.test.ts`.
        if (!Element.prototype.scrollIntoView) {
            Element.prototype.scrollIntoView = vi.fn();
        }
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("renders >=3 cards, click selects, inspector shows fields, X closes", async () => {
        const tree = loadGedcomFixture("apps/web/tests/fixtures/tiny.ged");
        expect(Object.keys(tree.people).length).toBeGreaterThanOrEqual(3);

        const handle = mountWithHostRect(ImportEditHarness, {
            props: { tree },
            hostRect: { width: 1024, height: 768 },
        });
        await tick();
        await tick();

        // 1) card count: the canvas mounts at least one PersonNode per
        //    person in the parsed tree. tiny.ged has 3 INDI records
        //    (Alpha, Beta, Gamma Smith). assert >=3 to match the original
        //    spec exactly.
        const cards = handle.container.querySelectorAll<HTMLButtonElement>("[data-person-id]");
        expect(cards.length, "expected >=3 person cards from tiny.ged").toBeGreaterThanOrEqual(3);

        // 2) the inspector should start in its empty-state - no `given` /
        //    `surname` fields, just the tree-summary header. that matches
        //    the original test's implicit precondition (no selection set
        //    until the user clicks a card).
        expect(queryByLabelText(handle.container, "given")).toBeNull();
        expect(queryByLabelText(handle.container, "surname")).toBeNull();

        // 3) click the first card. PersonNode's button onclick fires
        //    onselect(id), which the harness pipes into its $state slot,
        //    which the Inspector reads as `selectedId`.
        const firstCard = cards[0];
        expect(firstCard).toBeDefined();
        const firstPersonId = firstCard!.getAttribute("data-person-id");
        expect(firstPersonId).toBeTruthy();

        await fireEvent.click(firstCard!);
        await tick();
        await tick();

        // 4) inspector now shows the personal tab with `given` and `surname`
        //    inputs labelled appropriately. these are the same getByLabel
        //    queries the original spec used.
        const givenInput = queryByLabelText(handle.container, "given");
        const surnameInput = queryByLabelText(handle.container, "surname");
        expect(
            givenInput,
            "inspector should render the given-name field after select",
        ).not.toBeNull();
        expect(
            surnameInput,
            "inspector should render the surname field after select",
        ).not.toBeNull();

        // 5) header carries the selected person's display name. resolve it
        //    from the tree by id so the assertion doesn't pin to a
        //    particular ordering of tiny.ged's records.
        const person = tree.people[firstPersonId as keyof typeof tree.people];
        expect(person, "the clicked card must resolve to a person in the tree").toBeDefined();
        const expectedName = [person!.given, person!.surname].filter(Boolean).join(" ").trim();
        if (expectedName) {
            expect(handle.container.textContent ?? "").toContain(expectedName);
        }

        // 6) click the inspector's close button. selectedId clears, the
        //    inspector flips back to its empty-state summary and the
        //    given/surname inputs go away. cards stay rendered.
        const closeBtn = handle.container.querySelector<HTMLButtonElement>(
            'button[aria-label="close inspector"]',
        );
        expect(closeBtn, "inspector should expose a close button").not.toBeNull();
        await fireEvent.click(closeBtn!);
        await tick();
        await tick();

        expect(
            queryByLabelText(handle.container, "given"),
            "given field should disappear after close",
        ).toBeNull();
        expect(
            queryByLabelText(handle.container, "surname"),
            "surname field should disappear after close",
        ).toBeNull();

        // sanity: cards survive the inspector close, matching the original
        // spec's last assertion that the canvas remains after dismiss.
        const cardsAfterClose = handle.container.querySelectorAll("[data-person-id]");
        expect(cardsAfterClose.length).toBeGreaterThanOrEqual(3);

        handle.unmount();
    });
});
