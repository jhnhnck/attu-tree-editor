/*
 * FamilyTreeEditor - path highlight utilities
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { Path } from "$lib/layout/graph";
import type { RenderedSegment } from "$lib/components/tree/edges";

/**
 * Given a path from shortestPath(), find all segments that carry relationships in the path.
 * Returns segment IDs whose persons list contains consecutive path members.
 */
export function segmentsForPath(
    path: Path,
    segments: readonly RenderedSegment[],
): ReadonlySet<string> {
    const pairs = new Set<string>();
    for (let i = 0; i < path.ids.length - 1; i++) {
        const a = path.ids[i]!;
        const b = path.ids[i + 1]!;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        pairs.add(key);
    }

    const segmentIds = new Set<string>();
    for (const seg of segments) {
        if (!seg.persons || seg.persons.length < 2) continue;
        for (let i = 0; i < seg.persons.length - 1; i++) {
            const p = seg.persons[i]!;
            const q = seg.persons[i + 1]!;
            const key = p < q ? `${p}|${q}` : `${q}|${p}`;
            if (pairs.has(key)) {
                segmentIds.add(seg.id);
                break;
            }
        }
    }
    return segmentIds;
}
