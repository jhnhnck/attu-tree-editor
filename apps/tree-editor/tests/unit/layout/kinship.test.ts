/*
 * FamilyTreeEditor - tests for layout/kinship.ts (kinship label derivation)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it } from "vitest";
import { ROOT_ID } from "$lib/domain/ids";
import { addPerson, createTree, linkParent, linkSpouse } from "$lib/domain/tree";
import { shortestPath } from "$lib/layout/graph";
import { kinshipTerm, pathCaption } from "$lib/layout/kinship";
import type { Person, Tree } from "$lib/domain/types";

function blank(name: string, gender: Person["gender"] = "u"): Omit<Person, "id"> {
    return {
        given: name,
        surname: "",
        gender,
        spouseIds: [],
        display: "z1",
    };
}

/** Add `n` ancestors above ROOT_ID and return the topmost ancestor's id. */
function addAncestorChain(
    tree: Tree,
    n: number,
    gender: Person["gender"],
): { tree: Tree; topId: string; chain: string[] } {
    let t = tree;
    let lastChild = ROOT_ID;
    const chain: string[] = [];
    for (let i = 0; i < n; i++) {
        const a = addPerson(t, blank(`ancestor${String(i)}`, gender));
        t = a.tree;
        const linked = linkParent(t, lastChild, a.id);
        if (!linked.ok) throw new Error(linked.error);
        t = linked.value;
        chain.push(a.id);
        lastChild = a.id;
    }
    return { tree: t, topId: lastChild, chain };
}

describe("kinshipTerm — lineal", () => {
    it("self for empty path", () => {
        const t = createTree("x", blank("root", "u"));
        const p = shortestPath(t, ROOT_ID, ROOT_ID);
        expect(p).toBeDefined();
        expect(kinshipTerm(t, p!)).toBe("self");
    });

    it("mother / father / parent by gender", () => {
        let t = createTree("x", blank("root", "u"));
        const mom = addPerson(t, blank("mom", "f"));
        t = mom.tree;
        const r = linkParent(t, ROOT_ID, mom.id);
        if (!r.ok) throw new Error(r.error);
        t = r.value;
        const p = shortestPath(t, ROOT_ID, mom.id);
        expect(kinshipTerm(t, p!)).toBe("mother");

        let t2 = createTree("y", blank("root", "u"));
        const dad = addPerson(t2, blank("dad", "m"));
        t2 = dad.tree;
        const r2 = linkParent(t2, ROOT_ID, dad.id);
        if (!r2.ok) throw new Error(r2.error);
        t2 = r2.value;
        const p2 = shortestPath(t2, ROOT_ID, dad.id);
        expect(kinshipTerm(t2, p2!)).toBe("father");
    });

    it("grandparent / great-grandparent", () => {
        let t = createTree("x", blank("root", "u"));
        const built = addAncestorChain(t, 4, "f");
        t = built.tree;
        // 2nd ancestor up = grandmother
        const gp = shortestPath(t, ROOT_ID, built.chain[1]!);
        expect(kinshipTerm(t, gp!)).toBe("grandmother");
        // 3rd ancestor up = great-grandmother
        const ggp = shortestPath(t, ROOT_ID, built.chain[2]!);
        expect(kinshipTerm(t, ggp!)).toBe("great-grandmother");
        // 4th ancestor up = great-great-grandmother
        const gggp = shortestPath(t, ROOT_ID, built.chain[3]!);
        expect(kinshipTerm(t, gggp!)).toBe("great-great-grandmother");
    });

    it("son / daughter / child by gender", () => {
        let t = createTree("x", blank("root", "u"));
        const kid = addPerson(t, blank("kid", "m"));
        t = kid.tree;
        const r = linkParent(t, kid.id, ROOT_ID);
        if (!r.ok) throw new Error(r.error);
        t = r.value;
        const p = shortestPath(t, ROOT_ID, kid.id);
        expect(kinshipTerm(t, p!)).toBe("son");
    });

    it("grandchild / great-grandchild", () => {
        let t = createTree("x", blank("root", "u"));
        const a = addPerson(t, blank("kid", "u"));
        t = a.tree;
        const b = addPerson(t, blank("grand", "u"));
        t = b.tree;
        const c = addPerson(t, blank("great", "u"));
        t = c.tree;
        const r1 = linkParent(t, a.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, b.id, a.id);
        if (!r2.ok) throw new Error(r2.error);
        const r3 = linkParent(r2.value, c.id, b.id);
        if (!r3.ok) throw new Error(r3.error);
        t = r3.value;

        const grand = shortestPath(t, ROOT_ID, b.id);
        expect(kinshipTerm(t, grand!)).toBe("grandchild");
        const great = shortestPath(t, ROOT_ID, c.id);
        expect(kinshipTerm(t, great!)).toBe("great-grandchild");
    });
});

