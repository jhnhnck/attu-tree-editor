/*
 * sync store: wraps the autosaver with server-side revision-checked saves.
 *
 * when signed in, every scheduled save also pushes to the server (LWW).
 * 409 conflict surfaces as mode='conflict' for the UI to handle.
 * when offline or signed-out, the store stays in mode='local' and only
 * persists to Dexie — the existing autosave path is unchanged.
 */

import type { Tree } from "$lib/domain/types";
import { ConflictError, trees as treesApi, type TreeConflictResponse } from "$lib/api/client";
import { authStore } from "$lib/state/auth.svelte";

export type SyncMode = "local" | "syncing" | "conflict";

export interface SyncStore {
    readonly mode: SyncMode;
    readonly revision: number | null;
    readonly conflict: TreeConflictResponse | null;
    /** called by the autosaver after a successful local save */
    onLocalSave(tree: Tree): void;
    /** set the known server revision after loading a synced tree */
    setRevision(revision: number): void;
    /** dismiss a conflict (user chose to keep their version) */
    dismissConflict(): void;
}

function createSyncStore(): SyncStore {
    let mode = $state<SyncMode>("local");
    let revision = $state<number | null>(null);
    let conflict = $state<TreeConflictResponse | null>(null);

    function onLocalSave(tree: Tree): void {
        if (!authStore.user) return;
        if (mode === "syncing") return;
        mode = "syncing";
        void push(tree);
    }

    async function push(tree: Tree): Promise<void> {
        if (!authStore.user || revision === null) {
            mode = "local";
            return;
        }
        try {
            const result = await treesApi.save(tree.id, {
                blob: tree,
                name: tree.name,
                expected_revision: revision,
            });
            revision = result.revision;
            mode = "local";
        } catch (err) {
            if (err instanceof ConflictError) {
                conflict = err.conflict;
                mode = "conflict";
            } else {
                // network error; fall back to local-only silently
                mode = "local";
            }
        }
    }

    return {
        get mode() {
            return mode;
        },
        get revision() {
            return revision;
        },
        get conflict() {
            return conflict;
        },
        onLocalSave,
        setRevision(rev: number) {
            revision = rev;
            mode = "local";
        },
        dismissConflict() {
            conflict = null;
            mode = "local";
        },
    };
}

export const syncStore = createSyncStore();
