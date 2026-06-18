<!--
    FamilyTreeEditor - Inspector "Sibship" tab: CRUD for
    tree.sibshipDecorators[]. person-centric view of twin / triplet /
    clone-batch / litter brackets the selected person belongs to.
    relationship-vocabulary plan phase 8 (ship polish; added after
    phase 6b closed).
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { Plus, Trash2, X } from "@lucide/svelte";
    import type { Person, PersonId, SibshipDecorator, SibshipKind, Tree } from "$lib/domain/types";
    import type { SibshipPatch } from "$lib/domain/tree";
    import PersonChooser from "./PersonChooser.svelte";

    interface Props {
        tree: Tree;
        person: Person;
        onaddSibshipDecorator?:
            | ((d: Omit<SibshipDecorator, "id"> & { id?: string }) => void)
            | undefined;
        onremoveSibshipDecorator?: ((id: string) => void) | undefined;
        onpatchSibshipDecorator?: ((id: string, patch: SibshipPatch) => void) | undefined;
        onaddSibshipMember?: ((id: string, personId: PersonId) => void) | undefined;
        onremoveSibshipMember?: ((id: string, personId: PersonId) => void) | undefined;
        onselect?: ((id: PersonId) => void) | undefined;
    }

    let {
        tree,
        person,
        onaddSibshipDecorator,
        onremoveSibshipDecorator,
        onpatchSibshipDecorator,
        onaddSibshipMember,
        onremoveSibshipMember,
        onselect,
    }: Props = $props();

    // 9 canonical sibship kinds; free-form strings are allowed via the
    // domain layer but the create-path picker only offers the canonical
    // set. existing non-canonical kinds round-trip via the select.
    const CANONICAL_KINDS: readonly SibshipKind[] = [
        "twins-MZ",
        "twins-DZ",
        "twins-?",
        "triplets-MZ",
        "triplets-DZ",
        "triplets-?",
        "clone-batch",
        "litter",
        "spawned-together",
    ];

    const myDecorators = $derived.by<readonly SibshipDecorator[]>(() => {
        const list = tree.sibshipDecorators ?? [];
        const mine = list.filter((d) => d.sibIds.includes(person.id));
        return mine.slice().sort((a, b) => a.kind.localeCompare(b.kind));
    });

    type ChooserSlot = { kind: "add-member"; decoratorId: string };
    let chooser = $state<ChooserSlot | undefined>(undefined);

    let creatingKind = $state<SibshipKind>("twins-MZ");

    function nameOf(id: PersonId): string {
        const p = tree.people[id];
        if (!p) return id;
        return [p.given, p.surname].filter(Boolean).join(" ").trim() || "(unnamed)";
    }

    function onCreate(): void {
        onaddSibshipDecorator?.({
            kind: creatingKind,
            sibIds: [person.id],
        });
    }

    function onKindChange(
        d: SibshipDecorator,
        e: Event & { currentTarget: HTMLSelectElement },
    ): void {
        onpatchSibshipDecorator?.(d.id, { kind: e.currentTarget.value });
    }

    function onNameBlur(d: SibshipDecorator, e: Event & { currentTarget: HTMLInputElement }): void {
        const v = e.currentTarget.value.trim();
        onpatchSibshipDecorator?.(d.id, { name: v.length > 0 ? v : undefined });
    }

    function onChooserPick(targetId: PersonId): void {
        if (!chooser) return;
        onaddSibshipMember?.(chooser.decoratorId, targetId);
        chooser = undefined;
    }

    function chooserExcludeMembers(d: SibshipDecorator): readonly PersonId[] {
        return d.sibIds;
    }
</script>

<section class="text-fg flex flex-col gap-3 px-3 py-3 text-xs">
    <p class="text-fg-muted text-[11px] italic">
        sibship decorators draw a bracket beneath the shared parent's bus. members must share a
        parent for the bracket to render.
    </p>

    {#if myDecorators.length === 0}
        <p class="text-fg-muted italic">this person isn't in any sibship group yet</p>
    {:else}
        <ul class="flex flex-col gap-2">
            {#each myDecorators as d (d.id)}
                <li class="border-line bg-canvas/50 rounded border p-2">
                    <header class="mb-2 flex items-center gap-2">
                        <select
                            class="border-line bg-canvas-elev text-fg rounded border px-1 py-0.5 text-[11px]"
                            value={d.kind}
                            aria-label="sibship kind"
                            onchange={(e) => onKindChange(d, e)}
                        >
                            {#each CANONICAL_KINDS as k (k)}
                                <option value={k}>{k}</option>
                            {/each}
                            {#if !CANONICAL_KINDS.includes(d.kind)}
                                <option value={d.kind}>{d.kind}</option>
                            {/if}
                        </select>
                        <input
                            type="text"
                            class="border-line bg-canvas-elev text-fg flex-1 rounded border px-1.5 py-0.5"
                            placeholder="optional label"
                            aria-label="sibship label"
                            value={d.name ?? ""}
                            onblur={(e) => onNameBlur(d, e)}
                        />
                        <button
                            type="button"
                            class="text-fg-muted hover:text-danger"
                            aria-label="delete sibship"
                            title="delete this sibship"
                            onclick={() => onremoveSibshipDecorator?.(d.id)}
                        >
                            <Trash2 size={12} />
                        </button>
                    </header>

                    <div class="flex flex-wrap items-center gap-1">
                        <span class="text-fg-muted text-[10px] uppercase tracking-wide"
                            >siblings</span
                        >
                        {#each d.sibIds as sid (sid)}
                            <span
                                class="border-line bg-canvas-elev inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
                            >
                                <button
                                    type="button"
                                    class="hover:text-accent"
                                    onclick={() => onselect?.(sid)}>{nameOf(sid)}</button
                                >
                                <button
                                    type="button"
                                    class="text-fg-muted hover:text-danger"
                                    aria-label="remove sibling"
                                    onclick={() => onremoveSibshipMember?.(d.id, sid)}
                                >
                                    <X size={10} />
                                </button>
                            </span>
                        {/each}
                        <button
                            type="button"
                            class="border-line text-fg-muted hover:border-accent hover:text-accent inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5"
                            onclick={() => (chooser = { kind: "add-member", decoratorId: d.id })}
                            >+ sibling</button
                        >
                    </div>
                </li>
            {/each}
        </ul>
    {/if}

    <!-- create row -->
    <div class="border-line border-t pt-3">
        <div class="text-fg-muted mb-1.5 text-[10px] uppercase tracking-wide">add sibship</div>
        <div class="flex items-center gap-2">
            <select
                class="border-line bg-canvas-elev text-fg rounded border px-1 py-0.5 text-[11px]"
                bind:value={creatingKind}
                aria-label="kind for new sibship"
            >
                {#each CANONICAL_KINDS as k (k)}
                    <option value={k}>{k}</option>
                {/each}
            </select>
            <button
                type="button"
                class="border-line text-fg hover:border-accent hover:text-accent inline-flex items-center gap-1 rounded border px-2 py-0.5"
                onclick={onCreate}
            >
                <Plus size={11} />
                add
            </button>
        </div>
    </div>

    {#if chooser}
        {@const c = chooser}
        {@const d = (tree.sibshipDecorators ?? []).find((x) => x.id === c.decoratorId)}
        <PersonChooser
            people={Object.values(tree.people)}
            excludeIds={d ? chooserExcludeMembers(d) : []}
            title="add sibling"
            onpick={onChooserPick}
            oncreate={() => {
                chooser = undefined;
            }}
            onclose={() => (chooser = undefined)}
        />
    {/if}
</section>
