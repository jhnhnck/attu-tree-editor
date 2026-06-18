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
    /**
     * how often to sweep orphan portrait blobs, in number of saves. defaults
     * to 20 - the per-save scan was a hot spot at large blob counts. set to 1
     * for tests that want immediate cleanup.
     */
    gcEvery?: number;
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
    const gcEvery = Math.max(1, opts.gcEvery ?? 20);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Tree | undefined;
    let inFlight: Promise<void> | undefined;
    let savesSinceGc = 0;

    async function persist(tree: Tree): Promise<void> {
        console.debug("[autosave] saving %s (%s)", tree.name, tree.id);
        try {
            await saveTree(tree);
            await setSetting(SETTING_KEYS.lastOpenedTreeId, tree.id);
            // sweep orphan portrait blobs every gcEvery saves; the per-save
            // scan was a hot spot when a tree carries many portraits
            savesSinceGc += 1;
            if (savesSinceGc >= gcEvery) {
                savesSinceGc = 0;
                const referenced = new Set<string>();
                for (const p of Object.values(tree.people)) {
                    if (p.portraitBlobId) referenced.add(p.portraitBlobId);
                }
                await gcOrphanBlobs(tree.id, referenced);
            }
            console.debug("[autosave] saved %s (%s)", tree.name, tree.id);
            opts.onSaved?.();
        } catch (e) {
            console.error("[autosave] save failed %s:", tree.id, e);
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
