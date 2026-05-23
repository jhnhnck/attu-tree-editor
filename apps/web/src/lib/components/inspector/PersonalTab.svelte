<!--
    FamilyTreeEditor - Inspector "Personal" tab: portrait + identity + dates
    auto-commits on blur / change; no Save/Cancel buttons.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { HaracalndeDateData } from "$lib/date/HaracalndeDate";
    import type { AssignedAtBirth, GenderStruct, Origin, Person } from "$lib/domain/types";
    import type { PersonPatch } from "$lib/domain/tree";
    import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";
    import {
        getAssignedAtBirth,
        getFluid,
        getIdentity,
        getInferredAssignedAtBirth,
        getPronouns,
        isAssignedAtBirthInferred,
        toGenderStruct,
    } from "$lib/domain/personIdentity";
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
    function commitIdentity(identity: string): void {
        if (identity === getIdentity(person)) return;
        const next: GenderStruct = { ...toGenderStruct(person.gender), identity };
        onpatch({ gender: next });
    }
    function commitPronouns(value: string): void {
        const trimmed = value.trim();
        const current = getPronouns(person) ?? "";
        if (trimmed === current) return;
        const struct = toGenderStruct(person.gender);
        const next: GenderStruct = { ...struct };
        if (trimmed.length > 0) next.pronouns = trimmed;
        else delete next.pronouns;
        onpatch({ gender: next });
    }
    function commitAssignedAtBirth(value: string): void {
        const aab = value === "" ? undefined : (value as AssignedAtBirth);
        if (aab === getAssignedAtBirth(person)) return;
        const struct = toGenderStruct(person.gender);
        const next: GenderStruct = { ...struct };
        if (aab !== undefined) next.assignedAtBirth = aab;
        else delete next.assignedAtBirth;
        onpatch({ gender: next });
    }
    function commitFluid(value: boolean): void {
        if (value === getFluid(person)) return;
        const struct = toGenderStruct(person.gender);
        const next: GenderStruct = { ...struct };
        if (value) next.fluid = true;
        else delete next.fluid;
        onpatch({ gender: next });
    }
    function commitSpecies(value: string): void {
        const trimmed = value.trim();
        const current = person.species ?? "";
        if (trimmed === current) return;
        onpatch({ species: trimmed.length > 0 ? trimmed : undefined });
    }
    function commitKind(value: string): void {
        const trimmed = value.trim();
        if (trimmed === (person.kind ?? "")) return;
        onpatch({ kind: trimmed.length > 0 ? trimmed : undefined });
    }
    function commitOriginKind(value: string): void {
        const trimmed = value.trim();
        const currentKind = person.origin?.kind ?? "";
        if (trimmed === currentKind) return;
        if (trimmed.length === 0) {
            onpatch({ origin: undefined });
        } else {
            const next: Origin = { kind: trimmed };
            if (person.origin?.cause !== undefined) next.cause = person.origin.cause;
            if (person.origin?.date !== undefined) next.date = person.origin.date;
            onpatch({ origin: next });
        }
    }
    function commitOriginCause(value: string): void {
        const trimmed = value.trim();
        const currentCause = person.origin?.cause ?? "";
        if (trimmed === currentCause) return;
        const base = person.origin;
        if (!base) {
            // no kind set yet — cause without kind is meaningless; drop
            return;
        }
        const next: Origin = { ...base };
        if (trimmed.length > 0) next.cause = trimmed;
        else delete next.cause;
        onpatch({ origin: next });
    }
    function commitBirth(v: HaracalndeDateData | undefined): void {
        onpatch({ birth: v });
    }
    function commitDeath(v: HaracalndeDateData | undefined): void {
        onpatch({ death: v });
    }
    function commitBirthOrder(value: string): void {
        const trimmed = value.trim();
        if (trimmed === "") {
            if (person.birthOrder !== undefined) onpatch({ birthOrder: undefined });
            return;
        }
        const n = Number.parseInt(trimmed, 10);
        if (!Number.isFinite(n) || n < 1) return;
        if (n === person.birthOrder) return;
        onpatch({ birthOrder: n });
    }
    function commitPortrait(blobId: string | undefined): void {
        onpatch({ portraitBlobId: blobId });
    }

    const inputCls =
        "bg-canvas border-line text-fg focus:border-accent focus:ring-accent w-full rounded-md border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none";

    // identity dropdown presets; users can type any string for fictional cases.
    const IDENTITY_PRESETS = ["male", "female", "unknown", "non-binary", "agender", "fluid"];

    let identity = $derived(getIdentity(person));
    let pronouns = $derived(getPronouns(person) ?? "");
    let assignedAtBirth = $derived(getAssignedAtBirth(person));
    let aabInferred = $derived(isAssignedAtBirthInferred(person));
    let aabInferredValue = $derived(getInferredAssignedAtBirth(person));
    let fluid = $derived(getFluid(person));
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
        <Field label="gender identity" for_="ip-identity">
            {#snippet children()}
                <input
                    id="ip-identity"
                    type="text"
                    list="ip-identity-presets"
                    value={identity}
                    onblur={(e: Event & { currentTarget: HTMLInputElement }) =>
                        commitIdentity(e.currentTarget.value)}
                    class={inputCls}
                />
                <datalist id="ip-identity-presets">
                    {#each IDENTITY_PRESETS as preset (preset)}
                        <option value={preset}></option>
                    {/each}
                </datalist>
            {/snippet}
        </Field>
        <Field label="pronouns" for_="ip-pronouns">
            {#snippet children()}
                <input
                    id="ip-pronouns"
                    type="text"
                    value={pronouns}
                    placeholder="e.g. she/her, they/them"
                    onblur={(e: Event & { currentTarget: HTMLInputElement }) =>
                        commitPronouns(e.currentTarget.value)}
                    class={inputCls}
                />
            {/snippet}
        </Field>
        <Field label="assigned at birth{aabInferred ? ' (inferred)' : ''}" for_="ip-aab">
            {#snippet children()}
                <select
                    id="ip-aab"
                    value={assignedAtBirth ?? ""}
                    onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                        commitAssignedAtBirth(e.currentTarget.value)}
                    class={inputCls}
                >
                    <option value=""
                        >({aabInferredValue.toLowerCase()} — inferred from identity)</option
                    >
                    <option value="AMAB">AMAB</option>
                    <option value="AFAB">AFAB</option>
                    <option value="UAAB">UAAB</option>
                </select>
            {/snippet}
        </Field>
        <label class="text-fg-muted flex items-center gap-2 text-sm">
            <input
                type="checkbox"
                checked={fluid}
                onchange={(e: Event & { currentTarget: HTMLInputElement }) =>
                    commitFluid(e.currentTarget.checked)}
            />
            fluid identity
        </label>
    </section>

    <section class="space-y-2">
        <h3 class="text-fg-muted text-[10px] font-semibold tracking-widest uppercase">nature</h3>
        <Field label="species" for_="ip-species">
            {#snippet children()}
                <input
                    id="ip-species"
                    type="text"
                    value={person.species ?? ""}
                    placeholder="e.g. human, dragon, chimera"
                    onblur={(e: Event & { currentTarget: HTMLInputElement }) =>
                        commitSpecies(e.currentTarget.value)}
                    class={inputCls}
                />
            {/snippet}
        </Field>
        <Field label="kind" for_="ip-kind">
            {#snippet children()}
                <input
                    id="ip-kind"
                    type="text"
                    list="ip-kind-presets"
                    value={person.kind ?? ""}
                    placeholder="biological, mechanical, spirit, ..."
                    onblur={(e: Event & { currentTarget: HTMLInputElement }) =>
                        commitKind(e.currentTarget.value)}
                    class={inputCls}
                />
                <datalist id="ip-kind-presets">
                    <option value="biological"></option>
                    <option value="mechanical"></option>
                    <option value="spirit"></option>
                    <option value="collective"></option>
                    <option value="concept"></option>
                </datalist>
            {/snippet}
        </Field>
        <Field label="origin" for_="ip-origin-kind">
            {#snippet children()}
                <input
                    id="ip-origin-kind"
                    type="text"
                    list="ip-origin-presets"
                    value={person.origin?.kind ?? ""}
                    placeholder="born, cloned, summoned, ..."
                    onblur={(e: Event & { currentTarget: HTMLInputElement }) =>
                        commitOriginKind(e.currentTarget.value)}
                    class={inputCls}
                />
                <datalist id="ip-origin-presets">
                    <option value="born"></option>
                    <option value="cloned"></option>
                    <option value="hatched"></option>
                    <option value="summoned"></option>
                    <option value="awoken"></option>
                    <option value="manufactured"></option>
                </datalist>
            {/snippet}
        </Field>
        {#if person.origin?.kind !== undefined}
            <Field label="origin cause" for_="ip-origin-cause">
                {#snippet children()}
                    <input
                        id="ip-origin-cause"
                        type="text"
                        value={person.origin?.cause ?? ""}
                        placeholder="e.g. ritual of binding"
                        onblur={(e: Event & { currentTarget: HTMLInputElement }) =>
                            commitOriginCause(e.currentTarget.value)}
                        class={inputCls}
                    />
                {/snippet}
            </Field>
        {/if}
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
        <Field label="birth order" for_="ip-birth-order">
            {#snippet children()}
                <input
                    id="ip-birth-order"
                    type="number"
                    min="1"
                    step="1"
                    value={person.birthOrder ?? ""}
                    placeholder="position within sibship (twins, triplets, ...)"
                    onblur={(e: Event & { currentTarget: HTMLInputElement }) =>
                        commitBirthOrder(e.currentTarget.value)}
                    class={inputCls}
                />
            {/snippet}
        </Field>
    </section>
</div>
