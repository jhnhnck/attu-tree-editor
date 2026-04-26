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
    /** replace the current tree and push the previous one onto the undo stack */
    set(next: Tree): void;
    /** apply a pure update; same semantics as set(updater(tree)) */
    update(updater: (current: Tree) => Tree): void;
    /** replace without recording history; for initial load and remote sync */
    reset(next: Tree): void;
    undo(): void;
    redo(): void;
}

export function createTreeStore(initial: Tree): TreeStore {
    let current = $state(initial);
    let past = $state<Tree[]>([]);
    let future = $state<Tree[]>([]);

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
        set(next: Tree): void {
            if (next === current) return;
            pushPast(current);
            future = [];
            current = next;
        },
        update(updater): void {
            const next = updater(current);
            if (next === current) return;
            pushPast(current);
            future = [];
            current = next;
        },
        reset(next: Tree): void {
            past = [];
            future = [];
            current = next;
        },
        undo(): void {
            const prev = past.pop();
            if (prev === undefined) return;
            future.push(current);
            current = prev;
        },
        redo(): void {
            const ahead = future.pop();
            if (ahead === undefined) return;
            past.push(current);
            current = ahead;
        },
    };
}
