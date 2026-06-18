/*
 * FamilyTreeEditor - GEDZIP-style bundle reader; reads schemaVersion from manifest.json and migrates
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { strFromU8, unzipSync } from "fflate";
import { migrateToCurrent } from "$lib/domain/schema";
import type { Tree } from "$lib/domain/types";
import type { Finding } from "$lib/domain/validate";
import type { BundleManifest, PortraitBlob } from "$lib/io/bundle/write";
import { parseGedcom, type GedHead } from "$lib/io/gedcom/parse";
import { err, ok, type Result } from "$lib/utils/result";

export interface BundleReadResult {
    tree: Tree;
    head: GedHead;
    portraits: PortraitBlob[];
    findings: Finding[];
    manifest: BundleManifest | undefined;
}

export function readBundle(buffer: ArrayBuffer | Uint8Array): Result<BundleReadResult, string> {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(bytes);
    } catch (e) {
        return err(`zip read failed: ${String(e)}`);
    }

    const gedBytes = entries["gedcom.ged"];
    if (!gedBytes) return err("bundle missing gedcom.ged at archive root");

    const manifest = readManifest(entries);
    const stampedVersion = manifest?.schemaVersion;

    // Migrate the raw GEDCOM-as-tree shape forward if the bundle was written
    // under an older schema. For schema 1 (the only one today) this is a noop;
    // it exists so future bumps inherit a working pipeline.
    const findings: Finding[] = [];
    const migrated = migrateToCurrent({}, stampedVersion);
    if (!migrated.ok) return err(migrated.error);
    for (const m of migrated.value.appliedMigrations) {
        findings.push({
            kind: "dropped-subtag",
            from: "manifest",
            tag: `migrated:${m.from}->${m.to}: ${m.description}`,
        });
    }
    if (migrated.value.forwardCompatWarning) {
        findings.push({
            kind: "dropped-subtag",
            from: "manifest",
            tag: `forward-compat: ${migrated.value.forwardCompatWarning}`,
        });
    }

    const gedText = strFromU8(gedBytes);
    const parsed = parseGedcom(gedText);
    if (!parsed.ok) return err(`gedcom parse failed: ${parsed.error}`);

    const portraits: PortraitBlob[] = [];
    for (const [path, data] of Object.entries(entries)) {
        if (!path.startsWith("media/")) continue;
        const file = path.slice("media/".length);
        const dot = file.lastIndexOf(".");
        if (dot < 1) continue;
        const personId = file.slice(0, dot);
        const ext = file.slice(dot + 1);
        portraits.push({ personId, ext, bytes: data });
    }

    return ok({
        tree: parsed.value.tree,
        head: parsed.value.head,
        portraits,
        findings: [...findings, ...parsed.value.findings],
        manifest,
    });
}

function readManifest(entries: Record<string, Uint8Array>): BundleManifest | undefined {
    const bytes = entries["manifest.json"];
    if (!bytes) return undefined;
    try {
        const parsed: unknown = JSON.parse(strFromU8(bytes));
        if (parsed && typeof parsed === "object") {
            const sv: unknown = (parsed as { schemaVersion?: unknown }).schemaVersion;
            // Accept both legacy integer stamps and modern semver strings.
            if (typeof sv === "number" || typeof sv === "string") {
                return parsed as BundleManifest;
            }
        }
    } catch {
        // ignore: manifest is best-effort
    }
    return undefined;
}
