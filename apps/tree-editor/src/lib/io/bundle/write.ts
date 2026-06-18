/*
 * FamilyTreeEditor - GEDZIP-style bundle writer (gedcom.ged + media/<personId>.<ext> + manifest.json)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { strToU8, zipSync, type Zippable } from "fflate";
import { CURRENT_SCHEMA_VERSION, type SchemaVersion } from "$lib/domain/schema";
import type { PersonId, Tree } from "$lib/domain/types";
import type { GedHead } from "$lib/io/gedcom/parse";
import { serializeGedcom } from "$lib/io/gedcom/serialize";

export interface PortraitBlob {
    personId: PersonId;
    /** filename extension without the dot, e.g. "webp" */
    ext: string;
    bytes: Uint8Array;
}

export interface BundleManifest {
    /**
     * Accepts both legacy integer stamps (older bundles written before the
     * semver upgrade) and modern semver strings ("MAJOR.MINOR.PATCH"). New
     * bundles always write the semver form.
     */
    schemaVersion: SchemaVersion | number;
    createdBy: string;
    createdAt: string;
}

export interface BundleWriteInput {
    tree: Tree;
    head?: GedHead;
    xrefByPersonId?: Record<PersonId, string>;
    portraits?: PortraitBlob[];
    /** Override the writer banner; defaults to "FamilyTreeEditor". */
    createdBy?: string;
}

export function writeBundle(input: BundleWriteInput): Uint8Array {
    // pre-compute media paths so the gedcom stream can emit `1 OBJE / 2 FILE`
    // pointing at the same files we pack into the archive
    const portraitMediaPathById: Record<PersonId, string> = {};
    if (input.portraits) {
        for (const portrait of input.portraits) {
            const safeExt = portrait.ext.replace(/[^a-zA-Z0-9]/g, "");
            portraitMediaPathById[portrait.personId] = `media/${portrait.personId}.${safeExt}`;
        }
    }

    const gedText = serializeGedcom(input.tree, {
        ...(input.head ? { head: input.head } : {}),
        ...(input.xrefByPersonId ? { xrefByPersonId: input.xrefByPersonId } : {}),
        portraitMediaPathById,
    });

    const manifest: BundleManifest = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        createdBy: input.createdBy ?? "FamilyTreeEditor",
        createdAt: new Date().toISOString(),
    };

    const zippable: Zippable = {
        "gedcom.ged": strToU8(gedText),
        "manifest.json": strToU8(JSON.stringify(manifest, null, 2) + "\n"),
    };

    if (input.portraits && input.portraits.length > 0) {
        const media: Zippable = {};
        for (const portrait of input.portraits) {
            const safeExt = portrait.ext.replace(/[^a-zA-Z0-9]/g, "");
            media[`${portrait.personId}.${safeExt}`] = portrait.bytes;
        }
        zippable["media"] = media;
    }

    return zipSync(zippable, { level: 6 });
}
