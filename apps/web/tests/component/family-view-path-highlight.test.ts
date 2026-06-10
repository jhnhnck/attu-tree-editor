/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - family-view path highlight: clicking a card other
 * than the focus paints the BFS path focus->selected with
 * `data-on-path="true"` on every intermediate card wrapper. clicking
 * the focus collapses to a one-card path; clicking again clears it.
 *
 * jsdom port of the legacy `tests/e2e/family-view-path-highlight.spec.ts`.
 * the e2e logic-tested attribute presence, not pixel state - which is
 * exactly what data-attribute lookups in jsdom can verify. selection
 * comes in as a prop driven by the harness (mirroring App.svelte's
 * onselect callback wiring), so the controlled-selectedId path is
 * straight-line.
 *
 * fixture: tests/fixtures/multi-union.ged - aron is root (focus),
 * calen is his child via mira. path aron->calen has length 2.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { tick, mount, unmount } from "svelte";
import { fireEvent } from "@testing-library/svelte";

import FamilyViewCanvas from "$lib/components/tree/FamilyViewCanvas.svelte";
import type { PersonId } from "$lib/domain/types";
import { loadGedcomFixture } from "./_harness/loadGedcomFixture";

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

// inlined mountWithHostRect-equivalent so we can re-render after a
// prop change. mountWithHostRect doesn't expose a setter; here we keep
// a state-shaped wrapper and patch selectedId in place via a fresh
// mount() call. simpler than wiring an external store for two tests.
function setupHostRect(rect: { width: number; height: number }): () => void {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
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

function findCardByName(root: ParentNode, needle: RegExp): HTMLElement | null {
    return (
        Array.from(root.querySelectorAll<HTMLElement>("[data-person-id]")).find((el) =>
            needle.test(el.textContent ?? ""),
        ) ?? null
    );
}

describe("family-view: path highlight", () => {
    it("no selection -> no data-on-path markers anywhere", async () => {
        const restore = setupHostRect({ width: 1024, height: 768 });
        const tree = loadGedcomFixture("apps/web/tests/fixtures/multi-union.ged");
        const target = document.createElement("div");
        document.body.appendChild(target);
        const inst = mount(FamilyViewCanvas, { target, props: { tree } });
        await tick();
        await tick();

        expect(target.querySelectorAll("[data-on-path='true']").length).toBe(0);

        void unmount(inst);
        target.remove();
        restore();
    });

    it("selecting a non-focus relative paints data-on-path on every card on the BFS path", async () => {
        const restore = setupHostRect({ width: 1024, height: 768 });
        const tree = loadGedcomFixture("apps/web/tests/fixtures/multi-union.ged");
        const target = document.createElement("div");
        document.body.appendChild(target);

        let selected: PersonId | undefined;
        const inst = mount(FamilyViewCanvas, {
            target,
            props: {
                tree,
                get selectedId(): PersonId | undefined {
                    return selected;
                },
                onselect: (id: PersonId) => {
                    selected = id;
                },
            },
        });
        await tick();
        await tick();

        const calen = findCardByName(target, /Calen/);
        expect(calen, "calen card should render under default subset").not.toBeNull();
        await fireEvent.click(calen!);
        // selection state was captured by the onselect callback; we
        // need the canvas to re-read it. remount with the captured id
        // as a fixed prop to drive the renderer.
        void unmount(inst);

        const inst2 = mount(FamilyViewCanvas, {
            target,
            props: { tree, selectedId: selected },
        });
        await tick();
        await tick();

        // aria-selected lands on the picked card
        const calen2 = findCardByName(target, /Calen/);
        expect(calen2?.getAttribute("aria-selected")).toBe("true");

        // path = [aron, calen]; aron is activeFocus so it is excluded from
        // the path ring (it has its own root styling). only calen gets it.
        const onPath = target.querySelectorAll("[data-on-path='true']");
        expect(onPath.length).toBe(1);

        // calen's wrapper should be the one carrying the path ring
        const calenOnPath = Array.from(onPath).find((el) => /Calen/.test(el.textContent ?? ""));
        expect(calenOnPath, "selected card wrapper should be on-path").toBeDefined();

        void unmount(inst2);
        target.remove();
        restore();
    });

    it("bond-edge path highlight: only the bond between the two path endpoints lights up, not the spouse's other unions", async () => {
        // regression: before the fix, selecting a spouse who had other unions caused
        // those other bond edges to also receive family-view-onpath-edge because the
        // "any implicated person on path" logic matched the shared spouse id.
        //
        // fixture: aron (root) has two unions — F1 with mira, F2 with sera.
        // selecting mira puts [aron, mira] on-path. only bond:aronId|miraId|N
        // should be on-path; bond:aronId|seraId|N must NOT be on-path.
        const restore = setupHostRect({ width: 1024, height: 768 });
        const tree = loadGedcomFixture("apps/web/tests/fixtures/multi-union.ged");

        // resolve ids by given name (surnames differ so given-name lookup is unambiguous here)
        function findId(given: string): PersonId {
            const entry = Object.entries(tree.people).find(([, p]) => p.given === given);
            if (!entry) throw new Error(`person not found: ${given}`);
            return entry[0];
        }
        const miraId = findId("Mira");
        const seraId = findId("Sera");

        const target = document.createElement("div");
        document.body.appendChild(target);

        const inst = mount(FamilyViewCanvas, {
            target,
            props: { tree, selectedId: miraId },
        });
        await tick();
        await tick();

        // find all edges that are on-path (carry family-view-onpath-edge class)
        const onPathEdges = Array.from(
            target.querySelectorAll<SVGPathElement>("[data-edge-id]"),
        ).filter((el) => el.classList.contains("family-view-onpath-edge"));

        // no bond edge involving sera should be on-path
        const seraOnPathBond = onPathEdges.find((el) => {
            const id = el.dataset.edgeId ?? "";
            return id.startsWith("bond:") && id.includes(seraId);
        });
        expect(
            seraOnPathBond,
            "sera's bond edge must NOT be on-path when mira is selected",
        ).toBeUndefined();

        // at least one bond edge involving mira should be on-path
        const miraOnPathBond = onPathEdges.find((el) => {
            const id = el.dataset.edgeId ?? "";
            return id.startsWith("bond:") && id.includes(miraId);
        });
        expect(miraOnPathBond, "mira's bond edge should be on-path").toBeDefined();

        void unmount(inst);
        target.remove();
        restore();
    });

    it("selecting the focus collapses the path to one card; clearing selection clears it", async () => {
        const restore = setupHostRect({ width: 1024, height: 768 });
        const tree = loadGedcomFixture("apps/web/tests/fixtures/multi-union.ged");
        const aronId = tree.rootId;
        const target = document.createElement("div");
        document.body.appendChild(target);

        // mount with focus already selected - one-card path
        const inst = mount(FamilyViewCanvas, {
            target,
            props: { tree, selectedId: aronId },
        });
        await tick();
        await tick();

        const aron = findCardByName(target, /Aron/);
        expect(aron?.getAttribute("aria-selected")).toBe("true");
        expect(target.querySelectorAll("[data-on-path='true']").length).toBe(1);

        void unmount(inst);
        // remount with no selection - path clears
        const inst2 = mount(FamilyViewCanvas, { target, props: { tree } });
        await tick();
        await tick();

        expect(target.querySelectorAll("[data-on-path='true']").length).toBe(0);

        void unmount(inst2);
        target.remove();
        restore();
    });
});
