/*
 * FamilyTreeEditor - apply an ImportPayload to the active session:
 * write portraits to IDB, link them onto Person records, replace the active
 * tree via treeStore.reset (or merge into current).
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { Person, PersonId, Tree } from "$lib/domain/types";
import type { ImportPayload } from "$lib/io/importFile";
import { mergeTrees, type MergeSource } from "$lib/io/merge/merge";
import { putBlob } from "$lib/persistence/blobs";
import type { TreeStore } from "$lib/state/tree.svelte";

export type ImportApplyMode = { kind: "replace" } | { kind: "merge"; into: Tree };

export interface PersistImportInput {
    payload: ImportPayload;
    /** override for tree.name; empty string falls back to payload.tree.name */
    treeName: string;
    mode: ImportApplyMode;
    store: TreeStore;
}

const EXT_TO_MIME: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
};

function mimeForExt(ext: string): string {
    const lower = ext.toLowerCase();
    return EXT_TO_MIME[lower] ?? "application/octet-stream";
}

/**
 * persist portraits + tree from an ImportPayload, then apply via the store.
 * When mode = "merge", folds the payload tree into the supplied current tree
 * via the existing pairwise mergeTrees; when mode = "replace", treeStore.reset
 * is called with the payload tree directly. Returns the tree id of the
 * resulting active tree so the caller can persist it as lastOpenedTreeId.
 */
export async function persistImportPayload(input: PersistImportInput): Promise<{ treeId: string }> {
    const { payload, treeName, mode, store } = input;

    let working: Tree = payload.tree;
    if (mode.kind === "merge") {
        // mergeTrees today knows only "familyscript" | "gedcom" - until the
        // type widens, html/gedzip imports look like one of those for the
        // conflict-source label. gedcom is the closer analogue.
        const sourceA: MergeSource = "gedcom";
        const sourceB: MergeSource =
            payload.sourceFormat === "familyscript" ? "familyscript" : "gedcom";
        const merged = mergeTrees(
            { tree: mode.into, source: sourceA },
            { tree: working, source: sourceB },
        );
        working = merged.tree;
    }

    // write portrait blobs to IDB and patch portraitBlobId onto the matching
    // person. portraits arriving from a bundle were keyed by their original
    // personId; for merge mode mergeTrees may have remapped that id, so we
    // accept a missing target as a no-op rather than dropping the blob into a
    // ghost person.
    if (payload.portraits.length > 0) {
        const updatedPeople: Record<PersonId, Person> = { ...working.people };
        for (const portrait of payload.portraits) {
            const person = updatedPeople[portrait.personId];
            if (!person) continue;
            const blobId = await putBlob({
                treeId: working.id,
                personId: portrait.personId,
                mime: mimeForExt(portrait.ext),
                bytes: portrait.bytes,
            });
            updatedPeople[portrait.personId] = { ...person, portraitBlobId: blobId };
        }
        working = { ...working, people: updatedPeople };
    }

    const finalName = treeName.trim() || payload.tree.name || "Imported tree";
    const finalTree: Tree = { ...working, name: finalName, updatedAt: Date.now() };

    store.reset(finalTree);
    return { treeId: finalTree.id };
}
