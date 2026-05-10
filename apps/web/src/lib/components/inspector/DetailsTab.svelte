<!--
    FamilyTreeEditor - Inspector "Details" tab: occupation, location, wiki title.
    auto-commits on blur.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { ExternalLink } from "@lucide/svelte";
    import type { Person } from "$lib/domain/types";
    import type { PersonPatch } from "$lib/domain/tree";
    import { wikiUrlFor, wikiOpenSearch } from "$lib/wiki/linkResolver";
    import Field from "$lib/components/form/Field.svelte";

    interface Props {
        person: Person;
        onpatch: (patch: PersonPatch) => void;
    }

    let { person, onpatch }: Props = $props();

    let occupation = $state("");
    let location = $state("");
    let wikiTitle = $state("");
    let lastSyncedId = $state<string | undefined>();

    $effect.pre(() => {
        if (person.id !== lastSyncedId) {
            occupation = person.occupation ?? "";
            location = person.location ?? "";
            wikiTitle = person.wikiTitle ?? "";
            lastSyncedId = person.id;
        }
    });

    function commitOccupation(): void {
        const next = occupation.trim();
        const cur = person.occupation ?? "";
        if (next !== cur) onpatch({ occupation: next || undefined });
    }
    function commitLocation(): void {
        const next = location.trim();
        const cur = person.location ?? "";
        if (next !== cur) onpatch({ location: next || undefined });
    }
    function commitWikiTitle(): void {
        const next = wikiTitle.trim();
        const cur = person.wikiTitle ?? "";
        if (next !== cur) onpatch({ wikiTitle: next || undefined });
    }
    function commitDisplay(d: "z0" | "z1"): void {
        if (d !== person.display) onpatch({ display: d });
    }

    let wikiHref = $derived(wikiUrlFor(wikiTitle));

    // wiki title autocomplete
    let suggestions = $state<string[]>([]);
    let showSuggestions = $state(false);
    let activeSuggIdx = $state(-1);
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let abortCtrl: AbortController | undefined;

    function onWikiInput(): void {
        clearTimeout(debounceTimer);
        activeSuggIdx = -1;
        showSuggestions = true;
        debounceTimer = setTimeout(() => {
            abortCtrl?.abort();
            abortCtrl = new AbortController();
            void wikiOpenSearch(wikiTitle, abortCtrl.signal).then((s) => {
                suggestions = s;
            });
        }, 200);
    }

    function pickSuggestion(s: string): void {
        wikiTitle = s;
        suggestions = [];
        showSuggestions = false;
        activeSuggIdx = -1;
        const next = s.trim();
        const cur = person.wikiTitle ?? "";
        if (next !== cur) onpatch({ wikiTitle: next || undefined });
    }

    function onWikiKeyDown(e: KeyboardEvent): void {
        if (!showSuggestions || suggestions.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            activeSuggIdx = Math.min(activeSuggIdx + 1, suggestions.length - 1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            activeSuggIdx = Math.max(activeSuggIdx - 1, -1);
        } else if (e.key === "Enter" && activeSuggIdx >= 0) {
            e.preventDefault();
            pickSuggestion(suggestions[activeSuggIdx]!);
        } else if (e.key === "Escape") {
            showSuggestions = false;
            activeSuggIdx = -1;
        }
    }

    function onWikiBlur(): void {
        // delay so a mousedown on a suggestion fires before blur hides the list
        setTimeout(() => {
            showSuggestions = false;
        }, 150);
        commitWikiTitle();
    }

    const inputCls =
        "bg-canvas border-line text-fg focus:border-accent focus:ring-accent w-full rounded-md border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none";
</script>

<div class="space-y-3 px-4 py-3">
    <Field label="occupation" for_="id-occ">
        {#snippet children()}
            <input
                id="id-occ"
                type="text"
                bind:value={occupation}
                onblur={commitOccupation}
                class={inputCls}
            />
        {/snippet}
    </Field>
    <Field label="location" for_="id-loc">
        {#snippet children()}
            <input
                id="id-loc"
                type="text"
                bind:value={location}
                onblur={commitLocation}
                class={inputCls}
            />
        {/snippet}
    </Field>
    <Field label="wiki title" for_="id-wiki" hint="opens this title on the wiki">
        {#snippet children()}
            <div class="flex gap-2">
                <div class="relative min-w-0 flex-1">
                    <input
                        id="id-wiki"
                        type="text"
                        bind:value={wikiTitle}
                        oninput={onWikiInput}
                        onblur={onWikiBlur}
                        onkeydown={onWikiKeyDown}
                        placeholder="page title"
                        autocomplete="off"
                        class={inputCls}
                    />
                    {#if showSuggestions && suggestions.length > 0}
                        <div
                            class="bg-canvas-elev border-line absolute left-0 top-full z-10 mt-0.5 w-full overflow-hidden rounded-md border shadow-lg"
                            role="listbox"
                            aria-label="wiki title suggestions"
                        >
                            {#each suggestions as s, i (s)}
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={i === activeSuggIdx}
                                    class="w-full truncate px-3 py-1 text-left text-sm"
                                    class:bg-canvas={i === activeSuggIdx}
                                    class:text-accent={i === activeSuggIdx}
                                    class:text-fg={i !== activeSuggIdx}
                                    class:hover:bg-canvas={i !== activeSuggIdx}
                                    onmousedown={(e) => {
                                        e.preventDefault();
                                        pickSuggestion(s);
                                    }}
                                >
                                    {s}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
                {#if wikiHref}
                    <a
                        href={wikiHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="bg-canvas border-line text-fg hover:border-accent hover:text-accent inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1.5 text-xs"
                        aria-label="open wiki page"
                    >
                        view <ExternalLink size={12} />
                    </a>
                {/if}
            </div>
        {/snippet}
    </Field>
    <Field label="display" for_="id-display" hint="faded cards render dimmed on the canvas">
        {#snippet children()}
            <select
                id="id-display"
                value={person.display}
                onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                    commitDisplay(e.currentTarget.value as "z0" | "z1")}
                class={inputCls}
            >
                <option value="z1">normal</option>
                <option value="z0">faded</option>
            </select>
        {/snippet}
    </Field>
</div>
