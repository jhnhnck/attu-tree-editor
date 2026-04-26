/*
 * FamilyTreeEditor - persistence/trees.ts: Dexie-backed tree storage
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { CURRENT_SCHEMA_VERSION } from "$lib/domain/schema";
import type { Tree } from "$lib/domain/types";
import { err, ok, type Result } from "$lib/utils/result";
import { getDb, type FamilyTreeDb, type StoredTree } from "$lib/persistence/db";

/** small projection used by the recents UI; avoids deserializing the full Tree */
export interface TreeListing {
    id: string;
    name: string;
    rev: number;
    updatedAt: number;
    personCount: number;
}

function toListing(s: StoredTree): TreeListing {
    return {
        id: s.id,
        name: s.name,
        rev: s.rev,
        updatedAt: s.updatedAt,
        personCount: s.personCount,
    };
}

/** save (upsert) a tree. always stamps `updatedAt = Date.now()`. */
export async function saveTree(tree: Tree, db: FamilyTreeDb = getDb()): Promise<void> {
    // Svelte 5's $state values are stored as deep Proxies; structured-clone
    // (used by IndexedDB's put) refuses Proxies with DataCloneError. Round-trip
    // through JSON to drop the reactivity wrappers - our domain types are
    // strings, numbers, arrays, and plain objects, so JSON is lossless here.
    const plain = JSON.parse(JSON.stringify(tree)) as Tree;
    const row: StoredTree = {
        id: plain.id,
        name: plain.name,
        rev: plain.rev,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        updatedAt: Date.now(),
        personCount: Object.keys(plain.people).length,
        tree: plain,
    };
    await db.trees.put(row);
}

/** load a tree by id. returns err if not found. */
export async function loadTree(
    id: string,
    db: FamilyTreeDb = getDb(),
): Promise<Result<Tree, string>> {
    const row = await db.trees.get(id);
    if (!row) return err(`no stored tree with id ${id}`);
    return ok(row.tree);
}

/** list trees newest first; default cap at 20 entries. */
export async function listTrees(limit = 20, db: FamilyTreeDb = getDb()): Promise<TreeListing[]> {
    const rows = await db.trees.orderBy("updatedAt").reverse().limit(limit).toArray();
    return rows.map(toListing);
}

/**
 * delete a tree and any portrait blobs that referenced it. running in a
 * single transaction so a partial delete never leaves orphan blobs.
 */
export async function deleteTree(id: string, db: FamilyTreeDb = getDb()): Promise<void> {
    await db.transaction("rw", db.trees, db.blobs, async () => {
        await db.trees.delete(id);
        await db.blobs.where("treeId").equals(id).delete();
    });
}
