/*
 * FamilyTreeEditor - resolve portraitBlobId -> object URL for use in <img src>
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { getBlob } from "$lib/persistence/blobs";

interface CacheEntry {
    url: string;
    revoked: boolean;
}

export interface PortraitUrlCache {
    /** synchronous lookup; returns undefined until the blob has been fetched */
    get(blobId: string | undefined): string | undefined;
    /** kick off a fetch for a blob id; idempotent and cheap */
    request(blobId: string): void;
    /** revoke the URL for a blob (called when the underlying blob changes) */
    invalidate(blobId: string): void;
    /** revoke all URLs (called on tree swap or store teardown) */
    clear(): void;
}

export function createPortraitUrlCache(): PortraitUrlCache {
    const cache = $state<Map<string, CacheEntry>>(new Map());
    const inFlight = new Set<string>();

    async function fetchAndCache(id: string): Promise<void> {
        if (inFlight.has(id)) return;
        if (cache.has(id)) return;
        inFlight.add(id);
        try {
            const r = await getBlob(id);
            if (!r.ok) return;
            // .slice() forces a fresh ArrayBuffer-backed Uint8Array, satisfying
            // the Blob constructor's BlobPart constraint under TS lib.dom
            const blob = new Blob([r.value.bytes.slice()], { type: r.value.mime });
            const url = URL.createObjectURL(blob);
            cache.set(id, { url, revoked: false });
        } finally {
            inFlight.delete(id);
        }
    }

    return {
        get(blobId: string | undefined): string | undefined {
            if (!blobId) return undefined;
            const entry = cache.get(blobId);
            if (!entry || entry.revoked) {
                // request lazily on first read; returns undefined this tick,
                // populates on a later one (which triggers reactivity)
                void fetchAndCache(blobId);
                return undefined;
            }
            return entry.url;
        },
        request(blobId: string): void {
            void fetchAndCache(blobId);
        },
        invalidate(blobId: string): void {
            const entry = cache.get(blobId);
            if (!entry) return;
            URL.revokeObjectURL(entry.url);
            entry.revoked = true;
            cache.delete(blobId);
        },
        clear(): void {
            for (const entry of cache.values()) {
                if (!entry.revoked) URL.revokeObjectURL(entry.url);
            }
            cache.clear();
        },
    };
}
