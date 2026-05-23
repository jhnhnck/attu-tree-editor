<!--
    FamilyTreeEditor - command palette overlay (Mod+P / Mod+Shift+P)
    one component, two modes: "anything" (people first, then commands)
    and "commands". prefix toggles: `>` jumps to commands, `@` to people.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { ArrowRight, Command as CommandIcon, Hash, Search, User } from "@lucide/svelte";
    import { formatCombo } from "$lib/keyboard";
    import type { IconComponent } from "$lib/components/shell/menu";
    import type { Person, Tree } from "$lib/domain/types";
    import type { Command } from "./commands";

    type Mode = "anything" | "commands";
    type Kind = "person" | "command";

    interface PersonRow {
        kind: "person";
        id: string;
        label: string;
        secondary: string;
        score: number;
    }
    interface CommandRow {
        kind: "command";
        id: string;
        label: string;
        secondary: string;
        score: number;
        icon: IconComponent | undefined;
        enabled: boolean;
    }
    type Row = PersonRow | CommandRow;

    interface Props {
        tree: Tree;
        commands: readonly Command[];
        mode: Mode;
        onpick: (kind: Kind, id: string) => void;
        onclose: () => void;
    }

    let { tree, commands, mode, onpick, onclose }: Props = $props();

    let inputEl: HTMLInputElement | undefined = $state();
    let containerEl: HTMLDivElement | undefined = $state();
    let listEl: HTMLDivElement | undefined = $state();
    let query = $state("");
    let activeIdx = $state(0);

    /**
     * derive the "effective" mode + the user-visible filter portion of the input
     * after stripping a leading `>` or `@`. those prefixes override the mode prop.
     */
    interface View {
        effectiveMode: Mode;
        peopleOnly: boolean;
        q: string;
    }
    const view = $derived.by<View>(() => {
        const raw = query;
        if (raw.startsWith(">")) {
            return { effectiveMode: "commands", peopleOnly: false, q: raw.slice(1).trim() };
        }
        if (raw.startsWith("@")) {
            return { effectiveMode: "anything", peopleOnly: true, q: raw.slice(1).trim() };
        }
        return { effectiveMode: mode, peopleOnly: false, q: raw.trim() };
    });

    function fullName(p: Person): string {
        return [p.given, p.surname].filter(Boolean).join(" ").trim() || "(unnamed)";
    }

    function fuzzyScore(text: string, q: string): number {
        if (!q) return 1;
        const t = text.toLowerCase();
        const lower = q.toLowerCase();
        if (t === lower) return 100;
        if (t.startsWith(lower)) return 50;
        if (t.includes(` ${lower}`)) return 30;
        if (t.includes(lower)) return 10;
        // simple subsequence fallback: every char of q in order in t
        let i = 0;
        for (const ch of t) {
            if (ch === lower[i]) i += 1;
            if (i === lower.length) return 5;
        }
        return 0;
    }

    const people = $derived(Object.values(tree.people));

    const rows = $derived.by<Row[]>(() => {
        const v = view;
        const limit = 50;
        const peopleRows: PersonRow[] = [];
        const commandRows: CommandRow[] = [];

        const wantPeople = v.effectiveMode === "anything";
        const wantCommands =
            v.effectiveMode === "commands" || (v.effectiveMode === "anything" && !v.peopleOnly);

        if (wantPeople || v.peopleOnly) {
            for (const p of people) {
                const name = fullName(p);
                const score = fuzzyScore(name, v.q);
                if (v.q && score === 0) continue;
                peopleRows.push({
                    kind: "person",
                    id: p.id,
                    label: name,
                    secondary: p.id,
                    score,
                });
            }
            peopleRows.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
        }

        if (wantCommands && !v.peopleOnly) {
            for (const c of commands) {
                const score = fuzzyScore(c.label, v.q);
                if (v.q && score === 0) continue;
                const enabled = c.enabled ? c.enabled() : true;
                commandRows.push({
                    kind: "command",
                    id: c.id,
                    label: c.label,
                    secondary: c.shortcut ? formatCombo(c.shortcut) : c.group,
                    score,
                    icon: c.icon,
                    enabled,
                });
            }
            commandRows.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
        }

        // ordering: commands-mode shows commands. anything-mode shows people then commands.
        // people-only (`@`) shows people exclusively.
        let combined: Row[];
        if (v.peopleOnly) combined = peopleRows;
        else if (v.effectiveMode === "commands") combined = commandRows;
        else combined = [...peopleRows.slice(0, limit), ...commandRows.slice(0, limit)];

        return combined.slice(0, limit);
    });

    $effect(() => {
        // reset highlight whenever the row list shrinks/grows
        void rows;
        if (activeIdx >= rows.length) activeIdx = 0;
    });

    async function focusInput(): Promise<void> {
        await tick();
        inputEl?.focus();
        inputEl?.select();
    }

    onMount(() => {
        void focusInput();
        window.addEventListener("pointerdown", onWindowDown, true);
    });
    onDestroy(() => {
        window.removeEventListener("pointerdown", onWindowDown, true);
    });

    function onWindowDown(e: PointerEvent): void {
        if (!containerEl) return;
        if (e.target instanceof Node && containerEl.contains(e.target)) return;
        onclose();
    }

    function pickRow(row: Row): void {
        if (row.kind === "command" && !rowEnabled(row)) return;
        onpick(row.kind, row.id);
    }

    function rowEnabled(row: Row): boolean {
        if (row.kind === "command") return row.enabled;
        return true;
    }

    function ensureVisible(idx: number): void {
        if (!listEl) return;
        const el = listEl.querySelector<HTMLElement>(`[data-row="${String(idx)}"]`);
        el?.scrollIntoView({ block: "nearest" });
    }

    function onKey(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.preventDefault();
            onclose();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (rows.length === 0) return;
            activeIdx = (activeIdx + 1) % rows.length;
            ensureVisible(activeIdx);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (rows.length === 0) return;
            activeIdx = (activeIdx - 1 + rows.length) % rows.length;
            ensureVisible(activeIdx);
        } else if (e.key === "Enter") {
            e.preventDefault();
            const row = rows[activeIdx];
            if (row) pickRow(row);
        }
    }

    function placeholder(): string {
        const v = view;
        if (v.peopleOnly) return "find a person…";
        if (v.effectiveMode === "commands") return "type a command…";
        return "find a person or type > for commands…";
    }
