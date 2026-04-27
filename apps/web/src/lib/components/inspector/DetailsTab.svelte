<!--
    FamilyTreeEditor - Inspector "Details" tab: occupation, location, wiki title.
    auto-commits on blur.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { ExternalLink } from "@lucide/svelte";
    import type { Person } from "$lib/domain/types";
    import type { PersonPatch } from "$lib/domain/tree";
    import { wikiUrlFor } from "$lib/wiki/linkResolver";
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
                <input
                    id="id-wiki"
                    type="text"
                    bind:value={wikiTitle}
                    onblur={commitWikiTitle}
                    placeholder="page title"
                    class={inputCls}
                />
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
