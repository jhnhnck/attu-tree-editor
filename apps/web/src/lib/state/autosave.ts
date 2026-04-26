/*
 * FamilyTreeEditor - debounced autosave coordinator
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { Tree } from "$lib/domain/types";
import { saveTree } from "$lib/persistence/trees";
import { gcOrphanBlobs } from "$lib/persistence/blobs";
import { SETTING_KEYS, setSetting } from "$lib/persistence/settings";

export interface AutosaverOptions {
    /** how long to wait after the last tree change before persisting */
    debounceMs?: number;
    /** called with a stringified error if a save throws */
    onError?: (error: string) => void;
    /** called after each successful flush so the UI can show "saved" state */
    onSaved?: () => void;
}

export interface Autosaver {
    /** queue a save; subsequent calls within `debounceMs` reset the timer */
    schedule(tree: Tree): void;
    /** flush any pending save immediately; safe to call multiple times */
    flush(): Promise<void>;
    /** drop any pending save without persisting (e.g. on user-driven reset) */
    cancel(): void;
}

export function makeAutosaver(opts: AutosaverOptions = {}): Autosaver {
    const debounceMs = opts.debounceMs ?? 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Tree | undefined;
    let inFlight: Promise<void> | undefined;

    async function persist(tree: Tree): Promise<void> {
        try {
            await saveTree(tree);
            await setSetting(SETTING_KEYS.lastOpenedTreeId, tree.id);
            // sweep any portrait blobs whose person no longer references them
            const referenced = new Set<string>();
            for (const p of Object.values(tree.people)) {
                if (p.portraitBlobId) referenced.add(p.portraitBlobId);
            }
            await gcOrphanBlobs(tree.id, referenced);
            opts.onSaved?.();
        } catch (e) {
            opts.onError?.(e instanceof Error ? e.message : String(e));
        } finally {
            inFlight = undefined;
        }
    }

    function clear(): void {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
    }

    return {
        schedule(tree: Tree): void {
            pending = tree;
            clear();
            timer = setTimeout(() => {
                timer = undefined;
                const t = pending;
                pending = undefined;
                if (t) inFlight = persist(t);
            }, debounceMs);
        },
        async flush(): Promise<void> {
            clear();
            const t = pending;
            pending = undefined;
            if (t) inFlight = persist(t);
            if (inFlight) await inFlight;
        },
        cancel(): void {
            clear();
            pending = undefined;
        },
    };
}
