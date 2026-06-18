<!--
    FamilyTreeEditor - Inspector "Groups" tab: CRUD for tree.groups[].
    person-centric view of dynasties, houses, clans, households,
    factions, orders, covenants the selected person belongs to.
    relationship-vocabulary plan phase 8 (ship polish; added after
    phase 6a closed).
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { Plus, Trash2, X, Crown } from "@lucide/svelte";
    import type {
        Group,
        GroupFrameStyle,
        GroupKind,
        Person,
        PersonId,
        Tree,
    } from "$lib/domain/types";
    import type { GroupPatch } from "$lib/domain/tree";
    import PersonChooser from "./PersonChooser.svelte";

    interface Props {
        tree: Tree;
        person: Person;
        onaddGroup?: ((g: Omit<Group, "id"> & { id?: string }) => void) | undefined;
        onremoveGroup?: ((groupId: string) => void) | undefined;
        onpatchGroup?: ((groupId: string, patch: GroupPatch) => void) | undefined;
        onaddGroupMember?: ((groupId: string, personId: PersonId) => void) | undefined;
        onremoveGroupMember?: ((groupId: string, personId: PersonId) => void) | undefined;
        onselect?: ((id: PersonId) => void) | undefined;
    }

    let {
        tree,
        person,
        onaddGroup,
        onremoveGroup,
        onpatchGroup,
        onaddGroupMember,
        onremoveGroupMember,
        onselect,
    }: Props = $props();

    // 7 canonical kinds drive the picker; free-form text is allowed via the
    // domain layer but the inspector exposes only the canonical set on the
    // create path. existing non-canonical kinds round-trip via the select
    // (selecting "other" preserves the original string).
    const CANONICAL_KINDS: readonly GroupKind[] = [
        "dynasty",
        "house",
        "clan",
        "household",
        "faction",
        "order",
        "covenant",
    ];

    const FRAME_STYLES: readonly GroupFrameStyle[] = ["hull", "band", "ribbon"];

    // person-centric view: every group whose memberIds include this person.
    // sorted by kind then name for stable scanning.
    const myGroups = $derived.by<readonly Group[]>(() => {
        const list = tree.groups ?? [];
        const mine = list.filter((g) => g.memberIds.includes(person.id));
        return mine.slice().sort((a, b) => {
            const k = a.kind.localeCompare(b.kind);
            if (k !== 0) return k;
            return a.name.localeCompare(b.name);
        });
    });

    type ChooserSlot =
        | { kind: "add-member"; groupId: string }
        | { kind: "set-founder"; groupId: string };
    let chooser = $state<ChooserSlot | undefined>(undefined);

    // create panel state
    let creatingKind = $state<GroupKind>("house");
    let creatingName = $state("");

    function nameOf(id: PersonId): string {
        const p = tree.people[id];
        if (!p) return id;
        return [p.given, p.surname].filter(Boolean).join(" ").trim() || "(unnamed)";
    }

    function onCreate(): void {
        const trimmed = creatingName.trim();
        if (!trimmed) return;
        onaddGroup?.({
            name: trimmed,
            kind: creatingKind,
            memberIds: [person.id],
        });
        creatingName = "";
    }

    function onCreateKeydown(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            e.preventDefault();
            onCreate();
        }
    }

    function onKindChange(g: Group, e: Event & { currentTarget: HTMLSelectElement }): void {
        onpatchGroup?.(g.id, { kind: e.currentTarget.value });
    }

    function onNameBlur(g: Group, e: Event & { currentTarget: HTMLInputElement }): void {
        const v = e.currentTarget.value.trim();
        if (v && v !== g.name) onpatchGroup?.(g.id, { name: v });
    }

    function onFrameStyleChange(g: Group, e: Event & { currentTarget: HTMLSelectElement }): void {
        const v = e.currentTarget.value;
        if (v === "default") onpatchGroup?.(g.id, { frame: undefined });
        else onpatchGroup?.(g.id, { frame: { ...(g.frame ?? {}), style: v as GroupFrameStyle } });
    }

    function onArmorialBlur(g: Group, e: Event & { currentTarget: HTMLTextAreaElement }): void {
        const v = e.currentTarget.value.trim();
        if (v.length === 0) onpatchGroup?.(g.id, { armorial: undefined });
        else onpatchGroup?.(g.id, { armorial: { description: v } });
    }

    function clearFounder(g: Group): void {
        onpatchGroup?.(g.id, { founderId: undefined });
    }

    function onChooserPick(targetId: PersonId): void {
        if (!chooser) return;
        if (chooser.kind === "add-member") {
            onaddGroupMember?.(chooser.groupId, targetId);
        } else if (chooser.kind === "set-founder") {
            onpatchGroup?.(chooser.groupId, { founderId: targetId });
        }
        chooser = undefined;
    }

    function chooserExcludeMembers(g: Group): readonly PersonId[] {
        return g.memberIds;
    }
