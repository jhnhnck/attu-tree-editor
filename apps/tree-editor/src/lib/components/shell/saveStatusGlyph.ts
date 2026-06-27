/*
 * FamilyTreeEditor - pure save-status glyph / tone derivation
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * stateless helper so the mapping can be unit-tested without a DOM.
 */

export type SaveStatus = "saved" | "saving" | "dirty" | "error" | "offline";
export type GlyphTone = "success" | "warning" | "error" | "muted";

export interface SaveStatusGlyph {
    /** semantic icon name (e.g. "check", "cloud-off") */
    glyph: string;
    /** ui tone driving color class selection */
    tone: GlyphTone;
    /** short human-readable label */
    label: string;
}

export function saveStatusGlyph(status: SaveStatus): SaveStatusGlyph {
    switch (status) {
        case "saved":
            return { glyph: "check", tone: "success", label: "saved" };
        case "saving":
            return { glyph: "cloud-upload", tone: "muted", label: "saving..." };
        case "dirty":
            return { glyph: "dot", tone: "warning", label: "unsaved changes" };
        case "error":
            return { glyph: "x", tone: "error", label: "save error" };
        case "offline":
            return { glyph: "cloud-off", tone: "muted", label: "no remote sync" };
    }
}
