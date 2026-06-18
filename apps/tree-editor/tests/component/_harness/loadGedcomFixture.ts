/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - test helper: load a Tree from a fixture file on disk.
 *
 * supports `.ged` (parsed via `parseGedcom`) and `.gdz` (read via
 * `readBundle`). paths are resolved relative to the worktree root (the
 * directory containing `package.json` / `pnpm-workspace.yaml`), not the
 * vitest cwd - vitest runs from `apps/tree-editor/` but fixtures also live under
 * `notes/examples/`, so a worktree-rooted path is the only convention that
 * spans both.
 *
 * sync by design - both parsers are sync; spec authors get straight-line
 * test bodies. throws a clear error if the file is missing or the format is
 * unsupported (unknown extension).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readBundle } from "$lib/io/bundle/read";
import type { Tree } from "$lib/domain/types";
import { parseGedcom } from "$lib/io/gedcom/parse";

// climb from this file (apps/tree-editor/tests/component/_harness/loadGedcomFixture.ts)
// to the worktree root - five parent steps. computed once at module load.
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = resolve(HERE, "..", "..", "..", "..", "..");

/**
 * load a fixture file and return its `Tree`. `path` is relative to the
 * worktree root.
 *
 * @example
 *   loadGedcomFixture("apps/tree-editor/tests/fixtures/tiny.ged");
 *   loadGedcomFixture("notes/examples/Inbred Family.gdz");
 */
export function loadGedcomFixture(path: string): Tree {
    const abs = resolve(WORKTREE_ROOT, path);
    if (!existsSync(abs)) {
        throw new Error(`loadGedcomFixture: fixture not found at ${abs} (input was "${path}")`);
    }
    const ext = extname(path).toLowerCase();
    if (ext === ".ged") {
        const text = readFileSync(abs, "utf-8");
        const parsed = parseGedcom(text);
        if (!parsed.ok) {
            throw new Error(`loadGedcomFixture: gedcom parse failed for ${path}: ${parsed.error}`);
        }
        return parsed.value.tree;
    }
    if (ext === ".gdz") {
        const bytes = readFileSync(abs);
        const arr = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const parsed = readBundle(arr);
        if (!parsed.ok) {
            throw new Error(
                `loadGedcomFixture: gdz bundle read failed for ${path}: ${parsed.error}`,
            );
        }
        return parsed.value.tree;
    }
    throw new Error(
        `loadGedcomFixture: unsupported extension "${ext}" for ${path} - only .ged and .gdz are accepted`,
    );
}
