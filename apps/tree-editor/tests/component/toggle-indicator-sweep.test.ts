/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - toggle-indicator visible-state SWEEP (cluster-3 invariant)
 *
 * extends the phase-0 skeleton (`toggle-indicator-visible-state.test.ts`)
 * from a single overlay toggle to every checked-bearing entry in the
 * command registry. for each toggle: render the menu twice (checked:false
 * then checked:true), open the menu, capture the menuitem's outerHTML,
 * and assert the two snapshots differ at the lucide-icon class level.
 *
 * cluster-3 historical regression targets:
 *   e9ea981 - "fix(menu): tri-state toggle indicator so View > Overlays
 *             off-state reads" - overlays rendered identical dom in
 *             on/off; fix introduced the outlined Square off-state.
 *   73a9a53 - "fix(debug): swap class set instead of overlaying so
 *             active toggle state actually shows" - same shape on the
 *             debug menu's active toggle.
 *
 * the registry uses `role="menuitem"` with a tri-state icon (not
 * `role="menuitemcheckbox"` per the menu.ts contract), so the sweep
 * targets the union of:
 *   - every command in commands.ts with a `checked: () => boolean`
 *     (the View > engines + View > overlays cluster, 10 entries today)
 *
 * any toggle whose off-state HTML matches its on-state HTML is logged
 * by name in the failing assertion - that's a phase-6 finding to
 * triage as a possible cluster-3 regression.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import MenuHarness from "./_harness/MenuHarness.svelte";
import type { MenuEntry } from "$lib/components/shell/menu";

/**
 * the full set of toggle-bearing menu entries from the registry. mirrors
 * `commands.ts` checked entries exactly (10 toggles as of phase 6). if
 * the registry grows a new toggle, add it here; the sweep will catch
 * any newcomer whose off/on icon set is identical.
 */
const TOGGLE_LABELS = [
    "Use family view",
    "Use layered engine",
    "Use hyperbolic engine",
    "Overlay: path highlight",
    "Overlay: generation badges",
    "Overlay: sworn bonds",
    "Overlay: transformations",
    "Overlay: severances",
    "Overlay: group frames",
    "Overlay: consanguinity",
] as const;

function itemsFor(checked: boolean): MenuEntry[] {
    return TOGGLE_LABELS.map((label) => ({
        label,
        checked,
        onclick: () => {},
    }));
}

async function openMenuAndSnapshotItems(): Promise<Map<string, string>> {
    const button = screen.getByRole("button", { name: /view/i });
    await fireEvent.click(button);
    await tick();
    await tick();
    const items = screen.getAllByRole("menuitem");
    const map = new Map<string, string>();
    for (const el of items) {
        // the label text is the first <span class="flex-1">; we keep the
        // full menuitem outerHTML because the indicator (Check vs Square)
        // sits as a trailing sibling and a diff anywhere in the subtree
        // proves the visible-state delta we care about.
        const labelEl = el.querySelector("span.flex-1");
        const label = labelEl?.textContent?.trim() ?? "";
        map.set(label, el.outerHTML);
    }
    return map;
}

describe("toggle-indicator visible-state SWEEP", () => {
    it("every toggle in the View menu renders a visible delta between off and on", async () => {
        // off-state snapshot
        render(MenuHarness, { label: "View", items: itemsFor(false) });
        const offSnapshots = await openMenuAndSnapshotItems();
        cleanup();

        // on-state snapshot - fresh mount so the dom restarts clean
        render(MenuHarness, { label: "View", items: itemsFor(true) });
        const onSnapshots = await openMenuAndSnapshotItems();

        // every label we asked for should appear in both snapshots
        for (const label of TOGGLE_LABELS) {
            expect(offSnapshots.has(label), `missing ${label} in off snapshot`).toBe(true);
            expect(onSnapshots.has(label), `missing ${label} in on snapshot`).toBe(true);
        }

        // collect any toggles whose off-state and on-state are byte-identical
        // - those are the cluster-3 bug shape (no visible state delta).
        const offenders: string[] = [];
        for (const label of TOGGLE_LABELS) {
            const off = offSnapshots.get(label)!;
            const on = onSnapshots.get(label)!;
            if (off === on) offenders.push(label);
        }
        expect(offenders, `toggles with no visible state delta: ${offenders.join(", ")}`).toEqual(
            [],
        );
    });

    it("every toggle's lucide icon class set differs between off and on", async () => {
        // tighter shape than the raw outerHTML diff: pin the specific
        // visible affordance (the Check vs Square icon swap from e9ea981).
        // collapsing the two icons back to one identifier would tip this
        // even if some surrounding markup also changed.
        render(MenuHarness, { label: "View", items: itemsFor(false) });
        const offSnapshots = await openMenuAndSnapshotItems();
        cleanup();

        render(MenuHarness, { label: "View", items: itemsFor(true) });
        const onSnapshots = await openMenuAndSnapshotItems();

        const offenders: string[] = [];
        for (const label of TOGGLE_LABELS) {
            const offClasses = (offSnapshots.get(label)!.match(/lucide-[a-z-]+/g) ?? []).sort();
            const onClasses = (onSnapshots.get(label)!.match(/lucide-[a-z-]+/g) ?? []).sort();
            // both states must have at least one lucide icon (the indicator).
            // an empty set means the indicator silently disappeared.
            if (offClasses.length === 0 || onClasses.length === 0) {
                offenders.push(`${label} (missing icon)`);
                continue;
            }
            if (JSON.stringify(offClasses) === JSON.stringify(onClasses)) {
                offenders.push(label);
            }
        }
        expect(
            offenders,
            `toggles with identical lucide icon set: ${offenders.join(", ")}`,
        ).toEqual([]);
    });
});
