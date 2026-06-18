/*
 * FamilyTreeEditor - n-way ImportPayload fold. The wizard accepts multiple
 * files in a single import; this helper composes them in drop order via
 * the existing pairwise `mergeTrees`, accumulating PortraitBlobs across
 * sources and remapping each incoming portrait's personId via the merge's
 * bIdMap so blobs still attach to their (possibly renamed) target.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId } from "$lib/domain/types";
import type { ImportPayload, ImportSourceFormat } from "$lib/io/importFile";
import type { PortraitBlob } from "$lib/io/bundle/write";
import { mergeTrees, type MergeSource } from "$lib/io/merge/merge";
import type { Finding } from "$lib/domain/validate";

export interface ComposeResult {
    payload: ImportPayload;
    findings: Finding[];
}

function mergeSourceFor(format: ImportSourceFormat): MergeSource {
    // mergeTrees only models familyscript and gedcom for its source label;
    // gedzip and html ride along under "gedcom" since they're closer to the
    // structured shape than the line-by-line FS source.
    return format === "familyscript" ? "familyscript" : "gedcom";
}

/**
 * Compose N ImportPayloads in left-fold order. The resulting payload's
 * tree is the merge accumulator; portraits accumulate across sources with
 * personIds remapped through each step's bIdMap. Source format is reported
 * as "merged" when N > 1, or the single source format otherwise.
 *
 * Determinism: same inputs in the same order produce the same result. The
 * wizard's drag-drop order is the fold order.
 */
export function composeImports(payloads: ImportPayload[]): ComposeResult {
    if (payloads.length === 0) {
        throw new Error("composeImports requires at least one payload");
    }
    if (payloads.length === 1) {
        const single = payloads[0];
        if (!single) throw new Error("composeImports: payload[0] missing");
        return { payload: single, findings: [] };
    }

    const first = payloads[0];
    if (!first) throw new Error("composeImports: payload[0] missing");
    let tree = first.tree;
    let portraits: PortraitBlob[] = [...first.portraits];
    const findings: Finding[] = [];
    let count = first.count;

    for (let i = 1; i < payloads.length; i += 1) {
        const incoming = payloads[i];
        if (!incoming) continue;
        const merged = mergeTrees(
            { tree, source: mergeSourceFor(first.sourceFormat) },
            { tree: incoming.tree, source: mergeSourceFor(incoming.sourceFormat) },
        );
        // remap incoming portraits via bIdMap; a portrait whose personId
        // doesn't show up in bIdMap is dropped (it points at a ghost
        // person that wasn't carried into the merge).
        const remappedIncoming: PortraitBlob[] = [];
        for (const p of incoming.portraits) {
            const targetId: PersonId | undefined = merged.bIdMap[p.personId];
            if (targetId !== undefined) {
                remappedIncoming.push({ ...p, personId: targetId });
            }
        }
        tree = merged.tree;
        portraits = [...portraits, ...remappedIncoming];
        findings.push(...merged.findings);
        count = Object.keys(tree.people).length;
    }

    return {
        payload: {
            tree,
            portraits,
            sourceFormat: first.sourceFormat,
            count,
        },
        findings,
    };
}
