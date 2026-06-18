<!--
    FamilyTreeEditor - command palette overlay (Mod+P / Mod+Shift+P)
    one component, two modes: "anything" (people first, then commands)
    and "commands". prefix toggles: `>` jumps to commands, `@` to people,
    `#` to people by exact id. a bare id also matches when present.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { ArrowRight, Command as CommandIcon, Hash, Search, User } from "@lucide/svelte";
    import type { PaletteItem } from "@attu/ui";

    type Mode = "anything" | "commands";

    interface Row {
        item: PaletteItem;
        score: number;
        enabled: boolean;
    }

    interface Props {
        items: PaletteItem[];
        mode: Mode;
        onclose: () => void;
    }

    let { items, mode, onclose }: Props = $props();

    let inputEl: HTMLInputElement | undefined = $state();
    let containerEl: HTMLDivElement | undefined = $state();
    let listEl: HTMLDivElement | undefined = $state();
    let query = $state("");
    // -1 means "no row highlighted yet" — the first ↑/↓ inside the palette
    // sets it. Enter on an unhighlighted palette picks the first row anyway.
    let activeIdx = $state(-1);

    /**
     * derive the "effective" mode + the user-visible filter portion of the input
     * after stripping a leading `>`, `@`, or `#`. those prefixes override the
     * mode prop. `#` is people-only and signals "lookup by id" so a miss surfaces
     * a distinct empty-state message rather than the generic "no matches".
     */
    interface View {
        effectiveMode: Mode;
        peopleOnly: boolean;
        idLookup: boolean;
        q: string;
    }
    const view = $derived.by<View>(() => {
        const raw = query;
        if (raw.startsWith(">")) {
            return {
                effectiveMode: "commands",
                peopleOnly: false,
                idLookup: false,
                q: raw.slice(1).trim(),
            };
        }
        if (raw.startsWith("@")) {
            return {
                effectiveMode: "anything",
                peopleOnly: true,
                idLookup: false,
                q: raw.slice(1).trim(),
            };
        }
        if (raw.startsWith("#")) {
            return {
                effectiveMode: "anything",
                peopleOnly: true,
                idLookup: true,
                q: raw.slice(1).trim(),
            };
        }
        return { effectiveMode: mode, peopleOnly: false, idLookup: false, q: raw.trim() };
    });

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

    // a 3+ char run of [A-Z0-9] looks like a person id. used to short-circuit
    // a bare query into an id lookup when the name search would return nothing.
    const ID_SHAPE = /^[A-Z0-9]{3,}$/;

    const rows = $derived.by<Row[]>(() => {
        const v = view;
        const limit = 50;
        const personItems = items.filter((i) => i.kind === "person");
        const commandItems = items.filter((i) => i.kind === "command");

        const findById = (q: string): PaletteItem | undefined =>
            personItems.find((i) => i.id.toUpperCase() === q.toUpperCase());

        const directId = v.idLookup
            ? findById(v.q)
            : v.q && ID_SHAPE.test(v.q.toUpperCase())
              ? findById(v.q)
              : undefined;

        const wantPeople = v.effectiveMode === "anything";
        const wantCommands =
            v.effectiveMode === "commands" || (v.effectiveMode === "anything" && !v.peopleOnly);

        const personRows: Row[] = [];
        const commandRows: Row[] = [];

        if (wantPeople || v.peopleOnly) {
            for (const item of personItems) {
                if (directId && item.id === directId.id) continue;
                const score = fuzzyScore(item.label, v.q);
                if (v.q && score === 0) continue;
                personRows.push({ item, score, enabled: true });
            }
            personRows.sort(
                (a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label),
            );
            if (directId) {
                personRows.unshift({ item: directId, score: 200, enabled: true });
            }
        }

        if (wantCommands && !v.peopleOnly) {
            for (const item of commandItems) {
                const score = fuzzyScore(item.label, v.q);
                if (v.q && score === 0) continue;
                const enabled = item.enabled ? item.enabled() : true;
                commandRows.push({ item, score, enabled });
            }
            commandRows.sort(
                (a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label),
            );
        }

        // ordering: commands-mode shows commands. anything-mode shows people then commands.
        // people-only (`@`) shows people exclusively.
        let combined: Row[];
        if (v.peopleOnly) combined = personRows;
        else if (v.effectiveMode === "commands") combined = commandRows;
        else combined = [...personRows.slice(0, limit), ...commandRows.slice(0, limit)];

        return combined.slice(0, limit);
    });

    $effect(() => {
        // collapse out-of-range highlight when the row list shrinks
        void rows;
        if (activeIdx >= rows.length) activeIdx = -1;
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
        if (!row.enabled) return;
        onclose();
        row.item.action();
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
            // first ↓ on an unhighlighted palette lands on row 0
            activeIdx = activeIdx < 0 ? 0 : (activeIdx + 1) % rows.length;
            ensureVisible(activeIdx);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (rows.length === 0) return;
            // first ↑ on an unhighlighted palette wraps to the last row
            activeIdx =
                activeIdx < 0 ? rows.length - 1 : (activeIdx - 1 + rows.length) % rows.length;
            ensureVisible(activeIdx);
        } else if (e.key === "Home") {
            e.preventDefault();
            if (rows.length === 0) return;
            activeIdx = 0;
            ensureVisible(activeIdx);
        } else if (e.key === "End") {
            e.preventDefault();
            if (rows.length === 0) return;
            activeIdx = rows.length - 1;
            ensureVisible(activeIdx);
        } else if (e.key === "Enter") {
            e.preventDefault();
            // Enter on an unhighlighted palette picks the top hit (row 0) so
            // typing "save<Enter>" still works without an explicit ↓ first
            const idx = activeIdx < 0 ? 0 : activeIdx;
            const row = rows[idx];
            if (row) pickRow(row);
        }
    }

    function placeholder(): string {
        const v = view;
        if (v.idLookup) return "person id…";
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
                {view.idLookup
                    ? "# id"
                    : view.peopleOnly
                      ? "@ people"
                      : view.effectiveMode === "commands"
                        ? "> commands"
                        : "any"}
            </span>
        </header>

        <div bind:this={listEl} class="max-h-[50vh] overflow-y-auto py-1">
            {#if rows.length === 0}
                <div class="text-fg-muted px-3 py-6 text-center text-xs">
                    {#if view.idLookup && view.q}
                        no person with id {view.q.toUpperCase()}
                    {:else}
                        no matches
                    {/if}
                </div>
            {:else}
                {#each rows as row, i (row.item.kind + ":" + row.item.id)}
                    {@const Icon =
                        row.item.kind === "person" ? User : (row.item.icon ?? CommandIcon)}
                    <button
                        type="button"
                        data-row={i}
                        data-kind={row.item.kind}
                        disabled={!row.enabled}
                        class="hover:bg-canvas group flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none disabled:cursor-not-allowed disabled:opacity-40"
                        class:bg-canvas={i === activeIdx}
                        onmouseenter={() => (activeIdx = i)}
                        onclick={() => pickRow(row)}
                    >
                        <Icon size={14} strokeWidth={2.25} class="text-fg-muted shrink-0" />
                        <span class="flex-1 truncate">{row.item.label}</span>
                        <span class="text-fg-muted flex items-center gap-1 font-mono text-[11px]">
                            {#if row.item.kind === "person"}
                                <Hash size={10} />
                            {/if}
                            {row.item.detail ?? ""}
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
                <kbd class="border-line bg-canvas rounded border px-1 font-mono">#</kbd>
                id
            </span>
        </footer>
    </div>
</div>
