/*
 * FamilyTreeEditor - "what fields will be dropped on this export" data
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";

/*
 * Only export targets the editor actually offers; bare GEDCOM and bare
 * FamilyScript exports were retired so we don't have to maintain warnings
 * for round-trips no UI surface invokes.
 */
export type ExportTarget = "gedzip" | "json";

export interface ExportWarning {
    field: string;
    affectedPersonIds: PersonId[];
    reason: string;
}

export function fieldsDroppedFor(tree: Tree, target: ExportTarget): ExportWarning[] {
    const warnings: ExportWarning[] = [];
    const persons = Object.values(tree.people);

    if (target === "gedzip") {
        const faded = persons.filter((p) => p.display === "z0").map((p) => p.id);
        if (faded.length > 0) {
            warnings.push({
                field: "display",
                affectedPersonIds: faded,
                reason: "GEDCOM has no equivalent for the FamilyEcho 'faded' display flag",
            });
        }
        const anchored = persons
            .filter(
                (p) =>
                    p.anchorParentId !== undefined &&
                    p.anchorParentId !== p.fatherId &&
                    p.anchorParentId !== p.motherId,
            )
            .map((p) => p.id);
        if (anchored.length > 0) {
            warnings.push({
                field: "anchorParent",
                affectedPersonIds: anchored,
                reason: "GEDCOM has no slot for FamilyEcho's '^' sibling-ordering anchor when it differs from the bio parents",
            });
        }
        const withOrigin = persons.filter((p) => p.locationOrigin !== undefined).map((p) => p.id);
        if (withOrigin.length > 0) {
            warnings.push({
                field: "locationOrigin",
                affectedPersonIds: withOrigin,
                reason: "GEDCOM has no equivalent for FamilyEcho's 'q' location-of-origin tag",
            });
        }
        if (tree.couples.some((c) => c.unionIndex !== 0)) {
            warnings.push({
                field: "couple.unionIndex",
                affectedPersonIds: [],
                reason: "GEDCOM has no equivalent for FamilyEcho's per-union ordering counter",
            });
        }
        const withWiki = persons.filter((p) => p.wikiTitle !== undefined).map((p) => p.id);
        if (withWiki.length > 0) {
            warnings.push({
                field: "wikiTitle",
                affectedPersonIds: withWiki,
                reason: "wiki link is preserved only in the native JSON export",
            });
        }
    }

    // 'json' is full-fidelity; nothing to warn about
    return warnings;
}
