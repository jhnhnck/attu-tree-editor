/*
 * FamilyTreeEditor - global keyboard shortcut runtime
 * licensed under the MIT license; see LICENSE.md for full text
 *
 * combo grammar: "Mod+Shift+P" - tokens joined by "+", last token is the key.
 *   Mod  -> Cmd on macOS, Ctrl elsewhere (use this for portable bindings)
 *   Ctrl, Meta/Cmd, Shift, Alt -> match exactly that modifier
 *   key  -> single character (letter/digit/punct) or named key (Enter, Esc, Insert, ArrowUp, ...)
 *
 * scope handling: most bindings are "canvas" scope - they're suppressed while focus
 * is in a text input/textarea/select/contenteditable so users can type without firing
 * shortcuts. "global" bindings always fire (use sparingly: Esc, Mod-prefixed combos).
 */

import { onDestroy, onMount } from "svelte";

export const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPad|iPhone|iPod/i.test(navigator.platform || navigator.userAgent || "");

export type ShortcutScope = "global" | "canvas";

export interface ShortcutBinding {
    combo: string;
    scope?: ShortcutScope | undefined;
    action: (e: KeyboardEvent) => void;
    /** call e.preventDefault() on a successful match. default true. */
    preventDefault?: boolean | undefined;
}

const SPECIAL_KEYS: Record<string, string> = {
    esc: "Escape",
    escape: "Escape",
    enter: "Enter",
    return: "Enter",
    space: " ",
    spacebar: " ",
    tab: "Tab",
    backspace: "Backspace",
    delete: "Delete",
    insert: "Insert",
    ins: "Insert",
    up: "ArrowUp",
    arrowup: "ArrowUp",
    down: "ArrowDown",
    arrowdown: "ArrowDown",
    left: "ArrowLeft",
    arrowleft: "ArrowLeft",
    right: "ArrowRight",
    arrowright: "ArrowRight",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pagedown: "PageDown",
    f1: "F1",
    f2: "F2",
    f3: "F3",
    f4: "F4",
    f5: "F5",
    f6: "F6",
    f7: "F7",
    f8: "F8",
    f9: "F9",
    f10: "F10",
    f11: "F11",
    f12: "F12",
};

// US-layout shifted-digit fallbacks: "Shift+1" should match when e.key="!" too.
const SHIFTED_DIGIT: Record<string, string> = {
    "1": "!",
    "2": "@",
    "3": "#",
    "4": "$",
    "5": "%",
    "6": "^",
    "7": "&",
    "8": "*",
    "9": "(",
    "0": ")",
};

function matchKey(e: KeyboardEvent, key: string): boolean {
    const lower = key.toLowerCase();
    const special = SPECIAL_KEYS[lower];
    if (special) return e.key === special;
    if (lower in SHIFTED_DIGIT) {
        return e.key === lower || e.key === SHIFTED_DIGIT[lower] || e.code === `Digit${lower}`;
    }
    return e.key.toLowerCase() === lower;
}

function matches(e: KeyboardEvent, combo: string): boolean {
    const parts = combo.split("+").map((s) => s.trim());
    const keyToken = parts.pop();
    if (!keyToken) return false;
    const mods = new Set(parts.map((m) => m.toLowerCase()));
    const wantCtrl = mods.has("ctrl");
    const wantMeta = mods.has("meta") || mods.has("cmd");
    const wantMod = mods.has("mod");
    const wantShift = mods.has("shift");
    const wantAlt = mods.has("alt");

    const expectCtrl = wantCtrl || (wantMod && !isMac);
    const expectMeta = wantMeta || (wantMod && isMac);

    if (e.ctrlKey !== expectCtrl) return false;
    if (e.metaKey !== expectMeta) return false;
    if (e.altKey !== wantAlt) return false;

    // Shift handling is loose for printable punctuation: e.g. "?" is Shift+/ on US layouts.
    // For named keys / letters / digits we require exact shift match.
    const isPunctKey = keyToken.length === 1 && !/[a-z0-9]/i.test(keyToken);
    if (wantShift && !e.shiftKey) return false;
    if (!wantShift && e.shiftKey && !isPunctKey) return false;

    return matchKey(e, keyToken);
}

function isEditingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return false;
}

/**
 * Install a set of keyboard bindings for the lifetime of the calling component.
 * Must be called inside a Svelte component setup (uses onMount/onDestroy).
 */
export function installShortcuts(bindings: readonly ShortcutBinding[]): void {
    function onKeydown(e: KeyboardEvent): void {
        const editing = isEditingTarget(e.target);
        for (const b of bindings) {
            const scope = b.scope ?? "canvas";
            if (editing && scope === "canvas") continue;
            if (matches(e, b.combo)) {
                if (b.preventDefault !== false) e.preventDefault();
                b.action(e);
                return;
            }
        }
    }
    onMount(() => {
        window.addEventListener("keydown", onKeydown);
    });
    onDestroy(() => {
        window.removeEventListener("keydown", onKeydown);
    });
}

const KEY_DISPLAY: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "↵",
    Escape: "Esc",
    " ": "Space",
};

/** human-readable rendering of a combo, platform-aware. */
export function formatCombo(combo: string): string {
    const parts = combo.split("+").map((s) => s.trim());
    const sep = isMac ? "" : "+";
    return parts
        .map((p) => {
            const lower = p.toLowerCase();
            if (lower === "mod") return isMac ? "⌘" : "Ctrl";
            if (lower === "meta" || lower === "cmd") return "⌘";
            if (lower === "ctrl") return "Ctrl";
            if (lower === "shift") return isMac ? "⇧" : "Shift";
            if (lower === "alt") return isMac ? "⌥" : "Alt";
            const special = SPECIAL_KEYS[lower];
            if (special && KEY_DISPLAY[special]) return KEY_DISPLAY[special];
            if (special) return special;
            return p.length === 1 ? p.toUpperCase() : p;
        })
        .join(sep);
}
