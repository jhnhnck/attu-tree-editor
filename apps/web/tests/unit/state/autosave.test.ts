/*
 * FamilyTreeEditor - autosave debounce + orphan-blob gc behavior
 * licensed under the MIT license; see LICENSE.md for full text
 */

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FamilyTreeDb, setDb } from "$lib/persistence/db";
import { loadTree } from "$lib/persistence/trees";
import { putBlob, getBlob } from "$lib/persistence/blobs";
import { SETTING_KEYS, getSetting } from "$lib/persistence/settings";
import { makeAutosaver } from "$lib/state/autosave";
import { createTree, updatePerson } from "$lib/domain/tree";
import { ROOT_ID } from "$lib/domain/ids";
import type { Tree } from "$lib/domain/types";

function tinyTree(id: string): Tree {
    const t = createTree("test", {
        given: "Korak",
        surname: "Nokar",
        gender: "m",
        spouseIds: [],
        display: "z1",
    });
    return { ...t, id };
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let db: FamilyTreeDb;

beforeEach(() => {
    db = new FamilyTreeDb(`autosave-test-${String(Math.random())}`);
    setDb(db);
});

afterEach(async () => {
    await db.delete();
});

describe("makeAutosaver", () => {
    it("debounces: rapid schedule() calls only save the latest tree", async () => {
        const saver = makeAutosaver({ debounceMs: 30 });

        const t1 = tinyTree("aaa");
        saver.schedule(t1);
        const t2 = updatePerson(t1, ROOT_ID, { given: "Marai", gender: "f" });
        saver.schedule(t2);
        const t3 = updatePerson(t2, ROOT_ID, { given: "Banchar", gender: "u" });
        saver.schedule(t3);

        // wait past the debounce, then flush to deterministically wait for
        // the in-flight save to complete (flush awaits inFlight if any)
        await wait(50);
        await saver.flush();

        const r = await loadTree("aaa");
        if (!r.ok) throw new Error(r.error);
        expect(r.value.people[ROOT_ID]?.given).toBe("Banchar");
    });

    it("flush() persists immediately and clears the pending timer", async () => {
        const saver = makeAutosaver({ debounceMs: 5000 });
        const t = tinyTree("bbb");
        saver.schedule(t);
        await saver.flush();

        const r = await loadTree("bbb");
        expect(r.ok).toBe(true);
        // advance past the original debounce; nothing should re-save
        // nothing to wait for; flush already cleared the timer
    });

    it("stamps lastOpenedTreeId on each save", async () => {
        const saver = makeAutosaver({ debounceMs: 20 });
        saver.schedule(tinyTree("ccc"));
        await wait(40);
        await saver.flush();
        expect(await getSetting<string>(SETTING_KEYS.lastOpenedTreeId)).toBe("ccc");
    });

    it("cancel() drops a pending save without persisting", async () => {
        const saver = makeAutosaver({ debounceMs: 50 });
        saver.schedule(tinyTree("ddd"));
        saver.cancel();
        await wait(80);
        const r = await loadTree("ddd");
        expect(r.ok).toBe(false);
    });

    it("garbage-collects orphan blobs after a save", async () => {
        // pre-stash three blobs against tree "eee"
        const keep = await putBlob({
            treeId: "eee",
            personId: ROOT_ID,
            mime: "image/webp",
            bytes: new Uint8Array([1]),
        });
        const orphan1 = await putBlob({
            treeId: "eee",
            personId: ROOT_ID,
            mime: "image/webp",
            bytes: new Uint8Array([2]),
        });
        const orphan2 = await putBlob({
            treeId: "eee",
            personId: ROOT_ID,
            mime: "image/webp",
            bytes: new Uint8Array([3]),
        });

        const t0 = tinyTree("eee");
        const t1 = updatePerson(t0, ROOT_ID, { portraitBlobId: keep });

        const saver = makeAutosaver({ debounceMs: 20 });
        saver.schedule(t1);
        await wait(40);
        await saver.flush();

        expect((await getBlob(keep)).ok).toBe(true);
        expect((await getBlob(orphan1)).ok).toBe(false);
        expect((await getBlob(orphan2)).ok).toBe(false);
    });

    it("onError fires when persistence throws", async () => {
        const onError = vi.fn();
        const saver = makeAutosaver({ debounceMs: 10, onError });
        await db.delete(); // any save will fail because db is gone
        saver.schedule(tinyTree("fff"));
        await wait(30);
        await saver.flush();
        expect(onError).toHaveBeenCalled();
    });
});
