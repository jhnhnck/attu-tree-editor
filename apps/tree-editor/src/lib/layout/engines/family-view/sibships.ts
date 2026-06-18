/*
 * FamilyTreeEditor - family-view sibship walker (Phase 6b).
 *
 * Reads `tree.sibshipDecorators[]` (added in schema 3.4.0) and emits
 * one `SibshipFrame` per decorator with computed geometry: the
 * bracket spans the visible siblings' x-range and lives just above
 * the topmost member's row top, between the parent bus and the
 * child cards. The frame carries a `tieBar` style derived from
 * `kind` — MZ → solid, DZ → none, ? → dashed, clone-batch → double,
 * litter / spawned-together / non-canonical → none.
 *
 * Engine-private. Decorators whose members aren't all visible in
 * the current layout pass emit nothing — the bracket only makes
 * sense when every sibling can be drawn.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, SibshipDecorator, Tree } from "$lib/domain/types";
import { PERSON_W } from "$lib/layout/constants";
import { CARD_H } from "$lib/layout/engines/family-view/layout";
import type { FamilyViewNode } from "$lib/layout/engines/family-view/types";

export type SibshipTieBar = "solid" | "dashed" | "double" | "none";

export interface SibshipFrame {
    readonly id: string;
    readonly kind: string;
    readonly tieBar: SibshipTieBar;
    readonly memberIds: readonly PersonId[];
    /** y just above the topmost member's card top, in unit space. */
    readonly bracketY: number;
    /** Per-member midX in unit space — render the bracket spanning min..max. */
    readonly members: readonly { readonly personId: PersonId; readonly x: number }[];
    readonly name?: string;
}

/**
 * Map a kind string to a tie-bar style. Canonical: MZ → solid, DZ →
 * none, ? → dashed, clone-batch → double. Everything else → none.
 */
function tieBarForKind(kind: string): SibshipTieBar {
    if (kind === "clone-batch") return "double";
    if (kind.endsWith("-MZ")) return "solid";
    if (kind.endsWith("-DZ")) return "none";
    if (kind.endsWith("-?")) return "dashed";
    return "none";
}

/**
 * Walk every sibship decorator in the tree. For each, require every
 * member to be visible (= present in the `nodes` map); compute the
 * bracket geometry from member positions. Emits frames in
 * `tree.sibshipDecorators[]` order so the renderer stacks consistently.
 */
export function buildSibships(
    tree: Tree,
    nodes: ReadonlyMap<PersonId, FamilyViewNode>,
): readonly SibshipFrame[] {
    const out: SibshipFrame[] = [];
    for (const d of tree.sibshipDecorators ?? []) {
        const frame = buildOneFrame(d, nodes);
        if (frame) out.push(frame);
    }
    return out;
}

function buildOneFrame(
    d: SibshipDecorator,
    nodes: ReadonlyMap<PersonId, FamilyViewNode>,
): SibshipFrame | null {
    if (d.sibIds.length < 2) return null;
    const members: { personId: PersonId; x: number; y: number; h: number }[] = [];
    for (const id of d.sibIds) {
        const n = nodes.get(id);
        if (!n) return null;
        members.push({ personId: id, x: n.x + PERSON_W / 2, y: n.y, h: n.h ?? CARD_H });
    }
    // Bracket lives just above the topmost member's card top, far
    // enough to render a 1-2px stroke without clipping the row.
    // 0.18u ≈ 14px at UNIT=80 — fits the tie-bar plus a small gap.
    const topMember = members.reduce((a, b) => (a.y <= b.y ? a : b));
    const bracketY = topMember.y - 0.18;
    const frame: SibshipFrame = {
        id: d.id,
        kind: d.kind,
        tieBar: tieBarForKind(d.kind),
        memberIds: [...d.sibIds],
        bracketY,
        members: members.map((m) => ({ personId: m.personId, x: m.x })),
        ...(d.name !== undefined ? { name: d.name } : {}),
    };
    return frame;
}
