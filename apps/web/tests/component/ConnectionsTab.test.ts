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
    };
}

describe("ConnectionsTab", () => {
    it("shows mother and father as not set when the person has no parents", () => {
        const subject = person();
        const t: Tree = {
            id: "t",
            name: "T",
            rootId: "AAAAA",
            people: { AAAAA: subject },
            couples: [],
            rev: 0,
            updatedAt: 0,
        };
        render(ConnectionsTab, { tree: t, person: subject, ...callbacks() });
        const empties = screen.getAllByText("— not set —");
        expect(empties.length).toBe(2);
    });

    it("renders the linked mother with a change + unlink button", async () => {
        const cb = callbacks();
        const subject = person({ id: "AAAAA", motherId: "MMMMM" });
        const mother = person({ id: "MMMMM", given: "Mum", surname: "X", gender: "f" });
        const t: Tree = {
            id: "t",
            name: "T",
            rootId: "AAAAA",
            people: { AAAAA: subject, MMMMM: mother },
            couples: [],
            rev: 0,
            updatedAt: 0,
        };
        render(ConnectionsTab, { tree: t, person: subject, ...cb });

        expect(screen.getByText("Mum X")).toBeInTheDocument();

        await fireEvent.click(screen.getByRole("button", { name: /unlink mother/i }));
        expect(cb.onunsetParent).toHaveBeenCalledWith("AAAAA", "mother");
    });

    it("opens the chooser when 'set mother' is clicked and pick wires onsetParent", async () => {
        const cb = callbacks();
        const subject = person({ id: "AAAAA" });
        const mum = person({ id: "MMMMM", given: "Mum", surname: "X", gender: "f" });
        const t: Tree = {
            id: "t",
            name: "T",
            rootId: "AAAAA",
            people: { AAAAA: subject, MMMMM: mum },
            couples: [],
            rev: 0,
            updatedAt: 0,
        };
        render(ConnectionsTab, { tree: t, person: subject, ...cb });

        await fireEvent.click(screen.getByRole("button", { name: /set mother/i }));
        // chooser dialog renders
        expect(screen.getByRole("dialog", { name: /set mother/i })).toBeInTheDocument();

        // click the candidate
        await fireEvent.click(screen.getByRole("button", { name: /Mum X/ }));
        expect(cb.onsetParent).toHaveBeenCalledWith("AAAAA", "MMMMM", "mother");
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
            rev: 0,
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
            motherId: "BBBBB",
            fatherId: "AAAAA",
        });
        const t: Tree = {
            id: "t",
            name: "T",
            rootId: "AAAAA",
            people: { AAAAA: subject, BBBBB: partner, CCCCC: child },
            couples: [],
            rev: 0,
            updatedAt: 0,
        };
        render(ConnectionsTab, { tree: t, person: subject, ...cb });

        expect(screen.getByText("Gamma X")).toBeInTheDocument();
        expect(screen.getByText(/with Beta X/i)).toBeInTheDocument();

        await fireEvent.click(screen.getByRole("button", { name: /unlink child Gamma X/i }));
        expect(cb.onremoveChild).toHaveBeenCalledWith("AAAAA", "CCCCC");
    });
});
