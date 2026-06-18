// SPDX-License-Identifier: MIT
//
// Hand-built regression fixtures for the three layered-engine bugs the
// `layered-and-tooling` plan closes. See notes/plans/layered-and-tooling.md
// Phase 0e. Used by the metrics spike (0a) and the ghost-contiguity spike
// (0c), and consumed as unit-test fixtures by Phase 1 + Phase 2.

import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import type { Person, PersonId, Tree } from "$lib/domain/types";

type NewPerson = Omit<Person, "id">;

function p(given: string, gender: "m" | "f" | "u" = "u"): NewPerson {
    return { given, surname: "Fam", gender, spouseIds: [], display: "z0" };
}

function add(t: Tree, np: NewPerson): { tree: Tree; id: PersonId } {
    return addPerson(t, np);
}

function parent(t: Tree, childId: PersonId, parentId: PersonId): Tree {
    const r = linkParent(t, childId, parentId);
    if (!r.ok) throw new Error(`linkParent ${childId} ← ${parentId} failed: ${r.error}`);
    return r.value;
}

function spouse(t: Tree, aId: PersonId, bId: PersonId): Tree {
    const r = linkSpouse(t, aId, bId);
    if (!r.ok) throw new Error(`linkSpouse ${aId} ↔ ${bId} failed: ${r.error}`);
    return r.value;
}

/**
 * 8-person bug repro for [bugs.md:17](../../../../notes/bugs.md#L17) +
 * [bugs.md:18](../../../../notes/bugs.md#L18).
 *
 * Structure:
 *   rank 0: Moma (f) + Dada (m) couple; New Person (m, single)
 *   rank 1: Korak (m) = child of Moma+Dada; Wife (f) = child of New Person;
 *           Korak + Wife couple
 *   rank 2: Childa, Childb, Childc = children of Korak+Wife
 *
 * Bug 18 (spouse orientation) — both couples should render with the male
 * partner on the left (Moma left of Dada, Wife right of Korak — both
 * "father-left"). Today's ordering is order-driven and produces an
 * inconsistent layout.
 *
 * Bug 17 (same-rank short bond stubbing) — the Korak+Wife bond should
 * render as one continuous segment with the couple-drop emerging
 * perpendicular at the children-centroid. On small fixtures where
 * `bbox.width / 4` is itself small, today's `maxBondSpan` threshold can
 * fire on short bonds and split them into two `/stub-l` + `/stub-r`
 * segments — see Phase 0b audit (notes/profiles/route-stub-paths.md)
 * for the exact branch.
 */
export function eightPersonFamily(): Tree {
    let t = createTree("8-person bug repro", p("Moma", "f"));
    const momaId = t.rootId;

    const r1 = add(t, p("Dada", "m"));
    t = r1.tree;
    const dadaId = r1.id;

    const r2 = add(t, p("Korak", "m"));
    t = r2.tree;
    const korakId = r2.id;

    const r3 = add(t, p("New Person", "m"));
    t = r3.tree;
    const newPersonId = r3.id;

    const r4 = add(t, p("Wife", "f"));
    t = r4.tree;
    const wifeId = r4.id;

    const r5 = add(t, p("Childa", "u"));
    t = r5.tree;
    const childaId = r5.id;
    const r6 = add(t, p("Childb", "u"));
    t = r6.tree;
    const childbId = r6.id;
    const r7 = add(t, p("Childc", "u"));
    t = r7.tree;
    const childcId = r7.id;

    t = spouse(t, momaId, dadaId);
    t = parent(t, korakId, momaId);
    t = parent(t, korakId, dadaId);
    t = parent(t, wifeId, newPersonId);
    t = spouse(t, korakId, wifeId);
    t = parent(t, childaId, korakId);
    t = parent(t, childaId, wifeId);
    t = parent(t, childbId, korakId);
    t = parent(t, childbId, wifeId);
    t = parent(t, childcId, korakId);
    t = parent(t, childcId, wifeId);

    return t;
}

