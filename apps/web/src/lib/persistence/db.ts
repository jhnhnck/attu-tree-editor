/*
 * FamilyTreeEditor - Dexie schema + migrations for persistent local storage
 * licensed under the MIT license; see LICENSE.md for full text
 */

import Dexie, { type EntityTable } from "dexie";
import type { Tree } from "$lib/domain/types";

/**
 * Stored tree row. The `tree` field carries the full domain Tree value;
 * the rest of the columns are denormalized for cheap recents-list queries
 * (so we don't have to deserialize every blob just to render the dropdown).
 */
export interface StoredTree {
    id: string;
    name: string;
    editRev: number;
    schemaVersion: number;
    updatedAt: number;
    personCount: number;
    tree: Tree;
}

/**
 * Portrait blob row. Each blob is keyed by a stable id (referenced by
 * `Person.portraitBlobId`); the `treeId` column is informational only and
 * lets us garbage-collect blobs whose tree was deleted.
 *
 * Bytes are stored as `Uint8Array` rather than `Blob`; fake-indexeddb (used
 * in tests) mangles Blob structured-clone, and Uint8Array round-trips
 * identically across both engines. Read sites wrap in `new Blob([bytes])`.
 */
export interface StoredBlob {
    id: string;
    treeId: string;
    personId: string;
    mime: string;
    bytes: Uint8Array;
    createdAt: number;
}

/**
 * Free-form key/value settings (`lastOpenedTreeId`, `wikiBaseUrl`, etc).
 * Anything that doesn't fit cleanly in a typed table goes here.
 */
export interface StoredSetting {
    key: string;
    value: unknown;
}

export class FamilyTreeDb extends Dexie {
    trees!: EntityTable<StoredTree, "id">;
    blobs!: EntityTable<StoredBlob, "id">;
    settings!: EntityTable<StoredSetting, "key">;

    constructor(name = "family-tree-editor") {
        super(name);
        // version 1: initial schema. when adding a column to an existing
        // index list bump the version and add a `.upgrade(...)` callback.
        this.version(1).stores({
            trees: "id, updatedAt, name",
            blobs: "id, treeId, personId, createdAt",
            settings: "key",
        });
    }
}

/** lazily-constructed default singleton; tests can pass their own instance */
let defaultDb: FamilyTreeDb | undefined;
export function getDb(): FamilyTreeDb {
    defaultDb ??= new FamilyTreeDb();
    return defaultDb;
}

/** test-only: replace the default db (e.g. with one backed by fake-indexeddb) */
export function setDb(db: FamilyTreeDb): void {
    defaultDb = db;
}
