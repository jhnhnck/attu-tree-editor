/*
 * FamilyTreeEditor - Menu: open-source tracking (mouse vs keyboard) and first-item highlight
 * licensed under the MIT license; see LICENSE.md for full text
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import Menu from "$lib/components/shell/Menu.svelte";
import MenuHarness from "./_harness/MenuHarness.svelte";
import type { MenuEntry } from "$lib/components/shell/menu";

function items(): MenuEntry[] {
    return [
        { label: "Alpha", onclick: vi.fn() },
        { label: "Beta", onclick: vi.fn() },
        { label: "Gamma", onclick: vi.fn() },
    ];
}

describe("Menu", () => {
    it("mouse-click open: no menuitem is focused, no activeIdx highlight", async () => {
        const onopen = vi.fn();
        const onclose = vi.fn();
        const { rerender } = render(Menu, {
            label: "File",
            items: items(),
            open: false,
            onopen,
            onclose,
        });
        const button = screen.getByRole("button", { name: "File" });
        // simulate a real mouse click: the harness toggles open in response to onopen
        await fireEvent.click(button);
        expect(onopen).toHaveBeenCalledTimes(1);
        // parent (the test) flips open to true to reflect the toggle
        await rerender({ label: "File", items: items(), open: true, onopen, onclose });
        await tick();
        await tick();
        // the trigger button should still be the active element (or body), NOT a menuitem
        const menuItems = screen.getAllByRole("menuitem");
        expect(menuItems.length).toBe(3);
        expect(document.activeElement).not.toBe(menuItems[0]);
        expect(document.activeElement).not.toBe(menuItems[1]);
        expect(document.activeElement).not.toBe(menuItems[2]);
    });

    it("keyboard-open (ArrowDown on trigger): first item is focused", async () => {
        const onopen = vi.fn();
        const onclose = vi.fn();
        const { rerender } = render(Menu, {
            label: "File",
            items: items(),
            open: false,
            onopen,
            onclose,
        });
        const button = screen.getByRole("button", { name: "File" });
        button.focus();
        await fireEvent.keyDown(button, { key: "ArrowDown" });
        expect(onopen).toHaveBeenCalledTimes(1);
        await rerender({ label: "File", items: items(), open: true, onopen, onclose });
        await tick();
        await tick();
        const menuItems = screen.getAllByRole("menuitem");
        expect(document.activeElement).toBe(menuItems[0]);
    });

    it("keyboard-open (Enter on trigger): no item is auto-highlighted", async () => {
        // Enter / Space open the menu but don't pre-highlight an item.
        // First ↑/↓ inside the menu sets the highlight (next test).
        const onopen = vi.fn();
        const onclose = vi.fn();
        const { rerender } = render(Menu, {
            label: "Edit",
            items: items(),
            open: false,
            onopen,
            onclose,
        });
        const button = screen.getByRole("button", { name: "Edit" });
        button.focus();
        await fireEvent.keyDown(button, { key: "Enter" });
        await rerender({ label: "Edit", items: items(), open: true, onopen, onclose });
        await tick();
        await tick();
        const menuItems = screen.getAllByRole("menuitem");
        expect(document.activeElement).not.toBe(menuItems[0]);
        expect(document.activeElement).not.toBe(menuItems[1]);
        expect(document.activeElement).not.toBe(menuItems[2]);
    });

    it("Home / End jump to first / last item from an unhighlighted menu", async () => {
        render(MenuHarness, { label: "Insert", items: items() });
        const button = screen.getByRole("button", { name: "Insert" });
        await fireEvent.click(button);
        await tick();
        await tick();
        const menu = screen.getByRole("menu");
        await fireEvent.keyDown(menu, { key: "End" });
        await tick();
        const menuItems = screen.getAllByRole("menuitem");
        expect(document.activeElement).toBe(menuItems[2]);
        await fireEvent.keyDown(menu, { key: "Home" });
        await tick();
        expect(document.activeElement).toBe(menuItems[0]);
    });

    it("mouse-open then ArrowDown: focuses first item only after the keypress", async () => {
        // uses a harness component to drive the open prop reactively
        render(MenuHarness, { label: "View", items: items() });
        const button = screen.getByRole("button", { name: "View" });
        await fireEvent.click(button);
        await tick();
        await tick();
        const menuItems = screen.getAllByRole("menuitem");
        // mouse open: nothing focused
        expect(document.activeElement).not.toBe(menuItems[0]);
        // now the user presses ArrowDown inside the menu — focus jumps to the first item
        const menu = screen.getByRole("menu");
        await fireEvent.keyDown(menu, { key: "ArrowDown" });
        await tick();
        expect(document.activeElement).toBe(menuItems[0]);
    });

    it("hover-then-click on the same trigger: no first-item highlight", async () => {
        // mouse interactions (hover or click) never auto-highlight an item
        render(MenuHarness, { label: "Help", items: items() });
        const button = screen.getByRole("button", { name: "Help" });
        await fireEvent.mouseEnter(button);
        await fireEvent.click(button);
        await tick();
        await tick();
        const menuItems = screen.getAllByRole("menuitem");
        expect(document.activeElement).not.toBe(menuItems[0]);
    });

    it("mouse-open, close, then keyboard-open (ArrowDown): focuses first item", async () => {
        render(MenuHarness, { label: "Tree", items: items() });
        const button = screen.getByRole("button", { name: "Tree" });
        // first open via mouse
        await fireEvent.click(button);
        await tick();
        await tick();
        // close via second click (toggle)
        await fireEvent.click(button);
        await tick();
        // now keyboard-open
        button.focus();
        await fireEvent.keyDown(button, { key: "ArrowDown" });
        await tick();
        await tick();
        const menuItems = screen.getAllByRole("menuitem");
        expect(document.activeElement).toBe(menuItems[0]);
    });
});
