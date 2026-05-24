<!--
    FamilyTreeEditor - right-side persistent inspector for the selected person.
    tabs: Personal · Connections · Bonds · Groups · Sibship · Details · Bio.
    empty state shows a tree summary.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import {
        BookOpen,
        ChevronRight,
        Copy,
        Crown,
        Crosshair,
        FileText,
        Flag,
        Link2,
        MoreHorizontal,
        Sparkles,
        Trash2,
        User,
        Users,
        X,
    } from "@lucide/svelte";
    import type {
        Group,
        ParentPedi,
        ParentRef,
        ParentRole,
        Person,
        PersonId,
        Relationship,
        SibshipDecorator,
        Tree,
    } from "$lib/domain/types";
    import type {
        CouplePatch,
        GroupPatch,
        PersonPatch,
        RelationshipPatch,
        SibshipPatch,
        UnionPatch,
    } from "$lib/domain/tree";
    import type { PortraitUrlCache } from "$lib/state/portraitUrls.svelte";
    import PersonalTab from "./PersonalTab.svelte";
    import ConnectionsTab from "./ConnectionsTab.svelte";
    import DetailsTab from "./DetailsTab.svelte";
    import GroupsTab from "./GroupsTab.svelte";
    import RelationshipsTab from "./RelationshipsTab.svelte";
    import SibshipTab from "./SibshipTab.svelte";

    type Slot =
        | { kind: "parent"; role: "mother" | "father" }
        | { kind: "parent-extra" }
        | { kind: "partner" }
        | { kind: "child" };
    type Tab =
        | "personal"
        | "connections"
        | "relationships"
        | "groups"
        | "sibship"
        | "details"
        | "bio";

    interface Props {
        tree: Tree;
        selectedId: PersonId | undefined;
        treeId: string;
        portraitUrls: PortraitUrlCache;
        readOnly?: boolean;
        /** which side of the canvas to dock against; controls border placement */
        side?: "left" | "right";
        /** which tab to show on selection change. "connections" jumps via context menu. */
        initialTab?: Tab;
        onpatch: (id: PersonId, patch: PersonPatch) => void;
        onsetParent: (childId: PersonId, parentId: PersonId, role: "mother" | "father") => void;
        onunsetParent: (childId: PersonId, role: "mother" | "father") => void;
        onaddParentRef?: (childId: PersonId, ref: ParentRef) => void;
        onunsetParentById?: (childId: PersonId, parentId: PersonId) => void;
        onupdateParentRef?: (
            childId: PersonId,
            parentId: PersonId,
            patch: { role?: ParentRole; pedi?: ParentPedi },
        ) => void;
        onaddPartner: (aId: PersonId, bId: PersonId) => void;
        onremovePartner: (aId: PersonId, bId: PersonId) => void;
        onaddChild: (parentId: PersonId, childId: PersonId) => void;
        onremoveChild: (parentId: PersonId, childId: PersonId) => void;
        oncreateAndLink: (forPersonId: PersonId, slot: Slot) => void;
        onselect: (id: PersonId) => void;
        onpatchCouple: (aId: PersonId, bId: PersonId, patch: CouplePatch) => void;
        /** Phase 3c follow-up: append a partner to an existing union (N-partner). */
        onaddUnionPartner?: ((unionId: string, personId: PersonId) => void) | undefined;
        /** remove a partner from a union; empty unions are deleted by the domain op. */
        onremoveUnionPartner?: ((unionId: string, personId: PersonId) => void) | undefined;
        /** patch union metadata (kind / closed / name / preferredBy / etc.). */
        onpatchUnion?: ((unionId: string, patch: UnionPatch) => void) | undefined;
        /** set or clear `personId`'s preferred union; enforces one-per-person. */
        onsetPreferredUnion?:
            | ((unionId: string, personId: PersonId, preferred: boolean) => void)
            | undefined;
        /** create a fresh person and append them as a new partner of the union. */
        oncreateAndLinkUnionPartner?: ((unionId: string) => void) | undefined;
        /** Phase 4 (relationship-vocabulary): add a Relationship to tree.relationships[]. */
        onaddRelationship?: ((rel: Omit<Relationship, "id"> & { id?: string }) => void) | undefined;
        /** remove a Relationship by id. */
        onremoveRelationship?: ((relId: string) => void) | undefined;
        /** patch a Relationship (kind / sourceIds / targetIds / cause / date / notes). */
        onpatchRelationship?: ((relId: string, patch: RelationshipPatch) => void) | undefined;
        /** Phase 6a: add a Group to tree.groups[]. */
        onaddGroup?: ((g: Omit<Group, "id"> & { id?: string }) => void) | undefined;
        /** remove a Group by id. */
        onremoveGroup?: ((groupId: string) => void) | undefined;
        /** patch a Group's scalar fields. */
        onpatchGroup?: ((groupId: string, patch: GroupPatch) => void) | undefined;
        /** append a member to a Group. */
        onaddGroupMember?: ((groupId: string, personId: PersonId) => void) | undefined;
        /** remove a member from a Group. */
        onremoveGroupMember?: ((groupId: string, personId: PersonId) => void) | undefined;
        /** Phase 6b: add a SibshipDecorator to tree.sibshipDecorators[]. */
        onaddSibshipDecorator?:
            | ((d: Omit<SibshipDecorator, "id"> & { id?: string }) => void)
            | undefined;
        /** remove a SibshipDecorator by id. */
        onremoveSibshipDecorator?: ((id: string) => void) | undefined;
        /** patch a SibshipDecorator's scalar fields. */
        onpatchSibshipDecorator?: ((id: string, patch: SibshipPatch) => void) | undefined;
        /** append a member to a SibshipDecorator. */
        onaddSibshipMember?: ((id: string, personId: PersonId) => void) | undefined;
        /** remove a member from a SibshipDecorator. */
        onremoveSibshipMember?: ((id: string, personId: PersonId) => void) | undefined;
        onduplicate: (id: PersonId) => void;
        onsetRoot: (id: PersonId) => void;
        ondelete: (id: PersonId) => void;
        onclose: () => void;
        onerror?: (msg: string) => void;
        /** centre the canvas on the currently-selected person (no-op when undefined). */
        onfocus?: (() => void) | undefined;
    }

    let {
        tree,
        selectedId,
        treeId,
        portraitUrls,
        readOnly = false,
        side = "right",
        initialTab = "personal",
        onpatch,
        onsetParent,
        onunsetParent,
        onaddParentRef,
        onunsetParentById,
        onupdateParentRef,
        onaddPartner,
        onremovePartner,
        onaddChild,
        onremoveChild,
        oncreateAndLink,
        onselect,
        onpatchCouple,
        onaddUnionPartner,
        onremoveUnionPartner,
        onpatchUnion,
        onsetPreferredUnion,
        oncreateAndLinkUnionPartner,
        onaddRelationship,
        onremoveRelationship,
        onpatchRelationship,
        onaddGroup,
        onremoveGroup,
        onpatchGroup,
        onaddGroupMember,
        onremoveGroupMember,
        onaddSibshipDecorator,
        onremoveSibshipDecorator,
        onpatchSibshipDecorator,
        onaddSibshipMember,
        onremoveSibshipMember,
        onduplicate,
        onsetRoot,
        ondelete,
        onclose,
        onerror,
        onfocus,
    }: Props = $props();

    // activeTab is reseeded whenever the parent supplies a new selectedId or
    // initialTab. seeded lazily so the initial render matches the prop.
    let activeTab = $state<Tab>("personal");
    let menuOpen = $state(false);
    let menuEl: HTMLDivElement | undefined = $state();

    // responsive mode: "sheet" on narrow viewports, "side" otherwise
    const mql =
        typeof window !== "undefined" && window.matchMedia
            ? window.matchMedia("(max-width: 600px)")
            : null;
    let isSheet = $state(mql?.matches ?? false);
    // iOS Safari shrinks visualViewport (not layout viewport) when the keyboard appears
    let sheetMaxH = $state(window.visualViewport?.height ?? window.innerHeight ?? 800);

    const person = $derived(selectedId ? tree.people[selectedId] : undefined);

    const summary = $derived.by(() => {
        const allPeople = Object.values(tree.people);
        const root = tree.people[tree.rootId];
        return {
            people: allPeople.length,
            couples: tree.couples.length,
            rootName: root ? fullName(root) : "(no root)",
            updated: tree.updatedAt,
        };
    });

    function fullName(p: Person): string {
        return [p.given, p.surname].filter(Boolean).join(" ").trim() || "(unnamed)";
    }

    function fmtRel(ts: number): string {
        const ms = Date.now() - ts;
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${String(s)}s ago`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${String(m)}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${String(h)}h ago`;
        const d = Math.floor(h / 24);
        return `${String(d)}d ago`;
    }

    // reset to the requested tab whenever the parent changes selectedId or
    // initialTab. references both reactive props so the effect re-runs on either.
    $effect.pre(() => {
        void selectedId;
        activeTab = initialTab;
    });

    function copyId(): void {
        if (!person) return;
        void navigator.clipboard?.writeText(person.id);
        menuOpen = false;
    }

    function onWindowDown(e: PointerEvent): void {
        if (!menuOpen) return;
        if (!menuEl) return;
        if (e.target instanceof Node && menuEl.contains(e.target)) return;
        menuOpen = false;
    }

    function onMqlChange(e: MediaQueryListEvent): void {
        isSheet = e.matches;
    }
    function onViewportResize(): void {
        sheetMaxH = window.visualViewport?.height ?? window.innerHeight;
    }

    onMount(() => {
        window.addEventListener("pointerdown", onWindowDown, true);
        mql?.addEventListener("change", onMqlChange);
        window.visualViewport?.addEventListener("resize", onViewportResize);
    });
    onDestroy(() => {
        window.removeEventListener("pointerdown", onWindowDown, true);
        mql?.removeEventListener("change", onMqlChange);
        window.visualViewport?.removeEventListener("resize", onViewportResize);
    });

    async function openTab(t: Tab): Promise<void> {
        activeTab = t;
        await tick();
    }

    const tabs: { id: Tab; label: string; icon: typeof User }[] = [
        { id: "personal", label: "personal", icon: User },
        { id: "connections", label: "connections", icon: Users },
        { id: "relationships", label: "bonds", icon: Link2 },
        { id: "groups", label: "groups", icon: Flag },
        { id: "sibship", label: "sibship", icon: Sparkles },
        { id: "details", label: "details", icon: FileText },
        { id: "bio", label: "bio", icon: BookOpen },
    ];