</script>

<section class="text-fg flex flex-col gap-3 px-3 py-3 text-xs">
    {#if myGroups.length === 0}
        <p class="text-fg-muted italic">this person isn't a member of any group yet</p>
    {:else}
        <ul class="flex flex-col gap-2">
            {#each myGroups as g (g.id)}
                <li class="border-line bg-canvas/50 rounded border p-2">
                    <header class="mb-2 flex items-center gap-2">
                        <select
                            class="border-line bg-canvas-elev text-fg rounded border px-1 py-0.5 text-[11px]"
                            value={g.kind}
                            aria-label="group kind"
                            onchange={(e) => onKindChange(g, e)}
                        >
                            {#each CANONICAL_KINDS as k (k)}
                                <option value={k}>{k}</option>
                            {/each}
                            {#if !CANONICAL_KINDS.includes(g.kind)}
                                <option value={g.kind}>{g.kind}</option>
                            {/if}
                        </select>
                        <input
                            type="text"
                            class="border-line bg-canvas-elev text-fg flex-1 rounded border px-1.5 py-0.5"
                            aria-label="group name"
                            value={g.name}
                            onblur={(e) => onNameBlur(g, e)}
                        />
                        <button
                            type="button"
                            class="text-fg-muted hover:text-danger"
                            aria-label="delete group"
                            title="delete this group"
                            onclick={() => onremoveGroup?.(g.id)}
                        >
                            <Trash2 size={12} />
                        </button>
                    </header>

                    <!-- members -->
                    <div class="mb-1.5 flex flex-wrap items-center gap-1">
                        <span class="text-fg-muted text-[10px] uppercase tracking-wide"
                            >members</span
                        >
                        {#each g.memberIds as mid (mid)}
                            <span
                                class="border-line bg-canvas-elev inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
                                class:border-accent={g.founderId === mid}
                            >
                                {#if g.founderId === mid}
                                    <Crown size={10} class="text-accent" />
                                {/if}
                                <button
                                    type="button"
                                    class="hover:text-accent"
                                    onclick={() => onselect?.(mid)}>{nameOf(mid)}</button
                                >
                                <button
                                    type="button"
                                    class="text-fg-muted hover:text-danger"
                                    aria-label="remove member"
                                    onclick={() => onremoveGroupMember?.(g.id, mid)}
                                >
                                    <X size={10} />
                                </button>
                            </span>
                        {/each}
                        <button
                            type="button"
                            class="border-line text-fg-muted hover:border-accent hover:text-accent inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5"
                            onclick={() => (chooser = { kind: "add-member", groupId: g.id })}
                            >+ member</button
                        >
                    </div>

                    <!-- founder + frame style row -->
                    <div class="mt-2 grid grid-cols-2 gap-1.5">
                        <label class="flex items-center gap-1.5">
                            <span class="text-fg-muted w-14 text-[10px] uppercase tracking-wide"
                                >founder</span
                            >
                            {#if g.founderId}
                                <span
                                    class="border-line bg-canvas-elev inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
                                >
                                    <Crown size={10} class="text-accent" />
                                    <button
                                        type="button"
                                        class="hover:text-accent"
                                        onclick={() => onselect?.(g.founderId!)}
                                        >{nameOf(g.founderId)}</button
                                    >
                                    <button
                                        type="button"
                                        class="text-fg-muted hover:text-danger"
                                        aria-label="clear founder"
                                        onclick={() => clearFounder(g)}
                                    >
                                        <X size={10} />
                                    </button>
                                </span>
                            {:else}
                                <button
                                    type="button"
                                    class="border-line text-fg-muted hover:border-accent hover:text-accent inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5"
                                    onclick={() =>
                                        (chooser = { kind: "set-founder", groupId: g.id })}
                                    >pick</button
                                >
                            {/if}
                        </label>
                        <label class="flex items-center gap-1.5">
                            <span class="text-fg-muted w-14 text-[10px] uppercase tracking-wide"
                                >frame</span
                            >
                            <select
                                class="border-line bg-canvas-elev text-fg rounded border px-1 py-0.5 text-[11px]"
                                value={g.frame?.style ?? "default"}
                                aria-label="frame style"
                                onchange={(e) => onFrameStyleChange(g, e)}
                            >
                                <option value="default">default</option>
                                {#each FRAME_STYLES as s (s)}
                                    <option value={s}>{s}</option>
                                {/each}
                            </select>
                        </label>
                    </div>

                    <!-- armorial -->
                    <label class="mt-2 flex items-start gap-1.5">
                        <span class="text-fg-muted w-14 pt-1 text-[10px] uppercase tracking-wide"
                            >blazon</span
                        >
                        <textarea
                            rows="2"
                            class="border-line bg-canvas-elev text-fg flex-1 resize-y rounded border px-1.5 py-0.5"
                            placeholder="optional armorial blazon"
                            value={g.armorial?.description ?? ""}
                            onblur={(e) => onArmorialBlur(g, e)}
                        ></textarea>
                    </label>
                </li>
            {/each}
        </ul>
    {/if}

    <!-- create row -->
    <div class="border-line border-t pt-3">
        <div class="text-fg-muted mb-1.5 text-[10px] uppercase tracking-wide">add group</div>
        <div class="flex items-center gap-2">
            <select
                class="border-line bg-canvas-elev text-fg rounded border px-1 py-0.5 text-[11px]"
                bind:value={creatingKind}
                aria-label="kind for new group"
            >
                {#each CANONICAL_KINDS as k (k)}
                    <option value={k}>{k}</option>
                {/each}
            </select>
            <input
                type="text"
                class="border-line bg-canvas-elev text-fg flex-1 rounded border px-1.5 py-0.5"
                placeholder="name"
                aria-label="name for new group"
                bind:value={creatingName}
                onkeydown={onCreateKeydown}
            />
            <button
                type="button"
                class="border-line text-fg hover:border-accent hover:text-accent inline-flex items-center gap-1 rounded border px-2 py-0.5 disabled:opacity-50"
                disabled={creatingName.trim().length === 0}
                onclick={onCreate}
            >
                <Plus size={11} />
                add
            </button>
        </div>
    </div>

    {#if chooser}
        {@const c = chooser}
        {@const g = (tree.groups ?? []).find((x) => x.id === c.groupId)}
        <PersonChooser
            people={Object.values(tree.people)}
            excludeIds={g ? (c.kind === "add-member" ? chooserExcludeMembers(g) : []) : []}
            title={c.kind === "add-member" ? "add member" : "pick founder"}
            onpick={onChooserPick}
            oncreate={() => {
                chooser = undefined;
            }}
            onclose={() => (chooser = undefined)}
        />
    {/if}
</section>