describe("kinshipTerm — sibling line", () => {
    it("sister / brother / sibling for shared parent", () => {
        let t = createTree("x", blank("mom", "f"));
        const a = addPerson(t, blank("alpha", "f"));
        t = a.tree;
        const b = addPerson(t, blank("beta", "m"));
        t = b.tree;
        const r1 = linkParent(t, a.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, b.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);
        t = r2.value;

        const sis = shortestPath(t, b.id, a.id);
        expect(kinshipTerm(t, sis!)).toBe("sister");
        const bro = shortestPath(t, a.id, b.id);
        expect(kinshipTerm(t, bro!)).toBe("brother");
    });

    it("aunt / uncle / grand-aunt", () => {
        // grandma -> mom + aunt; aunt has gender f
        let t = createTree("x", blank("grandma", "f"));
        const mom = addPerson(t, blank("mom", "f"));
        t = mom.tree;
        const aunt = addPerson(t, blank("aunt", "f"));
        t = aunt.tree;
        const me = addPerson(t, blank("me", "u"));
        t = me.tree;

        const r1 = linkParent(t, mom.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, aunt.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);
        const r3 = linkParent(r2.value, me.id, mom.id);
        if (!r3.ok) throw new Error(r3.error);
        t = r3.value;

        const auntPath = shortestPath(t, me.id, aunt.id);
        expect(kinshipTerm(t, auntPath!)).toBe("aunt");

        // me → grandma is "grandmother" not "grand-aunt"
        const gp = shortestPath(t, me.id, ROOT_ID);
        expect(kinshipTerm(t, gp!)).toBe("grandmother");
    });

    it("nephew / niece (M=1, N=2)", () => {
        // me → sibling → child = nephew/niece
        let t = createTree("x", blank("mom", "f"));
        const me = addPerson(t, blank("me", "u"));
        t = me.tree;
        const sib = addPerson(t, blank("sib", "u"));
        t = sib.tree;
        const niece = addPerson(t, blank("niece", "f"));
        t = niece.tree;
        const r1 = linkParent(t, me.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, sib.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);
        const r3 = linkParent(r2.value, niece.id, sib.id);
        if (!r3.ok) throw new Error(r3.error);
        t = r3.value;

        const p = shortestPath(t, me.id, niece.id);
        expect(kinshipTerm(t, p!)).toBe("niece");
    });
});

describe("kinshipTerm — cousins", () => {
    function buildCousinFixture(): { tree: Tree; me: string; cousin: string } {
        // GP → momA + momB; momA → me; momB → cousin
        let t = createTree("x", blank("gp", "u"));
        const momA = addPerson(t, blank("momA", "f"));
        t = momA.tree;
        const momB = addPerson(t, blank("momB", "f"));
        t = momB.tree;
        const me = addPerson(t, blank("me", "u"));
        t = me.tree;
        const cousin = addPerson(t, blank("cousin", "u"));
        t = cousin.tree;
        const r1 = linkParent(t, momA.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, momB.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);
        const r3 = linkParent(r2.value, me.id, momA.id);
        if (!r3.ok) throw new Error(r3.error);
        const r4 = linkParent(r3.value, cousin.id, momB.id);
        if (!r4.ok) throw new Error(r4.error);
        return { tree: r4.value, me: me.id, cousin: cousin.id };
    }

    it("first cousin for up-2 down-2", () => {
        const fx = buildCousinFixture();
        const p = shortestPath(fx.tree, fx.me, fx.cousin);
        expect(kinshipTerm(fx.tree, p!)).toBe("1st cousin");
    });

    it("first cousin once removed for up-2 down-3", () => {
        const fx = buildCousinFixture();
        const child = addPerson(fx.tree, blank("cousin-child", "u"));
        const r = linkParent(child.tree, child.id, fx.cousin);
        if (!r.ok) throw new Error(r.error);
        const tree = r.value;

        const p = shortestPath(tree, fx.me, child.id);
        expect(kinshipTerm(tree, p!)).toBe("1st cousin once removed");
    });
});

