/*
 * FamilyTreeEditor - adapt our domain Tree into relatives-tree input + run layout
 * licensed under the MIT license; see LICENSE.md for full text
 */

import calcTree from "relatives-tree";
import type { Connector, ExtNode, Node, Relation, RelData } from "relatives-tree/lib/types";
import type { Gender as LayoutGender, RelType } from "relatives-tree/lib/types";
import type { Person, PersonId, Tree } from "$lib/domain/types";

// relatives-tree's Gender + RelType are const enums; with isolatedModules we
// can't reference their members. The runtime values are plain strings, so we
// cast our own literals into the enum slots.
const GENDER_MALE = "male" as unknown as LayoutGender;
const GENDER_FEMALE = "female" as unknown as LayoutGender;
const REL_BLOOD = "blood" as unknown as RelType;
const REL_MARRIED = "married" as unknown as RelType;

// gap between disconnected components, in unit coords (relatives-tree's SIZE=2)
const COMPONENT_GAP = 4;

export interface ComponentInfo {
    rootId: PersonId;
    /** how many domain People belong to this component */
    size: number;
    /** how many positions ended up in the layout output (placeholders included) */
    laidOutCount: number;
    /** horizontal offset (in unit coords) where this component starts */
    offsetLeft: number;
}

export interface AdaptResult {
    /** combined layout output across every connected component */
    layout: RelData;
    /** the relatives-tree Node[] we fed in (useful for testing + debugging) */
    nodes: readonly Node[];
    /** per-component diagnostic info */
    components: readonly ComponentInfo[];
    /** people that have no relations at all - rendered separately as a grid */
    isolated: readonly PersonId[];
    /** convenience: total people vs people the layout actually positioned */
    totalPeople: number;
    laidOutPeople: number;
}

/**
 * Translate a domain Tree into relatives-tree input and compute layout positions.
 *
 * relatives-tree's `calcTree` only walks reachable nodes from a single rootId.
 * For real-world imports (FamilyEcho exports often have multiple disconnected
 * branches) that means everyone outside the root's blood/marriage graph would
 * silently disappear. We work around that by detecting connected components
 * over (parent, child, spouse) edges and running `calcTree` on each component
 * separately, then stitching the resulting layouts horizontally.
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
    const nodeById = new Map<PersonId, Node>();
    for (const person of Object.values(tree.people)) {
        const n = buildNode(person, peopleIds, childrenByParent, tree);
        nodes.push(n);
        nodeById.set(person.id, n);
    }

    const components = findConnectedComponents(nodes);

    // people with zero relations form their own single-member components -
    // we collect them into one rendered "isolated" cluster instead of giving
    // each a tiny calcTree pass
    const isolated: PersonId[] = [];
    const realComponents: PersonId[][] = [];
    for (const comp of components) {
        if (comp.length === 1) {
            const only = comp[0];
            if (only !== undefined) isolated.push(only);
        } else {
            realComponents.push(comp);
        }
    }

    // ensure the component containing tree.rootId comes first so the user
    // sees the canonical anchor in the upper-left of the canvas
    realComponents.sort((a, b) => {
        const aHasRoot = a.includes(tree.rootId) ? -1 : 0;
        const bHasRoot = b.includes(tree.rootId) ? -1 : 0;
        return aHasRoot - bHasRoot || b.length - a.length;
    });

    const combinedNodes: ExtNode[] = [];
    const combinedConnectors: Connector[] = [];
    const componentInfo: ComponentInfo[] = [];
    let xOffset = 0;
    let maxHeight = 0;

    for (const compIds of realComponents) {
        const compRootId = pickComponentRoot(compIds, tree);
        const compNodes = compIds.map((id) => nodeById.get(id)).filter((n): n is Node => !!n);
        let compLayout: RelData;
        try {
            compLayout = calcTree(compNodes, { rootId: compRootId, placeholders: true });
        } catch (e) {
            console.warn(`[layout] component ${componentInfo.length} layout failed; using grid`, e);
            compLayout = fallbackGrid(compNodes);
        }
        for (const n of compLayout.nodes) {
            combinedNodes.push({ ...n, left: n.left + xOffset });
        }
        for (const c of compLayout.connectors) {
            combinedConnectors.push([c[0] + xOffset, c[1], c[2] + xOffset, c[3]]);
        }
        componentInfo.push({
            rootId: compRootId,
            size: compIds.length,
            laidOutCount: compLayout.nodes.length,
            offsetLeft: xOffset,
        });
        xOffset += compLayout.canvas.width + COMPONENT_GAP;
        if (compLayout.canvas.height > maxHeight) maxHeight = compLayout.canvas.height;
    }

    // append the isolated cluster (if any) below the component row, in a grid
    if (isolated.length > 0) {
        const cols = Math.max(1, Math.ceil(Math.sqrt(isolated.length)));
        const rowY = maxHeight + COMPONENT_GAP;
        for (const [i, pid] of isolated.entries()) {
            const node = nodeById.get(pid);
            if (!node) continue;
            const col = i % cols;
            const row = Math.floor(i / cols);
            combinedNodes.push({
                ...node,
                left: col * 3,
                top: rowY + row * 3,
                hasSubTree: false,
            });
        }
        const isolatedHeight = Math.ceil(isolated.length / cols) * 3;
        maxHeight = rowY + isolatedHeight;
        if (cols * 3 > xOffset) xOffset = cols * 3;
    }

    const layout: RelData = {
        canvas: {
            width: Math.max(xOffset, 1),
            height: Math.max(maxHeight, 1),
        },
        families: [],
        nodes: combinedNodes,
        connectors: combinedConnectors,
    };

    // count only real domain people, not relatives-tree's synthetic spouse
    // placeholders (those carry placeholder=true and an id we never minted)
    const realIds = new Set<PersonId>(nodes.map((n) => n.id));
    let laidOutPeople = 0;
    for (const n of combinedNodes) {
        if (realIds.has(n.id)) laidOutPeople += 1;
    }

    console.debug(
        "[layout] %d people laid out across %d component(s)",
        laidOutPeople,
        componentInfo.length,
    );

    return {
        layout,
        nodes,
        components: componentInfo,
        isolated,
        totalPeople: nodes.length,
        laidOutPeople,
    };
}

/**
 * BFS over (parent, child, spouse) edges. Returns a list of components, each a
 * list of person ids. Edges are derived from the Node[] (which has already
 * filtered out references to non-existent people).
 */
