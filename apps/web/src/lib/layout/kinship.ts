/*
 * FamilyTreeEditor - colloquial kinship-term derivation from a Path.
 *
 * Reads the shape of a path (counts of parent/child/spouse hops, with order
 * mattering only enough to detect the canonical "up-then-down" shape) and
 * returns a label like "1st cousin once removed" or "great-aunt". Uses the
 * destination's gender (read from `tree`) to pick mother vs father, brother
 * vs sister, etc. Falls back to a gender-neutral or "N degrees of separation"
 * label for exotic mixed paths.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { PersonId, Tree } from "$lib/domain/types";
import type { Path } from "$lib/layout/graph";

/**
 * Returns a short label for the kinship described by `path`. `path.ids[0]`
 * is the speaker; `path.ids[last]` is the person we're labelling.
 *
 * Strategy: classify the path shape, then look up the right term in a small
 * table. Five recognised shapes:
 *   1. self          (no steps)
 *   2. all-spouse    (1 step, via='spouse')
 *   3. lineal        (only 'parent' steps OR only 'child' steps)
 *   4. up-then-down  (some 'parent' steps then some 'child' steps; no spouses)
 *   5. with-spouse   (a single trailing or leading spouse hop on top of 1-4)
 *
 * Anything else falls back to "N degrees of separation".
 */
export function kinshipTerm(tree: Tree, path: Path): string {
    if (path.steps.length === 0) return "self";

    const last = path.ids[path.ids.length - 1];
    const targetGender = last !== undefined ? tree.people[last]?.gender : "u";

    // count spouse hops; locate them by index so we can detect "single hop at end"
    const spouseIdx: number[] = [];
    for (let i = 0; i < path.steps.length; i++) {
        if (path.steps[i]?.via === "spouse") spouseIdx.push(i);
    }

    // pure spouse: handled directly
    if (path.steps.length === 1 && spouseIdx.length === 1) {
        return spouseLabel(targetGender);
    }

    // strip a single trailing spouse hop — produces "X-in-law" style.
    // crucial: the gendered label uses the OUTER target's gender (the spouse
    // we married into), not the inner path's endpoint. e.g. me → sibling →
    // husband-of-sibling reads as "brother-in-law" (gender of husband), not
    // "sibling-in-law" (the gender-unknown sibling sat in the middle).
    if (spouseIdx.length === 1 && spouseIdx[0] === path.steps.length - 1) {
        const innerSteps = path.steps.slice(0, -1);
        const innerLabel = labelOfShape(innerSteps, targetGender);
        return inLawForm(innerLabel, targetGender);
    }

    // strip a single leading spouse hop — "spouse's X". gender-of-X is the
    // outer target's gender (which is also the inner-path's last person here).
    if (spouseIdx.length === 1 && spouseIdx[0] === 0) {
        const innerSteps = path.steps.slice(1);
        const innerLabel = labelOfShape(innerSteps, targetGender);
        return `spouse's ${innerLabel}`;
    }

    if (spouseIdx.length > 0) {
        // mixed paths with spouses in awkward positions: punt to a generic phrase
        return `${String(path.steps.length)} degrees of separation`;
    }

    return labelOfShape(path.steps, targetGender);
}

/**
 * Classify an up-then-down chain of `parent`/`child` steps and emit a label.
 * If the steps don't form a clean up-then-down shape (e.g. up, down, up),
 * fall back to "N degrees of separation". Spouse hops should be stripped by
 * the caller before invoking this helper.
 */
function labelOfShape(steps: ReadonlyArray<{ via: string }>, gender: string | undefined): string {
    let upCount = 0;
    let i = 0;
    while (i < steps.length && steps[i]?.via === "parent") {
        upCount += 1;
        i += 1;
    }
    let downCount = 0;
    while (i < steps.length && steps[i]?.via === "child") {
        downCount += 1;
        i += 1;
    }
    if (i !== steps.length) {
        return `${String(steps.length)} degrees of separation`;
    }
    return shapeToLabel(upCount, downCount, gender);
}

function spouseLabel(g: string | undefined): string {
    if (g === "m") return "husband";
    if (g === "f") return "wife";
    return "spouse";
}

function inLawForm(innerLabel: string, _g: string | undefined): string {
    // "1st cousin" → "1st cousin-in-law" reads weird; standard idiom inserts
    // "in-law" only after specific terms (parent, sibling, child). For everything
    // else say "X by marriage" which is unambiguous.
    const canonicalInLaw = new Set([
        "mother",
        "father",
        "parent",
        "brother",
        "sister",
        "sibling",
        "son",
        "daughter",
        "child",
    ]);
    if (canonicalInLaw.has(innerLabel)) return `${innerLabel}-in-law`;
    return `${innerLabel} by marriage`;
}

