<!--
    FamilyTreeEditor - Inspector "Personal" tab: portrait + identity + dates
    auto-commits on blur / change; no Save/Cancel buttons.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { HaracalndeDateData } from "$lib/date/HaracalndeDate";
    import type { Gender, Person } from "$lib/domain/types";
    import type { PersonPatch } from "$lib/domain/tree";
    import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";
    import Field from "$lib/components/form/Field.svelte";
    import DateInput from "$lib/components/form/DateInput.svelte";
    import PortraitField from "$lib/components/editor/PortraitField.svelte";

    interface Props {
        person: Person;
        treeId: string;
        portraitUrls: PortraitUrlCache;
        onpatch: (patch: PersonPatch) => void;
        onerror?: ((msg: string) => void) | undefined;
    }

    let { person, treeId, portraitUrls, onpatch, onerror }: Props = $props();

    // local state mirrors the person; reseeded only when the person id changes
    // so that in-flight typing isn't clobbered by autosave round-trips.
    let given = $state("");
    let surname = $state("");
    let title = $state("");
    let lastSyncedId = $state<string | undefined>();

    $effect.pre(() => {
        if (person.id !== lastSyncedId) {
            given = person.given;
            surname = person.surname;
            title = person.title ?? "";
            lastSyncedId = person.id;
        }
    });

    function commitGiven(): void {
        const next = given.trim();
        if (next !== person.given) onpatch({ given: next });
    }
    function commitSurname(): void {
        const next = surname.trim();
        if (next !== person.surname) onpatch({ surname: next });
    }
    function commitTitle(): void {
        const next = title.trim();
        if ((next || undefined) !== person.title) {
            onpatch({ title: next || undefined });
        }
    }
    function commitGender(g: Gender): void {
        if (g !== person.gender) onpatch({ gender: g });
    }
    function commitBirth(v: HaracalndeDateData | undefined): void {
        onpatch({ birth: v });
    }
    function commitDeath(v: HaracalndeDateData | undefined): void {
        onpatch({ death: v });
    }
    function commitPortrait(blobId: string | undefined): void {
        onpatch({ portraitBlobId: blobId });
    }

    const inputCls =
        "bg-canvas border-line text-fg focus:border-accent focus:ring-accent w-full rounded-md border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none";
</script>

<div class="space-y-5 px-4 py-3">
    <section class="space-y-2">
        <h3 class="text-fg-muted text-[10px] font-semibold tracking-widest uppercase">portrait</h3>
        <PortraitField
            {treeId}
            personId={person.id}
            currentBlobId={person.portraitBlobId}
            {portraitUrls}
            onchange={commitPortrait}
            onerror={(msg: string) => onerror?.(msg)}
        />
    </section>

    <section class="space-y-2">
        <h3 class="text-fg-muted text-[10px] font-semibold tracking-widest uppercase">identity</h3>
        <div class="grid grid-cols-2 gap-2">
            <Field label="given" for_="ip-given">
                {#snippet children()}
                    <input
                        id="ip-given"
                        type="text"
                        bind:value={given}
                        onblur={commitGiven}
                        class={inputCls}
                    />
                {/snippet}
            </Field>
            <Field label="surname" for_="ip-surname">
                {#snippet children()}
                    <input
                        id="ip-surname"
                        type="text"
                        bind:value={surname}
                        onblur={commitSurname}
                        class={inputCls}
                    />
                {/snippet}
            </Field>
        </div>
        <Field label="title" for_="ip-title">
            {#snippet children()}
                <input
                    id="ip-title"
                    type="text"
                    bind:value={title}
                    onblur={commitTitle}
                    class={inputCls}
                />
            {/snippet}
        </Field>
        <Field label="gender" for_="ip-gender">
            {#snippet children()}
                <select
                    id="ip-gender"
                    value={person.gender}
                    onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                        commitGender(e.currentTarget.value as Gender)}
                    class={inputCls}
                >
                    <option value="m">male</option>
                    <option value="f">female</option>
                    <option value="u">unspecified</option>
                </select>
            {/snippet}
        </Field>
    </section>

    <section class="space-y-2">
        <h3 class="text-fg-muted text-[10px] font-semibold tracking-widest uppercase">dates</h3>
        <div class="grid grid-cols-2 gap-2">
            <Field label="birth" for_="ip-birth">
                {#snippet children()}
                    <DateInput id="ip-birth" value={person.birth} onchange={commitBirth} />
                {/snippet}
            </Field>
            <Field label="death" for_="ip-death">
                {#snippet children()}
                    <DateInput id="ip-death" value={person.death} onchange={commitDeath} />
                {/snippet}
            </Field>
        </div>
    </section>
</div>
