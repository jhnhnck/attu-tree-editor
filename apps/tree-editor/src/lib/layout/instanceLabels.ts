/*
 * FamilyTreeEditor - build a list of "where does this person appear" entries
 * for the link-icon popover. one entry per location: the primary card plus any
 * ghost duplicates the layout placed adjacent to spouses.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";
import { directChildren, getParents } from "$lib/domain/tree";
import { displayName } from "$lib/layout/kinship";
import type { HvLayoutResult } from "$lib/components/tree/canvasLayout";

export interface InstanceEntry {
    /** stable identity matching TreeCanvas's per-instance render key */
    instanceKey: string;
    label: string;
    sublabel: string;
    /** unit-coord position the canvas should pan to */
    x: number;
    y: number;
    isPrimary: boolean;
}

export function buildInstanceEntries(
    tree: Tree,
    layout: HvLayoutResult,
    personId: PersonId,
): InstanceEntry[] {
    const person = tree.people[personId];
    if (!person) return [];
    const label = displayName(tree, personId);
    const entries: InstanceEntry[] = [];

    const primary = layout.positions.get(personId);
    if (primary) {
        entries.push({
            instanceKey: personId,
            label,
            sublabel: primarySublabel(tree, personId),
            x: primary.x,
            y: primary.y,
            isPrimary: true,
        });
    }

    for (const g of layout.ghosts) {
        if (g.ghostOf !== personId) continue;
        entries.push({
            instanceKey: `${personId}-ghost-${g.nearId}`,
            label,
            sublabel: ghostSublabel(tree, personId, g.nearId),
            x: g.x,
            y: g.y,
            isPrimary: false,
        });
    }

    return entries;
}

function primarySublabel(tree: Tree, personId: PersonId): string {
    const p = tree.people[personId];
    if (!p) return "";
    const parents: string[] = [];
    for (const ref of getParents(p)) parents.push(displayName(tree, ref.personId));
    if (parents.length > 0) return `child of ${parents.join(", ")}`;
    if (p.spouseIds.length > 0) {
        const names = p.spouseIds.map((id) => displayName(tree, id));
        return `married to ${names.join(", ")}`;
    }
    return "unattached";
}

function ghostSublabel(tree: Tree, personId: PersonId, nearId: PersonId): string {
    const base = `married to ${displayName(tree, nearId)}`;
    const shared = directChildren(tree, personId).filter((cid) => {
        const c = tree.people[cid];
        if (!c) return false;
        return getParents(c).some((ref) => ref.personId === nearId);
    });
    if (shared.length === 0) return base;
    const names = shared.map((cid) => displayName(tree, cid));
    return `${base}; parent to ${names.join(", ")}`;
}