function shapeToLabel(up: number, down: number, g: string | undefined): string {
    if (up === 0 && down === 0) return "self";

    // pure ancestor chain
    if (down === 0) return ancestorLabel(up, g);
    // pure descendant chain
    if (up === 0) return descendantLabel(down, g);

    // sibling-line: one of the legs is exactly 1
    if (up === 1 && down === 1) return siblingLabel(g);
    if (up === 1) {
        // M=1, N>=2: nibling line; "niece/nephew" at N=2, "grand-niece" at N=3, etc.
        return grandPrefixed(niblingLabel(g), down - 2);
    }
    if (down === 1) {
        // M>=2, N=1: auncle line; "aunt/uncle" at M=2, "grand-aunt" at M=3, etc.
        return grandPrefixed(auncleLabel(g), up - 2);
    }

    // cousins: degree = min(up,down) - 1, removal = |up-down|
    const degree = Math.min(up, down) - 1;
    const removed = Math.abs(up - down);
    const ord = ordinal(degree);
    if (removed === 0) return `${ord} cousin`;
    if (removed === 1) return `${ord} cousin once removed`;
    if (removed === 2) return `${ord} cousin twice removed`;
    return `${ord} cousin ${String(removed)} times removed`;
}

function ancestorLabel(n: number, g: string | undefined): string {
    if (n === 1) {
        if (g === "f") return "mother";
        if (g === "m") return "father";
        return "parent";
    }
    return grandPrefixed(
        ancestorLabel(1, g) === "parent" ? "grandparent" : `grand${ancestorLabel(1, g)}`,
        n - 2,
    );
}

function descendantLabel(n: number, g: string | undefined): string {
    if (n === 1) {
        if (g === "f") return "daughter";
        if (g === "m") return "son";
        return "child";
    }
    return grandPrefixed(
        descendantLabel(1, g) === "child" ? "grandchild" : `grand${descendantLabel(1, g)}`,
        n - 2,
    );
}

function siblingLabel(g: string | undefined): string {
    if (g === "f") return "sister";
    if (g === "m") return "brother";
    return "sibling";
}

function auncleLabel(g: string | undefined): string {
    if (g === "f") return "aunt";
    if (g === "m") return "uncle";
    return "auncle";
}

function niblingLabel(g: string | undefined): string {
    if (g === "f") return "niece";
    if (g === "m") return "nephew";
    return "nibling";
}

/**
 * Stack `n` "great-" prefixes onto a "grand…" base. n=0 means the base term
 * stands alone (e.g. "grandmother"); n=1 → "great-grandmother";
 * n=4 → "great-great-great-great-grandmother".
 */
function grandPrefixed(base: string, n: number): string {
    if (n <= 0) return base;
    return `${"great-".repeat(n)}${base}`;
}

function ordinal(n: number): string {
    const mod100 = n % 100;
    const mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 13) return `${String(n)}th`;
    if (mod10 === 1) return `${String(n)}st`;
    if (mod10 === 2) return `${String(n)}nd`;
    if (mod10 === 3) return `${String(n)}rd`;
    return `${String(n)}th`;
}

/**
 * Concise sentence describing a path: e.g. "Alice → mother → grandfather → Bob".
 * Useful for the path-trace caption strip.
 */
export function pathCaption(tree: Tree, path: Path): string {
    if (path.steps.length === 0) {
        const id = path.ids[0];
        return id !== undefined ? displayName(tree, id) : "";
    }
    const parts: string[] = [];
    const firstId = path.ids[0];
    if (firstId !== undefined) parts.push(displayName(tree, firstId));
    for (let i = 0; i < path.steps.length; i++) {
        const step = path.steps[i];
        if (!step) continue;
        const sub: Path = {
            ids: path.ids.slice(0, i + 2),
            steps: path.steps.slice(0, i + 1),
        };
        const label = kinshipTerm(tree, sub);
        parts.push(`→ ${label}`);
    }
    const lastId = path.ids[path.ids.length - 1];
    if (lastId !== undefined) parts.push(`(${displayName(tree, lastId)})`);
    return parts.join(" ");
}

export function displayName(tree: Tree, id: PersonId): string {
    const p = tree.people[id];
    if (!p) return id;
    const name = `${p.given} ${p.surname}`.trim();
    return name || id;
}

/**
 * Geometric nearest-neighbour: given the current selection's position,
 * find the closest card that lies in the specified direction.
 *
 * Scoring: score = |perpendicular_delta| + |axis_delta| * 0.3
 * Only cards strictly in the direction half-plane (axis_delta > 0) are
 * considered. Returns undefined when no card exists in that direction.
 */
export function findNeighbour(
    currentId: PersonId,
    dir: "up" | "down" | "left" | "right",
    positions: ReadonlyMap<PersonId, { x: number; y: number }>,
): PersonId | undefined {
    const cur = positions.get(currentId);
    if (!cur) return undefined;

    let best: PersonId | undefined;
    let bestScore = Infinity;

    for (const [id, pos] of positions) {
        if (id === currentId) continue;
        const dx = pos.x - cur.x;
        const dy = pos.y - cur.y;

        let axis: number;
        let perp: number;
        switch (dir) {
            case "right":
                axis = dx;
                perp = dy;
                break;
            case "left":
                axis = -dx;
                perp = dy;
                break;
            case "down":
                axis = dy;
                perp = dx;
                break;
            case "up":
                axis = -dy;
                perp = dx;
                break;
        }

        if (axis <= 0) continue; // wrong direction

        const score = Math.abs(perp) + axis * 0.3;
        if (score < bestScore) {
            bestScore = score;
            best = id;
        }
    }

    return best;
}