/**
 * Distilled ghost-stranding fixture for [bugs.md:13](../../../../notes/bugs.md#L13).
 *
 * Goal: reproduce a ghost-cluster around a "near" person N. The original
 * case (Akarians `15LJ6` cluster) had a 4-ghost cluster at 5-17.5u from
 * its near.
 *
 * Strategy: N has 3 cross-rank in-law spouses (S1, S2, S3) at a deeper
 * rank, producing 3 ghosts of S{1,2,3} on N's rank. To push S{1,2,3}
 * one rank deeper than N, each Si has a single parent Mi on N's rank.
 * Foreign nodes F1, F2 on N's rank create crossing pressure that may
 * (per fallback clause) interleave them between N and its ghost cluster.
 *
 * Per Phase 0e pre-mortem fallback: this 18-person fixture may or may
 * not reproduce stranding at this scale (the original needed
 * Akarians-scale crossing pressure). The spike script (0c) records
 * whether it does; if not, Phase 2 verification falls back to the full
 * Akarians fixture and this fixture is used only for "no regression on
 * the small case" smoke tests.
 *
 * Structure (18 people, 3 ranks):
 *   rank 0: A1 + A2, B1 + B2, C1 + C2          (3 grand-couples for N/F1/F2)
 *           G1, G2, G3                          (3 great-grandparents for
 *                                                the M-line, no spouses)
 *   rank 1: N (child of A1+A2),
 *           F1 (child of B1+B2),
 *           F2 (child of C1+C2),
 *           M1 (child of G1),
 *           M2 (child of G2),
 *           M3 (child of G3)                    (single-parent anchors
 *                                                for S{1,2,3})
 *   rank 2: S1 (child of M1),
 *           S2 (child of M2),
 *           S3 (child of M3)                    (cross-rank spouses of N)
 *   rank 1 also gets: ghost(S1|N), ghost(S2|N), ghost(S3|N)
 */
export function ghostStrandingDistilled(): Tree {
    let t = createTree("ghost-stranding distilled", p("A1", "f"));
    const a1Id = t.rootId;

    const ids: Record<string, PersonId> = { A1: a1Id };

    // rank 0 — three unrelated grand-couples + 3 great-grandparents
    // of the M-line (G's parent M, M's parent S, pushing S to rank 2)
    for (const name of ["A2", "B1", "B2", "C1", "C2", "G1", "G2", "G3"]) {
        const gender: "m" | "f" | "u" = name.endsWith("2") ? "m" : "f";
        const r = add(t, p(name, gender));
        t = r.tree;
        ids[name] = r.id;
    }

    // rank 1 — N, F1, F2 (children of A/B/C couples) and M1, M2, M3
    // (children of G1/G2/G3 so they land at rank 1)
    for (const name of ["N", "F1", "F2", "M1", "M2", "M3"]) {
        const r = add(t, p(name, "u"));
        t = r.tree;
        ids[name] = r.id;
    }

    // rank 2 — S1, S2, S3 (children of M1/M2/M3)
    for (const name of ["S1", "S2", "S3"]) {
        const r = add(t, p(name, "u"));
        t = r.tree;
        ids[name] = r.id;
    }

    // Couples among the grand-parents
    t = spouse(t, ids.A1!, ids.A2!);
    t = spouse(t, ids.B1!, ids.B2!);
    t = spouse(t, ids.C1!, ids.C2!);

    // Parent links rank 0 → rank 1
    t = parent(t, ids.N!, ids.A1!);
    t = parent(t, ids.N!, ids.A2!);
    t = parent(t, ids.F1!, ids.B1!);
    t = parent(t, ids.F1!, ids.B2!);
    t = parent(t, ids.F2!, ids.C1!);
    t = parent(t, ids.F2!, ids.C2!);
    t = parent(t, ids.M1!, ids.G1!);
    t = parent(t, ids.M2!, ids.G2!);
    t = parent(t, ids.M3!, ids.G3!);

    // Parent links rank 1 → rank 2 (M's parent S's, pushing S to rank 2)
    t = parent(t, ids.S1!, ids.M1!);
    t = parent(t, ids.S2!, ids.M2!);
    t = parent(t, ids.S3!, ids.M3!);

    // Cross-rank spouse pairs: N (rank 1) ↔ S{1,2,3} (rank 2). Each
    // produces a ghost of Si on N's rank.
    t = spouse(t, ids.N!, ids.S1!);
    t = spouse(t, ids.N!, ids.S2!);
    t = spouse(t, ids.N!, ids.S3!);

    return t;
}
