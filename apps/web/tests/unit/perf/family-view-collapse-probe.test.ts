/*
 * FamilyTreeEditor - Phase 1 auto-collapse probe.
 *
 * Per `notes/plans/family-view.md` Phase 1 "Probes" section:
 *
 *   Run `computeDoiScores` on Akarians with three focuses (root,
 *   mid-tree person, leaf). Print the would-be collapsed branches.
 *   Human review: do these look like sensible "things I don't care
 *   about right now" picks, or does DOI hide the focus's actual
 *   immediate relatives?
 *
 * The test never asserts; it logs the would-be collapsed top-15 from
 * each focus so the retro can record which heuristic shipped (DOI vs
 * the family-view fallback ranker).
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "$lib/io/gedcom/parse";
import { computeDoiScores } from "$lib/layout/doi";
import type { PersonId, Tree } from "$lib/domain/types";

const FIXTURE = resolve(process.cwd(), "tests/fixtures/Akarians.ged");

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
    if (!r.ok) throw new Error(r.error);
    return r.value;
}

const cached = (() => {
    const text = readFileSync(FIXTURE, "utf8");
    const { tree } = unwrap(parseGedcom(text));
    return { tree };
})();

function pickMidTree(tree: Tree): PersonId {
    // Heuristic: person with the most distinct named children — usually a
    // hub deep in the tree, distinct from the proband.
    let best: PersonId = tree.rootId;
    let bestKids = 0;
    const childCount = new Map<PersonId, number>();
    for (const p of Object.values(tree.people)) {
        for (const parentId of [p.motherId, p.fatherId]) {
            if (!parentId) continue;
            childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1);
        }
    }
    for (const [id, n] of childCount) {
        if (n > bestKids && id !== tree.rootId) {
            best = id;
            bestKids = n;
        }
    }
    return best;
}

function pickLeaf(tree: Tree): PersonId {
    // Heuristic: someone with no children and at least one named parent.
    const hasKids = new Set<PersonId>();
    for (const p of Object.values(tree.people)) {
        if (p.motherId) hasKids.add(p.motherId);
        if (p.fatherId) hasKids.add(p.fatherId);
    }
    for (const p of Object.values(tree.people)) {
        if (hasKids.has(p.id)) continue;
        if (!p.motherId && !p.fatherId) continue;
        return p.id;
    }
    return tree.rootId;
}

function namelet(tree: Tree, id: PersonId): string {
    const p = tree.people[id];
    if (!p) return `<${id}>`;
    const name = `${p.given} ${p.surname}`.trim() || id;
    return `${name}(${id.slice(0, 6)})`;
}

describe("phase 1 auto-collapse probe — Akarians DEMO", () => {
    const cases: { name: string; focus: PersonId }[] = [
        { name: "root (proband)", focus: cached.tree.rootId },
        { name: "mid-tree (most-children non-root)", focus: pickMidTree(cached.tree) },
        { name: "leaf (no-children with named parent)", focus: pickLeaf(cached.tree) },
    ];

    for (const { name, focus } of cases) {
        it(`prints the bottom 15 DOI for focus = ${name}`, () => {
            const scores = computeDoiScores({ tree: cached.tree, focus });
            const sorted = Array.from(scores.entries())
                .filter(([, s]) => Number.isFinite(s.score))
                .sort((a, b) => a[1].score - b[1].score);
            const bottom = sorted.slice(0, 15);
            const top = sorted.slice(-5);
            // eslint-disable-next-line no-console
            console.log(
                `\n[collapse-probe] focus=${namelet(cached.tree, focus)}` +
                    ` reachable=${String(scores.size)}\n` +
                    `  bottom 15 (would-collapse-first):\n` +
                    bottom
                        .map(
                            ([id, s]) =>
                                `    ${namelet(cached.tree, id)} score=${s.score.toFixed(2)}` +
                                ` dist=${String(s.distance)} aPri=${s.aPriori.toFixed(2)}`,
                        )
                        .join("\n") +
                    `\n  top 5 (would-keep):\n` +
                    top
                        .map(
                            ([id, s]) =>
                                `    ${namelet(cached.tree, id)} score=${s.score.toFixed(2)}` +
                                ` dist=${String(s.distance)} aPri=${s.aPriori.toFixed(2)}`,
                        )
                        .join("\n"),
            );
            expect(scores.size).toBeGreaterThan(0);
        });
    }
});
