/*
 * FamilyTreeEditor - Inspector Connections tab: link / unlink / change parents,
 * partners, and children via the PersonChooser popover.
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ConnectionsTab from "$lib/components/inspector/ConnectionsTab.svelte";
import type { Person, Tree } from "$lib/domain/types";

function person(over: Partial<Person> = {}): Person {
    return {
        id: "AAAAA",
        given: "Alpha",
        surname: "X",
        gender: "m",
        spouseIds: [],
        display: "z1",
        ...over,
    };
}

function callbacks() {
    return {
        onsetParent: vi.fn(),
        onunsetParent: vi.fn(),
        onaddPartner: vi.fn(),
        onremovePartner: vi.fn(),
        onaddChild: vi.fn(),
        onremoveChild: vi.fn(),
        oncreateAndLink: vi.fn(),
        onselect: vi.fn(),
        onpatchCouple: vi.fn(),
    };
}

describe("ConnectionsTab", () => {
    it("shows no parent rows and an add-parent button when the person has no parents", () => {
        const subject = person();
        const t: Tree = {
            id: "t",
            name: "T",
            rootId: "AAAAA",
            people: { AAAAA: subject },
            couples: [],
            editRev: 0,
            updatedAt: 0,
        };
        render(ConnectionsTab, { tree: t, person: subject, ...callbacks() });
        // no parent rows rendered
        expect(screen.queryAllByRole("button", { name: /unlink parent/i })).toHaveLength(0);
        // add-parent affordance is always present
        expect(screen.getByRole("button", { name: /add parent/i })).toBeInTheDocument();
    });

    it("renders the linked mother with role/pedi selects and a change + unlink button", async () => {
        const cb = callbacks();
        const subject = person({
            id: "AAAAA",
            parentIds: [{ personId: "MMMMM", role: "mother", pedi: "birth" }],
        });
        const mother = person({ id: "MMMMM", given: "Mum", surname: "X", gender: "f" });
        const t: Tree = {
            id: "t",
            name: "T",
            rootId: "AAAAA",
            people: { AAAAA: subject, MMMMM: mother },
            couples: [],
            editRev: 0,
            updatedAt: 0,
        };
        render(ConnectionsTab, { tree: t, person: subject, ...cb });

        expect(screen.getByText("Mum X")).toBeInTheDocument();

        // unlink falls back to onunsetParent when onunsetParentById is absent
        await fireEvent.click(screen.getByRole("button", { name: /unlink parent Mum X/i }));
        expect(cb.onunsetParent).toHaveBeenCalledWith("AAAAA", "mother");
    });

    it("opens the chooser when 'add parent' is clicked and pick wires onaddParentRef", async () => {
        const cb = { ...callbacks(), onaddParentRef: vi.fn() };
        const subject = person({ id: "AAAAA" });
        const mum = person({ id: "MMMMM", given: "Mum", surname: "X", gender: "f" });
        const t: Tree = {
            id: "t",
            name: "T",
            rootId: "AAAAA",
            people: { AAAAA: subject, MMMMM: mum },
            couples: [],
            editRev: 0,
            updatedAt: 0,
        };
        render(ConnectionsTab, { tree: t, person: subject, ...cb });

        await fireEvent.click(screen.getByRole("button", { name: /add parent/i }));
        // chooser dialog renders with "add parent" title
        expect(screen.getByRole("dialog", { name: /add parent/i })).toBeInTheDocument();

        // click the candidate
        await fireEvent.click(screen.getByRole("button", { name: /Mum X/ }));
        expect(cb.onaddParentRef).toHaveBeenCalledWith("AAAAA", {
            personId: "MMMMM",
            role: "parent",
            pedi: "birth",
        });
    });

    it("change button on a mother row opens the chooser and wires onsetParent", async () => {
        const cb = callbacks();
        const subject = person({
            id: "AAAAA",
            parentIds: [{ personId: "MMMMM", role: "mother", pedi: "birth" }],
        });
        const mum = person({ id: "MMMMM", given: "Mum", surname: "X", gender: "f" });
        const dad = person({ id: "DDDDD", given: "Dad", surname: "X", gender: "m" });
        const t: Tree = {
            id: "t",
            name: "T",
            rootId: "AAAAA",
            people: { AAAAA: subject, MMMMM: mum, DDDDD: dad },
            couples: [],
            editRev: 0,
            updatedAt: 0,
        };
        render(ConnectionsTab, { tree: t, person: subject, ...cb });

        await fireEvent.click(screen.getByRole("button", { name: /change parent Mum X/i }));
        expect(screen.getByRole("dialog", { name: /set mother/i })).toBeInTheDocument();

        await fireEvent.click(screen.getByRole("button", { name: /Dad X/ }));
        expect(cb.onsetParent).toHaveBeenCalledWith("AAAAA", "DDDDD", "mother");
    });

    it("'create new person' from the chooser fires oncreateAndLink with the slot", async () => {
        const cb = callbacks();
        const subject = person({ id: "AAAAA" });
        const t: Tree = {
            id: "t",
            name: "T",
            rootId: "AAAAA",
            people: { AAAAA: subject },
            couples: [],
            editRev: 0,
            updatedAt: 0,
        };
        render(ConnectionsTab, { tree: t, person: subject, ...cb });

        await fireEvent.click(screen.getByRole("button", { name: /^add partner$/i }));
        await fireEvent.click(screen.getByRole("button", { name: /create new person/i }));
        expect(cb.oncreateAndLink).toHaveBeenCalledWith({ kind: "partner" });
    });

    it("lists children with their other-parent label and exposes unlink", async () => {
        const cb = callbacks();
        const subject = person({ id: "AAAAA" });
        const partner = person({ id: "BBBBB", given: "Beta", gender: "f" });
        const child = person({
            id: "CCCCC",
            given: "Gamma",
            parentIds: [
                { personId: "BBBBB", role: "mother", pedi: "birth" },
                { personId: "AAAAA", role: "father", pedi: "birth" },
            ],
        });
        const t: Tree = {
            id: "t",
            name: "T",
            rootId: "AAAAA",
            people: { AAAAA: subject, BBBBB: partner, CCCCC: child },
            couples: [],
            editRev: 0,
            updatedAt: 0,
        };
        render(ConnectionsTab, { tree: t, person: subject, ...cb });

        expect(screen.getByText("Gamma X")).toBeInTheDocument();
        expect(screen.getByText(/with Beta X/i)).toBeInTheDocument();

        await fireEvent.click(screen.getByRole("button", { name: /unlink child Gamma X/i }));
        expect(cb.onremoveChild).toHaveBeenCalledWith("AAAAA", "CCCCC");
    });
});
