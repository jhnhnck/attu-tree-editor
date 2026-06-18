<!--
    FamilyTreeEditor - floating popover that picks a Person by name
    or creates a new blank one. Used by the Connections tab to set
    parents / partners / children.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { Plus, Search, X } from "@lucide/svelte";
    import type { Person, PersonId } from "$lib/domain/types";

    interface Props {
        /** all people in the tree, the chooser filters by name */
        people: readonly Person[];
        /** ids that should be hidden from the list (e.g. self, current spouses) */
        excludeIds?: readonly PersonId[];
        title: string;
        onpick: (id: PersonId) => void;
        oncreate: () => void;
        onclose: () => void;
    }

    let { people, excludeIds = [], title, onpick, oncreate, onclose }: Props = $props();

    let query = $state("");
    let inputEl: HTMLInputElement | undefined = $state();
    let containerEl: HTMLDivElement | undefined = $state();
    let activeIdx = $state(0);

    let exclude = $derived(new Set(excludeIds));

    let matches = $derived.by(() => {
        const q = query.trim().toLowerCase();
        const filtered = people.filter((p) => !exclude.has(p.id));
        if (!q) {
            return filtered
                .slice()
                .sort((a, b) => fullName(a).localeCompare(fullName(b)))
                .slice(0, 50);
        }
        return filtered
            .map((p) => ({ p, score: matchScore(p, q) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 50)
            .map((x) => x.p);
    });

    function fullName(p: Person): string {
        return [p.given, p.surname].filter(Boolean).join(" ").trim() || "(unnamed)";
    }

    function matchScore(p: Person, q: string): number {
        const name = fullName(p).toLowerCase();
        if (name.startsWith(q)) return 3;
        if (name.includes(` ${q}`)) return 2;
        if (name.includes(q)) return 1;
        return 0;
    }

    onMount(() => {
        void tick().then(() => inputEl?.focus());
        window.addEventListener("pointerdown", onWindowDown, true);
        window.addEventListener("keydown", onWindowKey);
    });
    onDestroy(() => {
        window.removeEventListener("pointerdown", onWindowDown, true);
        window.removeEventListener("keydown", onWindowKey);
    });

    function onWindowDown(e: PointerEvent): void {
        if (!containerEl) return;
        if (e.target instanceof Node && containerEl.contains(e.target)) return;
        onclose();
    }
    function onWindowKey(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.preventDefault();
            onclose();
        }
    }

    function onInputKey(e: KeyboardEvent): void {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            activeIdx = Math.min(activeIdx + 1, matches.length - 1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            activeIdx = Math.max(activeIdx - 1, 0);
        } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = matches[activeIdx];
            if (pick) onpick(pick.id);
        }
    }

    function dates(p: Person): string {
        const b = p.birth?.year;
        const d = p.death?.year;
        if (b && d) return `${String(b)}–${String(d)}`;
        if (b) return `b. ${String(b)}`;
        if (d) return `d. ${String(d)}`;
        return "";
    }
</script>

<div
    bind:this={containerEl}
    class="bg-canvas-elev border-line absolute right-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-md border shadow-xl"
    role="dialog"
    aria-label={title}
>
    <header class="border-line flex items-center gap-2 border-b px-3 py-2">
        <Search size={12} class="text-fg-muted" />
        <span class="text-fg text-xs font-semibold">{title}</span>
        <button
            type="button"
            class="text-fg-muted hover:text-fg ml-auto flex h-5 w-5 items-center justify-center rounded"
            aria-label="close"
            onclick={onclose}
        >
            <X size={12} />
        </button>
    </header>

    <div class="border-line border-b px-2 py-2">
        <input
            bind:this={inputEl}
            type="text"
            placeholder="search by name…"
            bind:value={query}
            onkeydown={onInputKey}
            oninput={() => (activeIdx = 0)}
            class="bg-canvas border-line text-fg focus:border-accent focus:ring-accent w-full rounded-md border px-2 py-1 text-sm focus:ring-1 focus:outline-none"
            aria-label="search people"
        />
    </div>

    <ul class="max-h-64 overflow-y-auto">
        {#if matches.length === 0}
            <li class="text-fg-muted px-3 py-4 text-center text-xs">no matches</li>
        {:else}
            {#each matches as p, i (p.id)}
                <li>
                    <button
                        type="button"
                        class="hover:bg-canvas/60 flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                        class:bg-canvas={i === activeIdx}
                        onmouseenter={() => (activeIdx = i)}
                        onclick={() => onpick(p.id)}
                    >
                        <span class="flex-1 truncate">{fullName(p)}</span>
                        <span class="text-fg-muted shrink-0 font-mono text-[10px]">
                            {dates(p)}
                        </span>
                    </button>
                </li>
            {/each}
        {/if}
    </ul>

    <footer class="border-line border-t">
        <button
            type="button"
            class="text-accent hover:bg-canvas/60 flex w-full items-center gap-2 px-3 py-2 text-sm"
            onclick={oncreate}
        >
            <Plus size={14} />
            create new person
        </button>
    </footer>
</div>
