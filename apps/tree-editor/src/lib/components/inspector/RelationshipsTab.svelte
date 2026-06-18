<!--
    FamilyTreeEditor - Inspector "Relationships" tab: CRUD for tree.relationships[].
    each relationship surfaces kind, source/target chips, optional cause / notes.
    relationship-vocabulary plan phase 4.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { Plus, Trash2, X, ArrowRight } from "@lucide/svelte";
    import type { Person, PersonId, Relationship, RelationshipKind, Tree } from "$lib/domain/types";
    import type { RelationshipPatch } from "$lib/domain/tree";
    import type { HaracalndeDateData } from "@attu/ui";
    import { DateInput } from "@attu/ui";
    import PersonChooser from "./PersonChooser.svelte";

    interface Props {
        tree: Tree;
        person: Person;
        onaddRelationship?: ((rel: Omit<Relationship, "id"> & { id?: string }) => void) | undefined;
        onremoveRelationship?: ((relId: string) => void) | undefined;
        onpatchRelationship?: ((relId: string, patch: RelationshipPatch) => void) | undefined;
        onselect?: ((id: PersonId) => void) | undefined;
    }

    let {
        tree,
        person,
        onaddRelationship,
        onremoveRelationship,
        onpatchRelationship,
        onselect,
    }: Props = $props();

    const KINDS: readonly RelationshipKind[] = [
        "sworn-bond",
        "oath-sibling",
        "blood-brother",
        "master-apprentice",
        "covenant",
        "transformed-from",
        "reincarnated-as",
        "merged-from",
        "split-into",
        "alias-of",
        "severed",
        "estranged",
        "exiled",
        "disowned",
    ];

    // person-centric view: surface every relationship that mentions
    // `person.id` on either side. ordered by kind for stable scanning.
    const myRelationships = $derived.by<readonly Relationship[]>(() => {
        const list = tree.relationships ?? [];
        const mine = list.filter(
            (r) => r.sourceIds.includes(person.id) || r.targetIds.includes(person.id),
        );
        return mine.slice().sort((a, b) => a.kind.localeCompare(b.kind));
    });

    // chooser slot: which relationship + side is currently picking a person
    type ChooserSlot =
        | { kind: "create-target"; relKind: RelationshipKind }
        | { kind: "edit-source"; relId: string }
        | { kind: "edit-target"; relId: string };
    let chooser = $state<ChooserSlot | undefined>(undefined);

    // create panel state — kind picker + waiting-for-target chooser
    let creatingKind = $state<RelationshipKind>("sworn-bond");

    function nameOf(id: PersonId): string {
        const p = tree.people[id];
        if (!p) return id;
        return [p.given, p.surname].filter(Boolean).join(" ").trim() || "(unnamed)";
    }

    function startCreate(): void {
        chooser = { kind: "create-target", relKind: creatingKind };
    }

    function onChooserPick(targetId: PersonId): void {
        if (!chooser) return;
        if (chooser.kind === "create-target") {
            onaddRelationship?.({
                kind: chooser.relKind,
                sourceIds: [person.id],
                targetIds: [targetId],
            });
        } else if (chooser.kind === "edit-source") {
            const relId = chooser.relId;
            const rel = (tree.relationships ?? []).find((r) => r.id === relId);
            if (rel)
                onpatchRelationship?.(rel.id, {
                    sourceIds: [...rel.sourceIds.filter((id) => id !== person.id), targetId],
                });
        } else if (chooser.kind === "edit-target") {
            const relId = chooser.relId;
            const rel = (tree.relationships ?? []).find((r) => r.id === relId);
            if (rel) onpatchRelationship?.(rel.id, { targetIds: [...rel.targetIds, targetId] });
        }
        chooser = undefined;
    }

    function removeSourceChip(rel: Relationship, pid: PersonId): void {
        const next = rel.sourceIds.filter((id) => id !== pid);
        // never let the relationship lose its last endpoint via a chip click
        if (next.length === 0 && rel.targetIds.length === 0) {
            onremoveRelationship?.(rel.id);
            return;
        }
        onpatchRelationship?.(rel.id, { sourceIds: next });
    }

    function removeTargetChip(rel: Relationship, pid: PersonId): void {
        const next = rel.targetIds.filter((id) => id !== pid);
        if (next.length === 0 && rel.sourceIds.length === 0) {
            onremoveRelationship?.(rel.id);
            return;
        }
        onpatchRelationship?.(rel.id, { targetIds: next });
    }

    function onKindChange(
        rel: Relationship,
        e: Event & { currentTarget: HTMLSelectElement },
    ): void {
        const next = e.currentTarget.value as RelationshipKind;
        onpatchRelationship?.(rel.id, { kind: next });
    }

    function onCauseBlur(rel: Relationship, e: Event & { currentTarget: HTMLInputElement }): void {
        const v = e.currentTarget.value.trim();
        onpatchRelationship?.(rel.id, { cause: v.length > 0 ? v : undefined });
    }

    function onNotesBlur(
        rel: Relationship,
        e: Event & { currentTarget: HTMLTextAreaElement },
    ): void {
        const v = e.currentTarget.value.trim();
        onpatchRelationship?.(rel.id, { notes: v.length > 0 ? v : undefined });
    }

    function chooserExcludeForCreate(): readonly PersonId[] {
        // exclude self so users can't create a self-relationship
        return [person.id];
    }

    function chooserExcludeForEdit(
        rel: Relationship,
        side: "source" | "target",
    ): readonly PersonId[] {
        const all = side === "source" ? rel.sourceIds : rel.targetIds;
        return all;
    }
