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

function envBase(): string {
    // vite injects import.meta.env; guard for non-vite runtimes (tests)
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    return env?.VITE_WIKI_BASE_URL ?? DEFAULT_BASE;
}
