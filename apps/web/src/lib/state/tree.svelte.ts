/*
 * FamilyTreeEditor - $state container for the active Tree with snapshot-based undo/redo
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { Tree } from "$lib/domain/types";

const HISTORY_LIMIT = 200;

export interface TreeStore {
    readonly tree: Tree;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    /**
     * `true` once the tree has been mutated by the user (set / update /
     * reset / undo / redo). Watched by the autosave coordinator so a fresh
     * page load doesn't persist the placeholder seed tree.
     */
    readonly dirty: boolean;
    /** replace the current tree and push the previous one onto the undo stack */
    set(next: Tree): void;
    /** apply a pure update; same semantics as set(updater(tree)) */
    update(updater: (current: Tree) => Tree): void;
    /**
     * replace the active tree from a user-driven action (e.g. import).
     * marks the store dirty so autosave persists the new tree.
     */
    reset(next: Tree): void;
    /**
     * replace the active tree without marking dirty - used to load a tree
     * already on disk so autosave doesn't re-write what we just read.
     */
    hydrate(next: Tree): void;
    undo(): void;
    redo(): void;
}

export function createTreeStore(initial: Tree): TreeStore {
    let current = $state(initial);
    let past = $state<Tree[]>([]);
    let future = $state<Tree[]>([]);
    let dirty = $state(false);

    function pushPast(snapshot: Tree): void {
        past.push(snapshot);
        if (past.length > HISTORY_LIMIT) past.shift();
    }

    return {
        get tree() {
            return current;
        },
        get canUndo() {
            return past.length > 0;
        },
        get canRedo() {
            return future.length > 0;
        },
        get dirty() {
            return dirty;
        },
        set(next: Tree): void {
            if (next === current) return;
            pushPast(current);
            future = [];
            current = next;
            dirty = true;
        },
        update(updater): void {
            const next = updater(current);
            if (next === current) return;
            pushPast(current);
            future = [];
            current = next;
            dirty = true;
        },
        reset(next: Tree): void {
            past = [];
            future = [];
            current = next;
            dirty = true;
        },
        hydrate(next: Tree): void {
            past = [];
            future = [];
            current = next;
            dirty = false;
        },
        undo(): void {
            const prev = past.pop();
            if (prev === undefined) return;
            future.push(current);
            current = prev;
            dirty = true;
        },
        redo(): void {
            const ahead = future.pop();
            if (ahead === undefined) return;
            past.push(current);
            current = ahead;
            dirty = true;
        },
    };
}
