/*
 * FamilyTreeEditor - persistImportPayload: writes portrait blobs and links
 * portraitBlobId onto matched Person records before resetting the tree store.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FamilyTreeDb, setDb } from "$lib/persistence/db";
import { getBlob } from "$lib/persistence/blobs";
import { createTree } from "$lib/domain/tree";
import type { Person, Tree } from "$lib/domain/types";
import { createTreeStore } from "$lib/state/tree.svelte";
import { persistImportPayload } from "$lib/io/persistImportPayload";
import type { ImportPayload } from "$lib/io/importFile";

let db: FamilyTreeDb;

beforeEach(() => {
    const dbName = `ft-test-${String(Math.random())}`;
    db = new FamilyTreeDb(dbName);
    setDb(db);
});

afterEach(async () => {
    await db.delete();
});

function tinyTree(): Tree {
    const root: Omit<Person, "id"> = {
        given: "Korak",
        surname: "Nokar",
        gender: "m",
        spouseIds: [],
        display: "z1",
    };
    return { ...createTree("imported", root), id: "tree-fixture" };
}

function emptyTree(): Tree {
    const root: Omit<Person, "id"> = {
        given: "",
        surname: "",
        gender: "u",
        spouseIds: [],
        display: "z1",
    };
    return createTree("seed", root);
}

describe("persistImportPayload", () => {
    it("writes portraits to IDB and links portraitBlobId on matched persons", async () => {
        const tree = tinyTree();
        const rootId = tree.rootId;
        const payload: ImportPayload = {
            tree,
            portraits: [
                {
                    personId: rootId,
                    ext: "jpg",
                    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
                },
            ],
            sourceFormat: "gedzip",
            count: 1,
        };
        const store = createTreeStore(emptyTree());
        const { treeId } = await persistImportPayload({
            payload,
            treeName: "",
            mode: { kind: "replace" },
            store,
        });
        expect(treeId).toBe(tree.id);
        const blobId = store.tree.people[rootId]?.portraitBlobId;
        expect(blobId).toBeDefined();
        if (!blobId) return;
        const blob = await getBlob(blobId);
        expect(blob.ok).toBe(true);
        if (!blob.ok) return;
        expect(blob.value.mime).toBe("image/jpeg");
        expect(blob.value.bytes.byteLength).toBe(4);
    });

    it("honors the override tree name; falls back to payload name on empty", async () => {
        const store = createTreeStore(emptyTree());
        await persistImportPayload({
            payload: {
                tree: tinyTree(),
                portraits: [],
                sourceFormat: "familyscript",
                count: 1,
            },
            treeName: "  custom name  ",
            mode: { kind: "replace" },
            store,
        });
        expect(store.tree.name).toBe("custom name");

        const store2 = createTreeStore(emptyTree());
        await persistImportPayload({
            payload: {
                tree: tinyTree(),
                portraits: [],
                sourceFormat: "familyscript",
                count: 1,
            },
            treeName: "",
            mode: { kind: "replace" },
            store: store2,
        });
        expect(store2.tree.name).toBe("imported");
    });

    it("drops portraits for personIds absent from the tree (no ghost blobs persisted to people)", async () => {
        const tree = tinyTree();
        const payload: ImportPayload = {
            tree,
            portraits: [
                {
                    personId: "UNKNOWN_PERSON",
                    ext: "png",
                    bytes: new Uint8Array([1, 2, 3]),
                },
            ],
            sourceFormat: "gedzip",
            count: 1,
        };
        const store = createTreeStore(emptyTree());
        await persistImportPayload({
            payload,
            treeName: "",
            mode: { kind: "replace" },
            store,
        });
        for (const person of Object.values(store.tree.people)) {
            expect(person.portraitBlobId).toBeUndefined();
        }
    });
});
