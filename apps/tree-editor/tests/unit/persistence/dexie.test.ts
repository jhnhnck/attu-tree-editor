/*
 * FamilyTreeEditor - dexie persistence: trees, blobs, settings round-trip
 * licensed under the MIT license; see LICENSE.md for full text
 */

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FamilyTreeDb, setDb } from "$lib/persistence/db";
import { saveTree, loadTree, listTrees, deleteTree } from "$lib/persistence/trees";
import { putBlob, getBlob, deleteBlob, gcOrphanBlobs } from "$lib/persistence/blobs";
import { SETTING_KEYS, getSetting, setSetting } from "$lib/persistence/settings";
import { createTree } from "$lib/domain/tree";
import type { Person, Tree } from "$lib/domain/types";

function tinyTree(id: string, name = id): Tree {
    const root: Omit<Person, "id"> = {
        given: "Korak",
        surname: "Nokar",
        gender: "m",
        spouseIds: [],
        display: "z1",
    };
    return { ...createTree(name, root), id };
}

let db: FamilyTreeDb;

beforeEach(() => {
    // unique db name per test so they don't share state
    const dbName = `ft-test-${String(Math.random())}`;
    db = new FamilyTreeDb(dbName);
    setDb(db);
});

afterEach(async () => {
    await db.delete();
});

describe("trees", () => {
    it("saves and reloads a tree", async () => {
        const t = tinyTree("aaa", "alpha");
        await saveTree(t, db);
        const r = await loadTree("aaa", db);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.tree.id).toBe("aaa");
        expect(r.value.tree.name).toBe("alpha");
        expect(Object.keys(r.value.tree.people)).toHaveLength(1);
    });

    it("loadTree result carries savedAt from the persisted updatedAt column", async () => {
        const before = Date.now();
        const t = tinyTree("ts-check", "timestamped");
        await saveTree(t, db);
        const after = Date.now();
        const r = await loadTree("ts-check", db);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.savedAt).toBeGreaterThanOrEqual(before);
        expect(r.value.savedAt).toBeLessThanOrEqual(after);
    });

    it("loadTree returns err for an unknown id", async () => {
        const r = await loadTree("missing", db);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error).toMatch(/no stored tree/);
    });

    it("listTrees returns trees newest-first", async () => {
        await saveTree(tinyTree("a", "first"), db);
        // make sure timestamps differ
        await new Promise((r) => setTimeout(r, 5));
        await saveTree(tinyTree("b", "second"), db);
        await new Promise((r) => setTimeout(r, 5));
        await saveTree(tinyTree("c", "third"), db);

        const list = await listTrees(10, db);
        expect(list.map((t) => t.id)).toEqual(["c", "b", "a"]);
    });

    it("listing carries personCount + name without deserializing the full tree on the consumer", async () => {
        const t = tinyTree("a", "x");
        await saveTree(t, db);
        const [entry] = await listTrees(10, db);
        if (!entry) throw new Error("missing entry");
        expect(entry.name).toBe("x");
        expect(entry.personCount).toBe(1);
    });

    it("deleteTree removes the row and any blobs that referenced it", async () => {
        const t = tinyTree("aaa", "alpha");
        await saveTree(t, db);
        const blobId = await putBlob(
            {
                treeId: "aaa",
                personId: "AAAAA",
                mime: "image/webp",
                bytes: new Uint8Array([1, 2, 3]),
            },
            db,
        );
        await deleteTree("aaa", db);

        const r = await loadTree("aaa", db);
        expect(r.ok).toBe(false);
        const b = await getBlob(blobId, db);
        expect(b.ok).toBe(false);
    });
});

describe("blobs", () => {
    it("round-trips bytes through put + get (Uint8Array input)", async () => {
        const id = await putBlob(
            {
                treeId: "t1",
                personId: "P1",
                mime: "image/webp",
                bytes: new Uint8Array([7, 8, 9, 10]),
            },
            db,
        );
        const r = await getBlob(id, db);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.mime).toBe("image/webp");
        expect(Array.from(r.value.bytes)).toEqual([7, 8, 9, 10]);
    });

    it("preserves byte ordering for larger payloads", async () => {
        const big = new Uint8Array(64).map((_, i) => i * 3);
        const id = await putBlob(
            { treeId: "t1", personId: "P1", mime: "image/webp", bytes: big },
            db,
        );
        const r = await getBlob(id, db);
        if (!r.ok) throw new Error(r.error);
        expect(Array.from(r.value.bytes).slice(0, 5)).toEqual([0, 3, 6, 9, 12]);
        expect(r.value.bytes.length).toBe(64);
    });

    it("deleteBlob removes a single blob without touching others", async () => {
        const a = await putBlob(
            { treeId: "t", personId: "P", mime: "x", bytes: new Uint8Array([97]) },
            db,
        );
        const b = await putBlob(
            { treeId: "t", personId: "P", mime: "x", bytes: new Uint8Array([98]) },
            db,
        );
        await deleteBlob(a, db);
        expect((await getBlob(a, db)).ok).toBe(false);
        expect((await getBlob(b, db)).ok).toBe(true);
    });

    it("gcOrphanBlobs deletes only the unreferenced blobs for a tree", async () => {
        const keep = await putBlob(
            { treeId: "t", personId: "P", mime: "x", bytes: new Uint8Array([1]) },
            db,
        );
        const drop1 = await putBlob(
            { treeId: "t", personId: "P", mime: "x", bytes: new Uint8Array([2]) },
            db,
        );
        const drop2 = await putBlob(
            { treeId: "t", personId: "P", mime: "x", bytes: new Uint8Array([3]) },
            db,
        );
        const otherTree = await putBlob(
            { treeId: "u", personId: "P", mime: "x", bytes: new Uint8Array([4]) },
            db,
        );

        const dropped = await gcOrphanBlobs("t", new Set([keep]), db);
        expect(dropped).toBe(2);

        expect((await getBlob(keep, db)).ok).toBe(true);
        expect((await getBlob(drop1, db)).ok).toBe(false);
        expect((await getBlob(drop2, db)).ok).toBe(false);
        // gc on tree "t" must not touch tree "u"
        expect((await getBlob(otherTree, db)).ok).toBe(true);
    });
});

describe("settings", () => {
    it("round-trips a typed value", async () => {
        await setSetting(SETTING_KEYS.lastOpenedTreeId, "abc", db);
        const v = await getSetting<string>(SETTING_KEYS.lastOpenedTreeId, db);
        expect(v).toBe("abc");
    });

    it("returns undefined for an unset key", async () => {
        const v = await getSetting<string>(SETTING_KEYS.wikiBaseUrl, db);
        expect(v).toBeUndefined();
    });
});