</script>

<aside
    class="bg-canvas-elev border-line text-fg flex min-h-0 shrink-0 flex-col overflow-hidden"
    class:h-full={!isSheet}
    class:w-90={!isSheet}
    class:border-l={!isSheet && side === "right"}
    class:border-r={!isSheet && side === "left"}
    class:absolute={isSheet}
    class:inset-x-0={isSheet}
    class:bottom-0={isSheet}
    class:rounded-t-lg={isSheet}
    class:border-t={isSheet}
    class:z-50={isSheet}
    style={isSheet ? `max-height: ${String(Math.round(sheetMaxH * 0.75))}px` : undefined}
    aria-label="person inspector"
    data-canvas-chrome={isSheet ? "" : undefined}
>
    {#if person}
        <header class="border-line border-b px-3 py-2">
            <div class="flex items-start gap-2">
                <div class="min-w-0 flex-1">
                    <h2 class="text-fg flex items-center gap-1 truncate text-sm font-semibold">
                        <span class="truncate">{fullName(person)}</span>
                        {#if person.id === tree.rootId}
                            <!-- tree-root crown badge, mirrors the set-as-root action affordance -->
                            <span
                                class="shrink-0 text-amber-400"
                                title="tree root"
                                aria-label="tree root"
                            >
                                <Crown size={12} />
                            </span>
                        {/if}
                    </h2>
                    <p class="text-fg-muted truncate font-mono text-[10px]">id {person.id}</p>
                </div>
                {#if onfocus}
                    <button
                        type="button"
                        class="text-fg-muted hover:bg-canvas hover:text-fg flex h-6 w-6 items-center justify-center rounded"
                        aria-label="centre on selection"
                        title="centre on selection"
                        onclick={() => onfocus?.()}
                    >
                        <Crosshair size={14} />
                    </button>
                {/if}
                {#if !readOnly}
                    <div bind:this={menuEl} class="relative">
                        <button
                            type="button"
                            class="text-fg-muted hover:bg-canvas hover:text-fg flex h-6 w-6 items-center justify-center rounded"
                            aria-label="more actions"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onclick={() => (menuOpen = !menuOpen)}
                        >
                            <MoreHorizontal size={14} />
                        </button>
                        {#if menuOpen}
                            <div
                                class="bg-canvas-elev border-line absolute right-0 top-full z-30 mt-1 w-44 rounded-md border py-1 shadow-xl"
                                role="menu"
                            >
                                <button
                                    type="button"
                                    class="hover:bg-canvas flex w-full items-center gap-2 px-3 py-1 text-left text-xs"
                                    onclick={() => {
                                        onduplicate(person.id);
                                        menuOpen = false;
                                    }}
                                >
                                    <Copy size={12} />
                                    Duplicate person
                                </button>
                                <button
                                    type="button"
                                    class="hover:bg-canvas flex w-full items-center gap-2 px-3 py-1 text-left text-xs"
                                    onclick={() => {
                                        onsetRoot(person.id);
                                        menuOpen = false;
                                    }}
                                >
                                    <Crown size={12} />
                                    Set as tree root
                                </button>
                                <button
                                    type="button"
                                    class="hover:bg-canvas flex w-full items-center gap-2 px-3 py-1 text-left text-xs"
                                    onclick={copyId}
                                >
                                    <Copy size={12} />
                                    Copy ID
                                </button>
                                <div class="border-line my-1 border-t"></div>
                                <button
                                    type="button"
                                    class="text-pink-400 hover:bg-canvas flex w-full items-center gap-2 px-3 py-1 text-left text-xs"
                                    onclick={() => {
                                        ondelete(person.id);
                                        menuOpen = false;
                                    }}
                                >
                                    <Trash2 size={12} />
                                    Delete person
                                </button>
                            </div>
                        {/if}
                    </div>
                {/if}
                <button
                    type="button"
                    class="text-fg-muted hover:bg-canvas hover:text-fg flex h-6 w-6 items-center justify-center rounded"
                    aria-label="close inspector"
                    onclick={onclose}
                >
                    <X size={14} />
                </button>
            </div>
        </header>

        <div
            class="border-line bg-canvas-elev flex shrink-0 border-b text-[11px]"
            role="tablist"
            aria-label="inspector tabs"
        >
            {#each tabs as t (t.id)}
                {@const Icon = t.icon}
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === t.id}
                    aria-controls="inspector-panel"
                    class="hover:bg-canvas -mb-px flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-1.5"
                    class:border-accent={activeTab === t.id}
                    class:text-accent={activeTab === t.id}
                    class:border-transparent={activeTab !== t.id}
                    class:text-fg-muted={activeTab !== t.id}
                    onclick={() => void openTab(t.id)}
                >
                    <Icon size={11} strokeWidth={2.25} />
                    {t.label}
                </button>
            {/each}
        </div>

        <div id="inspector-panel" role="tabpanel" class="min-h-0 flex-1 overflow-y-auto">
            {#if activeTab === "personal"}
                <PersonalTab
                    {person}
                    {treeId}
                    {portraitUrls}
                    onpatch={(p: PersonPatch) => onpatch(person.id, p)}
                    {onerror}
                />
            {:else if activeTab === "connections"}
                <ConnectionsTab
                    {tree}
                    {person}
                    {onsetParent}
                    {onunsetParent}
                    {onaddParentRef}
                    {onunsetParentById}
                    {onupdateParentRef}
                    {onaddPartner}
                    {onremovePartner}
                    {onaddChild}
                    {onremoveChild}
                    oncreateAndLink={(slot: Slot) => oncreateAndLink(person.id, slot)}
                    {onselect}
                    {onpatchCouple}
                    {onaddUnionPartner}
                    {onremoveUnionPartner}
                    {onpatchUnion}
                    {onsetPreferredUnion}
                    {oncreateAndLinkUnionPartner}
                />
            {:else if activeTab === "relationships"}
                <RelationshipsTab
                    {tree}
                    {person}
                    {onaddRelationship}
                    {onremoveRelationship}
                    {onpatchRelationship}
                    {onselect}
                />
            {:else if activeTab === "groups"}
                <GroupsTab
                    {tree}
                    {person}
                    {onaddGroup}
                    {onremoveGroup}
                    {onpatchGroup}
                    {onaddGroupMember}
                    {onremoveGroupMember}
                    {onselect}
                />
            {:else if activeTab === "sibship"}
                <SibshipTab
                    {tree}
                    {person}
                    {onaddSibshipDecorator}
                    {onremoveSibshipDecorator}
                    {onpatchSibshipDecorator}
                    {onaddSibshipMember}
                    {onremoveSibshipMember}
                    {onselect}
                />
            {:else if activeTab === "details"}
                <DetailsTab {person} onpatch={(p: PersonPatch) => onpatch(person.id, p)} />
            {:else if activeTab === "bio"}
                <div class="text-fg-muted px-4 py-6 text-center text-xs italic">
                    long-form notes are coming with the schema bump for <code>note</code>.
                </div>
            {/if}
        </div>
    {:else}
        <!-- empty state: tree summary -->
        <header class="border-line border-b px-3 py-2">
            <div class="flex items-center gap-2">
                <span class="text-fg text-sm font-semibold flex-1 truncate"
                    >{tree.name || "untitled"}</span
                >
                <button
                    type="button"
                    class="text-fg-muted hover:bg-canvas hover:text-fg flex h-6 w-6 items-center justify-center rounded"
                    aria-label="close inspector"
                    onclick={onclose}
                >
                    <X size={14} />
                </button>
            </div>
            <p class="text-fg-muted mt-0.5 text-[10px]">tree summary</p>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <dt class="text-fg-muted">people</dt>
                <dd class="text-fg tabular-nums">{summary.people}</dd>
                <dt class="text-fg-muted">couples</dt>
                <dd class="text-fg tabular-nums">{summary.couples}</dd>
                <dt class="text-fg-muted">root</dt>
                <dd class="text-fg truncate">{summary.rootName}</dd>
                <dt class="text-fg-muted">last edit</dt>
                <dd class="text-fg">{fmtRel(summary.updated)}</dd>
            </dl>

            <div class="text-fg-muted mt-6 flex items-center justify-center gap-1.5 text-xs italic">
                <ChevronRight size={12} />
                click any person to inspect
            </div>
        </div>
    {/if}
</aside>
