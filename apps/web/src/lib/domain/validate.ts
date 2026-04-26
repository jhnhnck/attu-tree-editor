/*
 * FamilyTreeEditor - structural tree validator (orphan refs, cycles, duplicate spouses)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { isValidId, ROOT_ID } from "$lib/domain/ids";
import type { PersonId, Tree } from "$lib/domain/types";

export type Finding =
    | {
          kind: "orphan-reference";
          from: PersonId;
          field: "mother" | "father" | "spouse" | "anchor";
          missing: PersonId;
      }
    | { kind: "cycle"; path: PersonId[] }
    | { kind: "duplicate-spouse"; person: PersonId; spouse: PersonId }
    | { kind: "self-couple"; person: PersonId }
    | { kind: "missing-root"; rootId: PersonId }
    | { kind: "invalid-id"; id: PersonId }
    // io: parser-emitted
    | { kind: "unknown-line"; line: string; lineNumber: number }
    | { kind: "unknown-tag"; from: PersonId; tag: string; value: string }
    | {
          kind: "bad-date";
          from: PersonId;
          field: "birth" | "death" | "marriage";
          raw: string;
          reason: string;
      }
    | { kind: "dropped-subtag"; from: PersonId; tag: string }
    // merge-emitted
    | { kind: "unmatched-person"; person: PersonId; source: "familyscript" | "gedcom" }
    | { kind: "ambiguous-match"; person: PersonId; candidates: PersonId[] }
    | {
          kind: "field-conflict";
          person: PersonId;
          field: string;
          fromFamilyScript: unknown;
          fromGedcom: unknown;
          chosen: "familyscript" | "gedcom";
      };

export function validate(t: Tree): Finding[] {
    const findings: Finding[] = [];
    const ids = new Set(Object.keys(t.people));

    if (!ids.has(t.rootId)) {
        findings.push({ kind: "missing-root", rootId: t.rootId });
    }

    for (const person of Object.values(t.people)) {
        if (!isValidId(person.id) && person.id !== ROOT_ID) {
            findings.push({ kind: "invalid-id", id: person.id });
        }

        if (person.motherId !== undefined && !ids.has(person.motherId)) {
            findings.push({
                kind: "orphan-reference",
                from: person.id,
                field: "mother",
                missing: person.motherId,
            });
        }
        if (person.fatherId !== undefined && !ids.has(person.fatherId)) {
            findings.push({
                kind: "orphan-reference",
                from: person.id,
                field: "father",
                missing: person.fatherId,
            });
        }
        if (person.anchorParentId !== undefined && !ids.has(person.anchorParentId)) {
            findings.push({
                kind: "orphan-reference",
                from: person.id,
                field: "anchor",
                missing: person.anchorParentId,
            });
        }

        const spouseSeen = new Set<PersonId>();
        for (const sid of person.spouseIds) {
            if (!ids.has(sid)) {
                findings.push({
                    kind: "orphan-reference",
                    from: person.id,
                    field: "spouse",
                    missing: sid,
                });
                continue;
            }
            if (sid === person.id) {
                findings.push({ kind: "self-couple", person: person.id });
            }
            if (spouseSeen.has(sid)) {
                findings.push({ kind: "duplicate-spouse", person: person.id, spouse: sid });
            }
            spouseSeen.add(sid);
        }
    }

    findings.push(...detectAncestorCycles(t));
    return findings;
}

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

/**
 * Iterative DFS over the parent edges to find lineage cycles. We walk from each
 * person upward through motherId / fatherId; a back-edge to a gray (in-progress)
 * node identifies a cycle and we emit the path.
 */
function detectAncestorCycles(t: Tree): Finding[] {
    const findings: Finding[] = [];
    const color = new Map<PersonId, number>();
    const reportedCycles = new Set<string>();

    for (const startId of Object.keys(t.people)) {
        if (color.get(startId) === BLACK) continue;
        // stack frame: [nodeId, indexOfNextParentToVisit]
        const stack: [PersonId, number][] = [[startId, 0]];
        const path: PersonId[] = [];
        color.set(startId, GRAY);
        path.push(startId);

        while (stack.length > 0) {
            const frame = stack[stack.length - 1];
            if (!frame) break;
            const [current, parentIdx] = frame;
            const person = t.people[current];
            const parents: PersonId[] = [];
            if (person?.motherId) parents.push(person.motherId);
            if (person?.fatherId) parents.push(person.fatherId);

            if (parentIdx >= parents.length) {
                color.set(current, BLACK);
                path.pop();
                stack.pop();
                continue;
            }

            frame[1] = parentIdx + 1;
            const nextId = parents[parentIdx];
            if (nextId === undefined) continue;
            if (!t.people[nextId]) continue; // orphan refs handled elsewhere

            const nextColor = color.get(nextId) ?? WHITE;
            if (nextColor === GRAY) {
                const cycleStart = path.indexOf(nextId);
                const cycle = cycleStart >= 0 ? [...path.slice(cycleStart), nextId] : [nextId];
                const fingerprint = canonicalCycleKey(cycle);
                if (!reportedCycles.has(fingerprint)) {
                    reportedCycles.add(fingerprint);
                    findings.push({ kind: "cycle", path: cycle });
                }
            } else if (nextColor === WHITE) {
                color.set(nextId, GRAY);
                path.push(nextId);
                stack.push([nextId, 0]);
            }
            // BLACK -> already fully explored from another root, skip
        }
    }

    return findings;
}

function canonicalCycleKey(cycle: PersonId[]): string {
    // sort to make the fingerprint independent of which node we entered the cycle from
    return [...cycle].sort().join(">");
}
