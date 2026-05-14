/*
 * FamilyTreeEditor - family-view couple helpers (Phase 2).
 *
 * Centralises the genealogy-convention orientation rule and the
 * primary-union resolution used by the subset selector, the layout
 * pass, and the renderer.
 *
 * Orientation rule: father-left / mother-right. For same-gender or
 * unknown-gender couples, deterministic tie-break by `personId`
 * ascending. Matches the hyperbolic engine's convention introduced in
 * commit `e3e7d8c`, so the same couple renders identically across all
 * three engines.
 *
 * Single-parent (degenerate) anchors keep the lone parent on the left
 * with `rightId === undefined`.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { CoupleRecord, PersonId, Tree } from "$lib/domain/types";
import { emitFinding } from "$lib/domain/findings";
import { defaultPrimaryUnion, unionsOf } from "$lib/layout/engines/family-view/primaryUnion";

export interface OrientedCouple {
    readonly leftId: PersonId;
    readonly rightId: PersonId;
    readonly coupleIndex: number;
    readonly couple: CoupleRecord;
}

/**
 * Apply the genealogy-conventional orientation rule. Returns leftId /
 * rightId in canvas-display order regardless of the order the
 * CoupleRecord stored them in.
 */
export function orientCouple(
    tree: Tree,
    couple: CoupleRecord,
    coupleIndex: number,
): OrientedCouple {
    const { leftId, rightId } = orientByIds(tree, couple.leftId, couple.rightId);
    return { leftId, rightId, coupleIndex, couple };
}

/**
 * Orientation rule applied to two raw person ids (no CoupleRecord
 * context). Used by `resolveRenderablePair` for the N>2 fallback and
 * by tests that construct synthetic anchors.
 */
export function orientByIds(
    tree: Tree,
    a: PersonId,
    b: PersonId,
): { readonly leftId: PersonId; readonly rightId: PersonId } {
    const ap = tree.people[a];
    const bp = tree.people[b];
    const aGender = ap?.gender ?? "u";
    const bGender = bp?.gender ?? "u";
    if (aGender === "m" && bGender !== "m") return { leftId: a, rightId: b };
    if (bGender === "m" && aGender !== "m") return { leftId: b, rightId: a };
    if (aGender === "f" && bGender !== "f") return { leftId: b, rightId: a };
    if (bGender === "f" && aGender !== "f") return { leftId: a, rightId: b };
    // Same / unknown gender: tie-break by personId ascending.
    return a <= b ? { leftId: a, rightId: b } : { leftId: b, rightId: a };
}

/**
 * Resolve `personId`'s primary union into a couple index, honouring any
 * user override map first. Returns undefined if the person has no unions.
 */
export function resolvePrimary(
    tree: Tree,
    personId: PersonId,
    overrides: ReadonlyMap<PersonId, number>,
): number | undefined {
    const override = overrides.get(personId);
    if (override !== undefined) {
        const c = tree.couples[override];
        if (c && (c.leftId === personId || c.rightId === personId)) return override;
        // Stale override (couple was removed) - fall through to default.
    }
    return defaultPrimaryUnion(tree, personId);
}

/**
 * The partner-of-`personId` in their primary union, or undefined when
 * the person has no unions / the primary union is a single-parent
 * degenerate record.
 */
export function primaryPartnerOf(
    tree: Tree,
    personId: PersonId,
    overrides: ReadonlyMap<PersonId, number>,
): PersonId | undefined {
    const idx = resolvePrimary(tree, personId, overrides);
    if (idx === undefined) return undefined;
    const c = tree.couples[idx];
    if (!c) return undefined;
    if (c.leftId === personId) return c.rightId;
    if (c.rightId === personId) return c.leftId;
    return undefined;
}

/**
 * The list of children for `personId` that should appear by default
 * under the primary union. Single-parent children (kids with only one
 * listed parent === personId) are always included regardless of which
 * union is primary — they're not behind any `˅` switch.
 */
export function primaryChildrenOf(
    tree: Tree,
    personId: PersonId,
    overrides: ReadonlyMap<PersonId, number>,
): readonly PersonId[] {
    const out = new Set<PersonId>();
    const primaryIdx = resolvePrimary(tree, personId, overrides);
    if (primaryIdx !== undefined) {
        const primary = tree.couples[primaryIdx];
        if (primary) for (const c of primary.childIds) out.add(c);
    }
    // Single-parent children: this person is the sole listed parent.
    for (const person of Object.values(tree.people)) {
        if (person.motherId === personId || person.fatherId === personId) {
            const other = person.motherId === personId ? person.fatherId : person.motherId;
            if (!other) out.add(person.id);
        }
    }
    return Array.from(out);
}

/** Count of unions this person is part of. */
export function unionCount(tree: Tree, personId: PersonId): number {
    return unionsOf(tree, personId).length;
}

/**
 * The list of partners other than the one in `primaryIdx` for
 * `personId`. Used by the `˅` picker to enumerate alternates.
 */
export function otherUnionsOf(
    tree: Tree,
    personId: PersonId,
    primaryIdx: number,
): readonly { readonly coupleIndex: number; readonly partnerId: PersonId | undefined }[] {
    const out: { readonly coupleIndex: number; readonly partnerId: PersonId | undefined }[] = [];
    for (const idx of unionsOf(tree, personId)) {
        if (idx === primaryIdx) continue;
        const c = tree.couples[idx];
        if (!c) continue;
        const partner = c.leftId === personId ? c.rightId : c.leftId;
        out.push({ coupleIndex: idx, partnerId: partner });
    }
    return out;
}

export interface RenderablePair {
    readonly leftId: PersonId;
    /** undefined for single-parent degenerate anchors (no partner card). */
    readonly rightId: PersonId | undefined;
}

/**
 * Resolve an arbitrary UnionAnchor's `partnerIds` (N≥0) into a
 * renderable pair under the v1 "N=2 only" geometry:
 *   - N=0 → null (nothing to draw)
 *   - N=1 → single-parent degenerate (rightId = undefined)
 *   - N=2 → oriented pair
 *   - N>2 → emit `multi-partner-unsupported` finding, render first two
 *
 * Tests construct synthetic 3-partner anchors and call this directly
 * to verify the fallback contract; the layout pass calls this only
 * indirectly (CoupleRecord is binary today, so production anchors are
 * always N≤2).
 */
export function resolveRenderablePair(
    tree: Tree,
    anchor: { readonly id: string; readonly partnerIds: readonly PersonId[] },
): RenderablePair | null {
    const n = anchor.partnerIds.length;
    if (n === 0) return null;
    if (n === 1) return { leftId: anchor.partnerIds[0]!, rightId: undefined };
    if (n > 2) {
        emitFinding(
            "multi-partner-unsupported",
            "multi-partner union rendered as primary pair only - v2 geometry pending",
            { anchorId: anchor.id, partnerCount: n },
        );
    }
    const oriented = orientByIds(tree, anchor.partnerIds[0]!, anchor.partnerIds[1]!);
    return { leftId: oriented.leftId, rightId: oriented.rightId };
}
