/*
 * FamilyTreeEditor - adapt our domain Tree into relatives-tree input + run layout
 * licensed under the MIT license; see LICENSE.md for full text
 */

import calcTree from "relatives-tree";
import type { Node, Relation, RelData } from "relatives-tree/lib/types";
import type { Gender as LayoutGender, RelType } from "relatives-tree/lib/types";
import type { Person, PersonId, Tree } from "$lib/domain/types";

// relatives-tree's Gender + RelType are const enums; with isolatedModules we
// can't reference their members. The runtime values are plain strings, so we
// cast our own literals into the enum slots.
const GENDER_MALE = "male" as unknown as LayoutGender;
const GENDER_FEMALE = "female" as unknown as LayoutGender;
const REL_BLOOD = "blood" as unknown as RelType;
const REL_MARRIED = "married" as unknown as RelType;

export interface AdaptResult {
    /** layout output: positioned nodes + connectors + canvas size */
    layout: RelData;
    /** the relatives-tree Node[] we fed in (useful for testing + debugging) */
    nodes: readonly Node[];
}

/**
 * Translate a domain Tree into relatives-tree input and compute layout positions.
 *
 * Drops references to ids that don't exist in `tree.people` (orphans show up
 * as findings via validate.ts elsewhere). Coerces unknown gender to male so
 * layout stays deterministic - the renderer reads gender from our domain model
 * directly, not from the layout result.
 */
export function adaptToLayout(tree: Tree): AdaptResult {
    const peopleIds = new Set<PersonId>(Object.keys(tree.people));
    const childrenByParent = indexChildrenByParent(tree, peopleIds);

    const nodes: Node[] = [];
    for (const person of Object.values(tree.people)) {
        nodes.push(buildNode(person, peopleIds, childrenByParent, tree));
    }

    const layout = calcTree(nodes, { rootId: tree.rootId, placeholders: true });
    return { layout, nodes };
}

function indexChildrenByParent(
    tree: Tree,
    peopleIds: ReadonlySet<PersonId>,
): Map<PersonId, PersonId[]> {
    const out = new Map<PersonId, PersonId[]>();
    for (const child of Object.values(tree.people)) {
        const parents: PersonId[] = [];
        if (child.motherId && peopleIds.has(child.motherId)) parents.push(child.motherId);
        if (child.fatherId && peopleIds.has(child.fatherId)) parents.push(child.fatherId);
        for (const pid of parents) {
            const list = out.get(pid) ?? [];
            list.push(child.id);
            out.set(pid, list);
        }
    }
    return out;
}

function buildNode(
    person: Person,
    peopleIds: ReadonlySet<PersonId>,
    childrenByParent: ReadonlyMap<PersonId, readonly PersonId[]>,
    tree: Tree,
): Node {
    const parents: Relation[] = [];
    if (person.motherId && peopleIds.has(person.motherId)) {
        parents.push({ id: person.motherId, type: REL_BLOOD });
    }
    if (person.fatherId && peopleIds.has(person.fatherId)) {
        parents.push({ id: person.fatherId, type: REL_BLOOD });
    }

    const childIds = childrenByParent.get(person.id) ?? [];
    const children: Relation[] = childIds.map((id) => ({ id, type: REL_BLOOD }));

    const spouses: Relation[] = [];
    for (const sid of person.spouseIds) {
        if (sid === person.id) continue; // self-couples confuse the layout
        if (!peopleIds.has(sid)) continue;
        spouses.push({ id: sid, type: REL_MARRIED });
    }

    const siblings: Relation[] = collectSiblings(person, peopleIds, tree).map((id) => ({
        id,
        type: REL_BLOOD,
    }));

    return {
        id: person.id,
        gender: person.gender === "f" ? GENDER_FEMALE : GENDER_MALE,
        parents,
        children,
        siblings,
        spouses,
    };
}

function collectSiblings(person: Person, peopleIds: ReadonlySet<PersonId>, tree: Tree): PersonId[] {
    if (!person.motherId && !person.fatherId) return [];
    const out: PersonId[] = [];
    for (const other of Object.values(tree.people)) {
        if (other.id === person.id) continue;
        if (!peopleIds.has(other.id)) continue;
        const sharesMother = !!person.motherId && other.motherId === person.motherId;
        const sharesFather = !!person.fatherId && other.fatherId === person.fatherId;
        if (sharesMother || sharesFather) out.push(other.id);
    }
    return out;
}