function findConnectedComponents(nodes: readonly Node[]): PersonId[][] {
    const adj = new Map<PersonId, Set<PersonId>>();
    function link(a: PersonId, b: PersonId): void {
        if (a === b) return;
        const sa = adj.get(a) ?? new Set();
        sa.add(b);
        adj.set(a, sa);
        const sb = adj.get(b) ?? new Set();
        sb.add(a);
        adj.set(b, sb);
    }
    for (const n of nodes) {
        if (!adj.has(n.id)) adj.set(n.id, new Set());
        for (const r of n.parents) link(n.id, r.id);
        for (const r of n.children) link(n.id, r.id);
        for (const r of n.spouses) link(n.id, r.id);
    }

    const seen = new Set<PersonId>();
    const components: PersonId[][] = [];
    for (const n of nodes) {
        if (seen.has(n.id)) continue;
        const comp: PersonId[] = [];
        const queue: PersonId[] = [n.id];
        while (queue.length > 0) {
            const id = queue.shift();
            if (id === undefined || seen.has(id)) continue;
            seen.add(id);
            comp.push(id);
            const neighbors = adj.get(id);
            if (!neighbors) continue;
            for (const next of neighbors) {
                if (!seen.has(next)) queue.push(next);
            }
        }
        components.push(comp);
    }
    return components;
}

/**
 * Pick a layout root for a component. Prefers the tree's canonical rootId if
 * it's in this component; otherwise the first member without parents (an
 * "elder"); otherwise the first id in arrival order.
 */
function pickComponentRoot(compIds: readonly PersonId[], tree: Tree): PersonId {
    if (compIds.includes(tree.rootId)) return tree.rootId;
    for (const id of compIds) {
        const p = tree.people[id];
        if (!p) continue;
        if (!p.motherId && !p.fatherId) return id;
    }
    const fallback = compIds[0];
    if (fallback === undefined) {
        throw new Error("pickComponentRoot called on an empty component");
    }
    return fallback;
}

function fallbackGrid(nodes: readonly Node[]): RelData {
    const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    const positioned: ExtNode[] = nodes.map((n, i) => ({
        ...n,
        left: (i % cols) * 3,
        top: Math.floor(i / cols) * 3,
        hasSubTree: false,
    }));
    return {
        canvas: { width: cols * 3, height: Math.ceil(nodes.length / cols) * 3 },
        families: [],
        nodes: positioned,
        connectors: [],
    };
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