</script>

<section class="text-fg flex flex-col gap-3 px-3 py-3 text-xs">
    <!-- existing relationships involving this person -->
    {#if myRelationships.length === 0}
        <p class="text-fg-muted italic">no relationships defined for this person yet</p>
    {:else}
        <ul class="flex flex-col gap-2">
            {#each myRelationships as rel (rel.id)}
                <li class="border-line bg-canvas/50 rounded border p-2">
                    <header class="mb-2 flex items-center gap-2">
                        <select
                            class="border-line bg-canvas-elev text-fg rounded border px-1 py-0.5 text-[11px]"
                            value={rel.kind}
                            aria-label="relationship kind"
                            onchange={(e) => onKindChange(rel, e)}
                        >
                            {#each KINDS as k (k)}
                                <option value={k}>{k}</option>
                            {/each}
                        </select>
                        <button
                            type="button"
                            class="ml-auto text-fg-muted hover:text-danger"
                            aria-label="delete relationship"
                            title="delete this relationship"
                            onclick={() => onremoveRelationship?.(rel.id)}
                        >
                            <Trash2 size={12} />
                        </button>
                    </header>

                    <!-- source chips -->
                    <div class="mb-1.5 flex flex-wrap items-center gap-1">
                        <span class="text-fg-muted text-[10px] uppercase tracking-wide">from</span>
                        {#each rel.sourceIds as sid (sid)}
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
                                    aria-label="remove from sources"
                                    onclick={() => removeSourceChip(rel, sid)}
                                >
                                    <X size={10} />
                                </button>
                            </span>
                        {/each}
                        <button
                            type="button"
                            class="border-line text-fg-muted hover:border-accent hover:text-accent inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5"
                            onclick={() => (chooser = { kind: "edit-source", relId: rel.id })}
                            >+ source</button
                        >
                    </div>

                    <!-- arrow + target chips -->
                    <div class="flex flex-wrap items-center gap-1">
                        <ArrowRight size={11} class="text-fg-muted" />
                        <span class="text-fg-muted text-[10px] uppercase tracking-wide">to</span>
                        {#each rel.targetIds as tid (tid)}
                            <span
                                class="border-line bg-canvas-elev inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
                            >
                                <button
                                    type="button"
                                    class="hover:text-accent"
                                    onclick={() => onselect?.(tid)}>{nameOf(tid)}</button
                                >
                                <button
                                    type="button"
                                    class="text-fg-muted hover:text-danger"
                                    aria-label="remove from targets"
                                    onclick={() => removeTargetChip(rel, tid)}
                                >
                                    <X size={10} />
                                </button>
                            </span>
                        {/each}
                        <button
                            type="button"
                            class="border-line text-fg-muted hover:border-accent hover:text-accent inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5"
                            onclick={() => (chooser = { kind: "edit-target", relId: rel.id })}
                            >+ target</button
                        >
                    </div>

                    <!-- cause / date / notes -->
                    <div class="mt-2 flex flex-col gap-1.5">
                        <label class="flex items-center gap-1.5">
                            <span class="text-fg-muted w-14 text-[10px] uppercase tracking-wide"
                                >cause</span
                            >
                            <input
                                type="text"
                                class="border-line bg-canvas-elev text-fg flex-1 rounded border px-1.5 py-0.5"
                                placeholder="optional"
                                value={rel.cause ?? ""}
                                onblur={(e) => onCauseBlur(rel, e)}
                            />
                        </label>
                        <label class="flex items-center gap-1.5">
                            <span class="text-fg-muted w-14 text-[10px] uppercase tracking-wide"
                                >date</span
                            >
                            <div class="min-w-0 flex-1">
                                <DateInput
                                    value={rel.date}
                                    placeholder="optional"
                                    onchange={(v: HaracalndeDateData | undefined) =>
                                        onpatchRelationship?.(rel.id, { date: v })}
                                />
                            </div>
                        </label>
                        <label class="flex items-start gap-1.5">
                            <span
                                class="text-fg-muted w-14 pt-1 text-[10px] uppercase tracking-wide"
                                >notes</span
                            >
                            <textarea
                                rows="2"
                                class="border-line bg-canvas-elev text-fg flex-1 resize-y rounded border px-1.5 py-0.5"
                                placeholder="optional"
                                value={rel.notes ?? ""}
                                onblur={(e) => onNotesBlur(rel, e)}
                            ></textarea>
                        </label>
                    </div>
                </li>
            {/each}
        </ul>
    {/if}

    <!-- create row -->
    <div class="border-line border-t pt-3">
        <div class="text-fg-muted mb-1.5 text-[10px] uppercase tracking-wide">add relationship</div>
        <div class="flex items-center gap-2">
            <select
                class="border-line bg-canvas-elev text-fg rounded border px-1 py-0.5 text-[11px]"
                bind:value={creatingKind}
                aria-label="kind for new relationship"
            >
                {#each KINDS as k (k)}
                    <option value={k}>{k}</option>
                {/each}
            </select>
            <button
                type="button"
                class="border-line text-fg hover:border-accent hover:text-accent inline-flex items-center gap-1 rounded border px-2 py-0.5"
                onclick={startCreate}
            >
                <Plus size={11} />
                pick target
            </button>
        </div>
    </div>

    {#if chooser}
        {@const c = chooser}
        {@const editingRel =
            c.kind === "create-target"
                ? undefined
                : (tree.relationships ?? []).find((r) => r.id === c.relId)}
        <PersonChooser
            people={Object.values(tree.people)}
            excludeIds={c.kind === "create-target"
                ? chooserExcludeForCreate()
                : editingRel
                  ? chooserExcludeForEdit(
                        editingRel,
                        c.kind === "edit-source" ? "source" : "target",
                    )
                  : []}
            title={c.kind === "create-target"
                ? "pick target person"
                : c.kind === "edit-source"
                  ? "add source"
                  : "add target"}
            onpick={onChooserPick}
            oncreate={() => {
                chooser = undefined;
            }}
            onclose={() => (chooser = undefined)}
        />
    {/if}
</section>
