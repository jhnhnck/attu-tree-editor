<!--
    FamilyTreeEditor - <dialog>-based editor panel for a single Person
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { HaracalndeDateData } from "$lib/date/HaracalndeDate";
    import type { Gender, Person } from "$lib/domain/types";
    import Button from "$lib/components/ui/Button.svelte";
    import Field from "$lib/components/form/Field.svelte";
    import DateInput from "$lib/components/form/DateInput.svelte";

    interface Props {
        person: Person | undefined;
        onsave: (id: string, patch: Partial<Person>) => void;
        onclose: () => void;
    }

    let { person, onsave, onclose }: Props = $props();

    let dialogEl: HTMLDialogElement | undefined = $state();

    let given = $state("");
    let surname = $state("");
    let title = $state("");
    let gender = $state<Gender>("u");
    let birth = $state<HaracalndeDateData | undefined>(undefined);
    let death = $state<HaracalndeDateData | undefined>(undefined);
    let occupation = $state("");
    let location = $state("");
    let display = $state<"z0" | "z1">("z1");

    $effect.pre(() => {
        if (!person) return;
        given = person.given;
        surname = person.surname;
        title = person.title ?? "";
        gender = person.gender;
        birth = person.birth;
        death = person.death;
        occupation = person.occupation ?? "";
        location = person.location ?? "";
        display = person.display;
    });

    $effect(() => {
        if (!dialogEl) return;
        if (person && !dialogEl.open) dialogEl.showModal();
        if (!person && dialogEl.open) dialogEl.close();
    });

    function save(): void {
        if (!person) return;
        const patch: Partial<Person> = {
            given: given.trim(),
            surname: surname.trim(),
            gender,
            display,
        };
        setOptional(patch, "title", title.trim() || undefined);
        setOptional(patch, "occupation", occupation.trim() || undefined);
        setOptional(patch, "location", location.trim() || undefined);
        setOptional(patch, "birth", birth);
        setOptional(patch, "death", death);
        onsave(person.id, patch);
        onclose();
    }

    function setOptional<K extends keyof Person>(
        target: Partial<Person>,
        key: K,
        value: Person[K] | undefined,
    ): void {
        if (value === undefined) {
            delete target[key];
        } else {
            target[key] = value;
        }
    }

    let displayName = $derived([given, surname].filter(Boolean).join(" ").trim() || "(unnamed)");

    const inputCls =
        "bg-canvas border-line text-fg focus:border-accent focus:ring-accent w-full rounded-md border px-3 py-2 text-sm focus:ring-1 focus:outline-none";
</script>

<dialog
    bind:this={dialogEl}
    onclose={() => onclose()}
    aria-labelledby="editor-title"
    class="editor-dialog"
>
    {#if person}
        <form
            method="dialog"
            class="flex max-h-[85vh] flex-col"
            onsubmit={(e) => {
                e.preventDefault();
                save();
            }}
        >
            <header class="border-line flex items-center justify-between border-b px-5 py-3">
                <div class="flex flex-col">
                    <h2 id="editor-title" class="text-fg text-base font-semibold tracking-tight">
                        {displayName}
                    </h2>
                    <span class="text-fg-muted font-mono text-[11px]">id {person.id}</span>
                </div>
                <button
                    type="button"
                    aria-label="close"
                    onclick={() => onclose()}
                    class="text-fg-muted hover:text-fg text-lg leading-none"
                >
                    ×
                </button>
            </header>

            <div class="flex-1 overflow-y-auto px-5 py-4">
                <section class="space-y-3">
                    <h3 class="text-fg-muted text-[10px] font-semibold tracking-widest uppercase">
                        identity
                    </h3>
                    <div class="grid grid-cols-2 gap-3">
                        <Field label="given" for_="ed-given">
                            {#snippet children()}
                                <input
                                    id="ed-given"
                                    type="text"
                                    bind:value={given}
                                    class={inputCls}
                                />
                            {/snippet}
                        </Field>
                        <Field label="surname" for_="ed-surname">
                            {#snippet children()}
                                <input
                                    id="ed-surname"
                                    type="text"
                                    bind:value={surname}
                                    class={inputCls}
                                />
                            {/snippet}
                        </Field>
                    </div>
                    <Field label="title" for_="ed-title">
                        {#snippet children()}
                            <input id="ed-title" type="text" bind:value={title} class={inputCls} />
                        {/snippet}
                    </Field>
                    <div class="grid grid-cols-2 gap-3">
                        <Field label="gender" for_="ed-gender">
                            {#snippet children()}
                                <select id="ed-gender" bind:value={gender} class={inputCls}>
                                    <option value="m">male</option>
                                    <option value="f">female</option>
                                    <option value="u">unspecified</option>
                                </select>
                            {/snippet}
                        </Field>
                        <Field label="display" for_="ed-display">
                            {#snippet children()}
                                <select id="ed-display" bind:value={display} class={inputCls}>
                                    <option value="z1">normal</option>
                                    <option value="z0">faded (z0)</option>
                                </select>
                            {/snippet}
                        </Field>
                    </div>
                </section>

                <section class="mt-5 space-y-3">
                    <h3 class="text-fg-muted text-[10px] font-semibold tracking-widest uppercase">
                        dates
                    </h3>
                    <div class="grid grid-cols-2 gap-3">
                        <Field label="birth" for_="ed-birth">
                            {#snippet children()}
                                <DateInput
                                    id="ed-birth"
                                    value={birth}
                                    onchange={(v: HaracalndeDateData | undefined) => (birth = v)}
                                />
                            {/snippet}
                        </Field>
                        <Field label="death" for_="ed-death">
                            {#snippet children()}
                                <DateInput
                                    id="ed-death"
                                    value={death}
                                    onchange={(v: HaracalndeDateData | undefined) => (death = v)}
                                />
                            {/snippet}
                        </Field>
                    </div>
                </section>

                <section class="mt-5 space-y-3">
                    <h3 class="text-fg-muted text-[10px] font-semibold tracking-widest uppercase">
                        details
                    </h3>
                    <Field label="occupation" for_="ed-occ">
                        {#snippet children()}
                            <input
                                id="ed-occ"
                                type="text"
                                bind:value={occupation}
                                class={inputCls}
                            />
                        {/snippet}
                    </Field>
                    <Field label="location" for_="ed-loc">
                        {#snippet children()}
                            <input id="ed-loc" type="text" bind:value={location} class={inputCls} />
                        {/snippet}
                    </Field>
                </section>
            </div>

            <footer class="border-line bg-canvas-elev flex justify-end gap-2 border-t px-5 py-3">
                <Button type="button" variant="ghost" onclick={() => onclose()}>
                    {#snippet children()}cancel{/snippet}
                </Button>
                <Button type="submit" variant="primary">
                    {#snippet children()}save{/snippet}
                </Button>
            </footer>
        </form>
    {/if}
</dialog>

<style>
    .editor-dialog {
        width: min(32rem, calc(100vw - 2rem));
        max-height: calc(100vh - 2rem);
        margin: auto; /* belt-and-braces centering for older browsers */
        padding: 0;
        border: 1px solid var(--color-line);
        border-radius: 0.75rem;
        background: var(--color-canvas-elev);
        color: var(--color-fg);
        box-shadow:
            0 25px 50px -12px rgb(0 0 0 / 0.5),
            0 0 0 1px var(--color-line);
        overflow: hidden;
    }
    .editor-dialog::backdrop {
        background: rgb(0 0 0 / 0.55);
        backdrop-filter: blur(2px);
    }
</style>
