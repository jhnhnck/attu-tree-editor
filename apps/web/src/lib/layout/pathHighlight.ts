/*
 * FamilyTreeEditor - path highlight utilities
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { Path } from "$lib/layout/graph";
import type { RenderedSegment } from "$lib/components/tree/edges";

/**
 * Given a path from shortestPath(), find the bundle ids whose persons list
 * contains consecutive path members. EdgeLayer renders one `<path>` per
 * bundle; highlighting at the bundle level lights up the entire connector
 * (bond + drops + bus + child-drops) for a relationship, which matches the
 * user mental model better than picking the single segment a path crosses.
 */
export function bundlesForPath(
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

    const bundleIds = new Set<string>();
    for (const seg of segments) {
        if (!seg.persons || seg.persons.length < 2) continue;
        for (let i = 0; i < seg.persons.length - 1; i++) {
            const p = seg.persons[i]!;
            const q = seg.persons[i + 1]!;
            const key = p < q ? `${p}|${q}` : `${q}|${p}`;
            if (pairs.has(key)) {
                bundleIds.add(seg.bundleId);
                break;
            }
        }
    }
    return bundleIds;
}

/** @deprecated kept for back-compat during the Phase 4.2 rollout; prefer `bundlesForPath`. */
export const segmentsForPath = bundlesForPath;
