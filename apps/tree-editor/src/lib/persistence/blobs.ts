/*
 * FamilyTreeEditor - persistence/blobs.ts: portrait blob storage
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { err, ok, type Result } from "@attu/ui";
import { getDb, type FamilyTreeDb, type StoredBlob } from "$lib/persistence/db";

export interface PutBlobInput {
    treeId: string;
    personId: string;
    mime: string;
    /** raw bytes of the image. Callers with a Blob should pass
     *  `new Uint8Array(await blob.arrayBuffer())`; we don't decode here so
     *  the storage layer stays env-agnostic (jsdom Blob lacks arrayBuffer). */
    bytes: Uint8Array;
}

const ID_PREFIX = "b_";

function newBlobId(): string {
    // not crypto-grade; collision odds are vanishing for portrait counts
    return ID_PREFIX + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/** put a blob, returning its newly-allocated id */
export async function putBlob(input: PutBlobInput, db: FamilyTreeDb = getDb()): Promise<string> {
    const id = newBlobId();
    const row: StoredBlob = {
        id,
        treeId: input.treeId,
        personId: input.personId,
        mime: input.mime,
        bytes: input.bytes,
        createdAt: Date.now(),
    };
    await db.blobs.put(row);
    return id;
}

export async function getBlob(
    id: string,
    db: FamilyTreeDb = getDb(),
): Promise<Result<StoredBlob, string>> {
    const row = await db.blobs.get(id);
    if (!row) return err(`no blob with id ${id}`);
    return ok(row);
}

export async function deleteBlob(id: string, db: FamilyTreeDb = getDb()): Promise<void> {
    await db.blobs.delete(id);
}

/**
 * delete blobs for a tree that aren't referenced by any current portraitBlobId.
 * called after a save to keep storage tidy when portraits are replaced/removed.
 */
export async function gcOrphanBlobs(
    treeId: string,
    referenced: ReadonlySet<string>,
    db: FamilyTreeDb = getDb(),
): Promise<number> {
    const all = await db.blobs.where("treeId").equals(treeId).toArray();
    const orphans = all.filter((b) => !referenced.has(b.id)).map((b) => b.id);
    if (orphans.length === 0) return 0;
    await db.blobs.bulkDelete(orphans);
    return orphans.length;
}