</script>

<!-- backdrop is non-blocking; outside-click closes via the pointerdown listener -->
<div
    class="fixed inset-0 z-60 flex items-start justify-center px-4 pt-[18vh]"
    role="dialog"
    aria-modal="true"
    aria-label="command palette"
>
    <button
        type="button"
        class="absolute inset-0 cursor-default bg-black/30 backdrop-blur-[1px]"
        aria-label="dismiss"
        onclick={onclose}
        tabindex="-1"
    ></button>

    <div
        bind:this={containerEl}
        class="bg-canvas-elev border-line text-fg relative w-full max-w-130 overflow-hidden rounded-lg border shadow-2xl"
    >
        <header class="border-line flex items-center gap-2 border-b px-3 py-2">
            <Search size={14} class="text-fg-muted shrink-0" />
            <input
                bind:this={inputEl}
                bind:value={query}
                onkeydown={onKey}
                type="text"
                class="text-fg placeholder:text-fg-muted flex-1 bg-transparent text-sm outline-none"
                placeholder={placeholder()}
                aria-label="palette search"
                spellcheck="false"
                autocomplete="off"
            />
            <span class="text-fg-muted hidden font-mono text-[10px] sm:inline">
                {view.peopleOnly
                    ? "@ people"
                    : view.effectiveMode === "commands"
                      ? "> commands"
                      : "any"}
            </span>
        </header>

        <div bind:this={listEl} class="max-h-[50vh] overflow-y-auto py-1">
            {#if rows.length === 0}
                <div class="text-fg-muted px-3 py-6 text-center text-xs">no matches</div>
            {:else}
                {#each rows as row, i (row.kind + ":" + row.id)}
                    {@const Icon = row.kind === "person" ? User : (row.icon ?? CommandIcon)}
                    {@const enabled = rowEnabled(row)}
                    <button
                        type="button"
                        data-row={i}
                        data-kind={row.kind}
                        disabled={!enabled}
                        class="hover:bg-canvas group flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none disabled:cursor-not-allowed disabled:opacity-40"
                        class:bg-canvas={i === activeIdx}
                        onmouseenter={() => (activeIdx = i)}
                        onclick={() => pickRow(row)}
                    >
                        <Icon size={14} strokeWidth={2.25} class="text-fg-muted shrink-0" />
                        <span class="flex-1 truncate">{row.label}</span>
                        <span class="text-fg-muted flex items-center gap-1 font-mono text-[11px]">
                            {#if row.kind === "person"}
                                <Hash size={10} />
                            {/if}
                            {row.secondary}
                        </span>
                        <ArrowRight
                            size={12}
                            class="text-fg-muted opacity-0 group-hover:opacity-100"
                        />
                    </button>
                {/each}
            {/if}
        </div>

        <footer
            class="border-line text-fg-muted flex items-center justify-between border-t px-3 py-1.5 text-[11px]"
        >
            <span class="flex items-center gap-2">
                <kbd class="border-line bg-canvas rounded border px-1 font-mono">↑↓</kbd>
                navigate
                <kbd class="border-line bg-canvas rounded border px-1 font-mono">↵</kbd>
                select
                <kbd class="border-line bg-canvas rounded border px-1 font-mono">Esc</kbd>
                close
            </span>
            <span class="hidden items-center gap-1 sm:inline-flex">
                <kbd class="border-line bg-canvas rounded border px-1 font-mono">&gt;</kbd>
                commands
                <kbd class="border-line bg-canvas rounded border px-1 font-mono">@</kbd>
                people
            </span>
        </footer>
    </div>
</div>