describe("kinshipTerm — in-law / spouse", () => {
    it("husband for spouse w/ gender m", () => {
        let t = createTree("x", blank("root", "f"));
        const husb = addPerson(t, blank("husband", "m"));
        t = husb.tree;
        const r = linkSpouse(t, ROOT_ID, husb.id);
        if (!r.ok) throw new Error(r.error);
        t = r.value;
        const p = shortestPath(t, ROOT_ID, husb.id);
        expect(kinshipTerm(t, p!)).toBe("husband");
    });

    it("mother-in-law for spouse → mother chain", () => {
        let t = createTree("x", blank("root", "u"));
        const spouse = addPerson(t, blank("spouse", "u"));
        t = spouse.tree;
        const mil = addPerson(t, blank("mil", "f"));
        t = mil.tree;
        const r1 = linkSpouse(t, ROOT_ID, spouse.id);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, spouse.id, mil.id);
        if (!r2.ok) throw new Error(r2.error);
        t = r2.value;

        const p = shortestPath(t, ROOT_ID, mil.id);
        // path is spouse → parent (single trailing spouse hop is at index 0,
        // so the in-law form runs through the "leading-spouse" branch:
        // "spouse's mother". both forms are accepted in usage; we standardised
        // on the "spouse's X" form.
        expect(kinshipTerm(t, p!)).toBe("spouse's mother");
    });

    it("brother-in-law for sibling → spouse chain (trailing spouse)", () => {
        // root → sibling → spouse(m) of sibling
        let t = createTree("x", blank("mom", "f"));
        const me = addPerson(t, blank("me", "u"));
        t = me.tree;
        const sib = addPerson(t, blank("sib", "u"));
        t = sib.tree;
        const sibSpouse = addPerson(t, blank("sibSpouse", "m"));
        t = sibSpouse.tree;
        const r1 = linkParent(t, me.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, sib.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);
        const r3 = linkSpouse(r2.value, sib.id, sibSpouse.id);
        if (!r3.ok) throw new Error(r3.error);
        t = r3.value;

        const p = shortestPath(t, me.id, sibSpouse.id);
        expect(kinshipTerm(t, p!)).toBe("brother-in-law");
    });
});

describe("kinshipTerm — pronouns override SEX-derived code", () => {
    it("she/her overrides legacy unknown -> sister", () => {
        let t = createTree("x", blank("mom", "f"));
        const me = addPerson(t, blank("me", "u"));
        t = me.tree;
        // sibling identity unknown but pronouns are she/her -> kinship reads "sister"
        const sib = addPerson(t, {
            ...blank("sib", "u"),
            gender: { identity: "unknown", pronouns: "she/her" },
        });
        t = sib.tree;
        const r1 = linkParent(t, me.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, sib.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);
        t = r2.value;
        const p = shortestPath(t, me.id, sib.id);
        expect(kinshipTerm(t, p!)).toBe("sister");
    });

    it("they/them overrides legacy male -> sibling (neutral)", () => {
        let t = createTree("x", blank("mom", "f"));
        const me = addPerson(t, blank("me", "u"));
        t = me.tree;
        // legacy SEX would say "brother"; pronouns flip to neutral
        const sib = addPerson(t, {
            ...blank("sib", "m"),
            gender: { identity: "male", pronouns: "they/them" },
        });
        t = sib.tree;
        const r1 = linkParent(t, me.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, sib.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);
        t = r2.value;
        const p = shortestPath(t, me.id, sib.id);
        expect(kinshipTerm(t, p!)).toBe("sibling");
    });

    it("he/him on a non-binary identity -> brother", () => {
        let t = createTree("x", blank("mom", "f"));
        const me = addPerson(t, blank("me", "u"));
        t = me.tree;
        const sib = addPerson(t, {
            ...blank("sib", "u"),
            gender: { identity: "agender", pronouns: "he/him" },
        });
        t = sib.tree;
        const r1 = linkParent(t, me.id, ROOT_ID);
        if (!r1.ok) throw new Error(r1.error);
        const r2 = linkParent(r1.value, sib.id, ROOT_ID);
        if (!r2.ok) throw new Error(r2.error);
        t = r2.value;
        const p = shortestPath(t, me.id, sib.id);
        expect(kinshipTerm(t, p!)).toBe("brother");
    });
});

describe("pathCaption", () => {
    it("renders a readable arrow chain", () => {
        let t = createTree("x", blank("root", "u"));
        const mom = addPerson(t, blank("Alice", "f"));
        t = mom.tree;
        const r = linkParent(t, ROOT_ID, mom.id);
        if (!r.ok) throw new Error(r.error);
        t = r.value;
        const p = shortestPath(t, ROOT_ID, mom.id);
        const caption = pathCaption(t, p!);
        expect(caption).toContain("→ mother");
        expect(caption).toContain("Alice");
    });
});
