/*
 * FamilyTreeEditor - resolve Person.wikiTitle to a clickable wiki URL
 * licensed under the MIT license; see LICENSE.md for full text
 */

const DEFAULT_BASE = "https://attuproject.org";

/**
 * Build the URL for a wiki title on the configured wiki.
 *
 * The MediaWiki convention is `/wiki/<Title_With_Underscores>` for the canonical
 * link. We replace spaces with underscores and percent-encode the result so
 * titles with `?`, `#`, `&`, etc. round-trip safely. Empty titles return
 * undefined so callers can hide the link.
 */
export function wikiUrlFor(title: string | undefined, baseUrl?: string): string | undefined {
    if (!title) return undefined;
    const trimmed = title.trim();
    if (trimmed === "") return undefined;
    const base = (baseUrl ?? envBase()).replace(/\/+$/, "");
    const slug = encodeURIComponent(trimmed.replace(/\s+/g, "_"));
    return `${base}/wiki/${slug}`;
}

/**
 * Open the wiki page for a title in a new tab. No-op if the title is empty
 * or `window` is unavailable (server / test envs).
 */
export function openWikiPage(title: string | undefined, baseUrl?: string): void {
    const url = wikiUrlFor(title, baseUrl);
    if (!url) return;
    if (typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Fetch wiki title suggestions via MediaWiki OpenSearch API.
 * Wiki and editor share an origin in production so no CORS handling needed.
 * Returns an empty array on error or abort — callers should not throw.
 */
export async function wikiOpenSearch(query: string, signal: AbortSignal): Promise<string[]> {
    if (!query.trim()) return [];
    const base = envBase().replace(/\/+$/, "");
    const url = `${base}/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&format=json`;
    try {
        const r = await fetch(url, { signal });
        if (!r.ok) return [];
        // opensearch response: [query, [titles], [descs], [urls]]
        const data: unknown = await r.json();
        if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
        return (data[1] as unknown[]).filter((s): s is string => typeof s === "string");
    } catch {
        return [];
    }
}

function envBase(): string {
    // runtime config injected by the server from data/trees-config.toml
    // wins over build-time vite env, which only exists for tests
    if (typeof window !== "undefined") {
        const runtime = window.__TREES_CONFIG__?.wikiBaseUrl;
        if (runtime) return runtime;
    }
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    return env?.VITE_WIKI_BASE_URL ?? DEFAULT_BASE;
}
