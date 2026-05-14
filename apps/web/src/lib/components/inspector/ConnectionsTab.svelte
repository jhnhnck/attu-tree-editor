<!--
    FamilyTreeEditor - Inspector "Connections" tab: edit parents / partners / children.
    each row links / unlinks / changes via a PersonChooser popover.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import {
        ArrowRight,
        ArrowRightLeft,
        Eye,
        Plus,
        X,
        XCircle,
        UserPlus,
        Heart,
        Baby,
    } from "@lucide/svelte";
    import type {
        CoupleRecord,
        ParentPedi,
        ParentRef,
        ParentRole,
        Person,
        PersonId,
        Tree,
    } from "$lib/domain/types";
    import { getParents, type CouplePatch } from "$lib/domain/tree";

    const ROLE_OPTIONS: readonly ParentRole[] = [
        "mother",
        "father",
        "parent",
        "progenitor",
        "donor",
        "surrogate",
        "social",
    ];
    const PEDI_OPTIONS: readonly ParentPedi[] = [
        "birth",
        "adopted",
        "foster",
        "sealed",
        "chosen",
        "magical",
        "cloned",
        "hatched",
        "summoned",
        "manufactured",
    ];
    import type { HaracalndeDateData } from "$lib/date/HaracalndeDate";
    import DateInput from "$lib/components/form/DateInput.svelte";
    import PersonChooser from "./PersonChooser.svelte";

    type LegacyParentRole = "mother" | "father";
    type Slot =
        | { kind: "parent"; role: LegacyParentRole }
        | { kind: "parent-extra" }
        | { kind: "partner" }
        | { kind: "child" };

    interface Props {
        tree: Tree;
        person: Person;
        onsetParent: (childId: PersonId, parentId: PersonId, role: LegacyParentRole) => void;
        onunsetParent: (childId: PersonId, role: LegacyParentRole) => void;
        /** add a parent with arbitrary role + pedi (Phase 2b.3 N-parent). */
        onaddParentRef?: ((childId: PersonId, ref: ParentRef) => void) | undefined;
        /** remove a parent entry by personId (any role). */
        onunsetParentById?: ((childId: PersonId, parentId: PersonId) => void) | undefined;
        /** mutate the role / pedi of an existing parent entry. */
        onupdateParentRef?:
            | ((
                  childId: PersonId,
                  parentId: PersonId,
                  patch: { role?: ParentRole; pedi?: ParentPedi },
              ) => void)
            | undefined;
        onaddPartner: (aId: PersonId, bId: PersonId) => void;
        onremovePartner: (aId: PersonId, bId: PersonId) => void;
        onaddChild: (parentId: PersonId, childId: PersonId) => void;
        onremoveChild: (parentId: PersonId, childId: PersonId) => void;
        oncreateAndLink: (slot: Slot) => void;
        onselect: (id: PersonId) => void;
        onpatchCouple: (aId: PersonId, bId: PersonId, patch: CouplePatch) => void;
        /** currently selected trace target, if any */
        traceTargetId?: PersonId | undefined;
        /** callback to set the trace target (path will be drawn on canvas) */
        onsetTraceTarget?: ((id: PersonId | undefined) => void) | undefined;
    }

    let {
        tree,
        person,
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
        traceTargetId,
        onsetTraceTarget,
    }: Props = $props();

    let chooserSlot = $state<Slot | undefined>();
    let traceMode = $state(false);

    const allPeople = $derived(Object.values(tree.people));

    const parentRefs = $derived(getParents(person));
    const extraParentRefs = $derived(
        parentRefs.filter((r) => r.role !== "mother" && r.role !== "father"),
    );
    const motherRef = $derived(parentRefs.find((r) => r.role === "mother"));
    const fatherRef = $derived(parentRefs.find((r) => r.role === "father"));
    const mother = $derived(motherRef ? tree.people[motherRef.personId] : undefined);
    const father = $derived(fatherRef ? tree.people[fatherRef.personId] : undefined);
    const partners = $derived(
        person.spouseIds.map((id) => tree.people[id]).filter((p): p is Person => p !== undefined),
    );
    const children = $derived(
        allPeople
            .filter((p) => getParents(p).some((r) => r.personId === person.id))
            .sort((a, b) => (a.birth?.year ?? 0) - (b.birth?.year ?? 0)),
    );

    function fullName(p: Person | undefined): string {
        if (!p) return "";
        return [p.given, p.surname].filter(Boolean).join(" ").trim() || "(unnamed)";
    }

    function partnerLabelFor(c: Person): string {
        const refs = getParents(c);
        const others = refs.map((r) => r.personId).filter((pid) => pid !== person.id);
        if (others.length === 0) return "(alone)";
        const op = tree.people[others[0]!];
        return op ? `with ${fullName(op)}` : "(alone)";
    }

    function coupleWith(p: Person): CoupleRecord | undefined {
        return tree.couples.find(
            (c) =>
                (c.leftId === person.id && c.rightId === p.id) ||
                (c.leftId === p.id && c.rightId === person.id),
        );
    }

    function toggleCurrent(couple: CoupleRecord, partnerId: PersonId): void {
        const ended = couple.isCurrent === false;
        onpatchCouple(person.id, partnerId, { isCurrent: ended ? undefined : false });
    }

    function togglePrimary(couple: CoupleRecord, partnerId: PersonId): void {
        const secondary = couple.isPrimary === false;
        onpatchCouple(person.id, partnerId, { isPrimary: secondary ? undefined : false });
    }

    function chooserExcludes(slot: Slot): PersonId[] {
        // exclude self always, plus the existing fillers for this slot
        const ex: PersonId[] = [person.id];
        if (slot.kind === "partner") ex.push(...person.spouseIds);
        if (slot.kind === "child") ex.push(...children.map((c) => c.id));
        return ex;
    }

    function chooserTitle(slot: Slot | "trace"): string {
        if (slot === "trace") return "trace path to…";
        if (slot.kind === "parent") return slot.role === "mother" ? "set mother" : "set father";
        if (slot.kind === "parent-extra") return "add parent";
        if (slot.kind === "partner") return "add partner";
        return "add child";
    }

    function onpickFromChooser(id: PersonId): void {
        if (traceMode) {
            onsetTraceTarget?.(id);
            traceMode = false;
            return;
        }
        const slot = chooserSlot;
        if (!slot) return;
        if (slot.kind === "parent") onsetParent(person.id, id, slot.role);
        else if (slot.kind === "parent-extra")
            onaddParentRef?.(person.id, { personId: id, role: "parent", pedi: "birth" });
        else if (slot.kind === "partner") onaddPartner(person.id, id);
        else onaddChild(person.id, id);
        chooserSlot = undefined;
    }

    function oncreateFromChooser(): void {
        const slot = chooserSlot;
        if (!slot) return;
        oncreateAndLink(slot);
        chooserSlot = undefined;
    }

    const sectionH =
        "text-fg-muted mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase";
    const rowCls = "group flex items-center gap-1 rounded px-1.5 py-1 text-sm hover:bg-canvas/40";
    const iconBtnCls =
        "text-fg-muted hover:text-accent flex h-6 w-6 items-center justify-center rounded";
    const addBtnCls =
        "text-accent hover:bg-canvas/40 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs";
</script>

<div class="space-y-5 px-4 py-3">
    <!-- parents -->
    <section class="space-y-1">
        <h3 class={sectionH}>
            <UserPlus size={11} />
            parents
        </h3>

        <!-- mother row -->
        <div class={rowCls}>
            <span class="text-fg-muted w-12 shrink-0 text-xs">mother</span>
            {#if mother}
                <button
                    type="button"
                    class="flex-1 truncate text-left hover:underline"
                    onclick={() => onselect(mother.id)}
                >
                    {fullName(mother)}
                </button>
                <div class="relative">
                    <button
                        type="button"
                        class={iconBtnCls}
                        title="change mother"
                        aria-label="change mother"
                        onclick={() => (chooserSlot = { kind: "parent", role: "mother" })}
                    >
                        <ArrowRightLeft size={12} />
                    </button>
                </div>
                <button
                    type="button"
                    class={iconBtnCls}
                    title="unlink mother"
                    aria-label="unlink mother"
                    onclick={() => onunsetParent(person.id, "mother")}
                >
                    <X size={14} />
                </button>
            {:else}
                <span class="text-fg-muted flex-1 italic">— not set —</span>
                <div class="relative">
                    <button
                        type="button"
                        class={iconBtnCls}
                        title="set mother"
                        aria-label="set mother"
                        onclick={() => (chooserSlot = { kind: "parent", role: "mother" })}
                    >
                        <Plus size={14} />
                    </button>
                </div>
            {/if}
        </div>

        <!-- father row -->
        <div class={rowCls}>
            <span class="text-fg-muted w-12 shrink-0 text-xs">father</span>
            {#if father}
                <button
                    type="button"
                    class="flex-1 truncate text-left hover:underline"
                    onclick={() => onselect(father.id)}
                >
                    {fullName(father)}
                </button>
                <div class="relative">
                    <button
                        type="button"
                        class={iconBtnCls}
                        title="change father"
                        aria-label="change father"
                        onclick={() => (chooserSlot = { kind: "parent", role: "father" })}
                    >
                        <ArrowRightLeft size={12} />
                    </button>
                </div>
                <button
                    type="button"
                    class={iconBtnCls}
                    title="unlink father"
                    aria-label="unlink father"
                    onclick={() => onunsetParent(person.id, "father")}
                >
                    <X size={14} />
                </button>
            {:else}
                <span class="text-fg-muted flex-1 italic">— not set —</span>
                <div class="relative">
                    <button
                        type="button"
                        class={iconBtnCls}
                        title="set father"
                        aria-label="set father"
                        onclick={() => (chooserSlot = { kind: "parent", role: "father" })}
                    >
                        <Plus size={14} />
                    </button>
                </div>
            {/if}
        </div>

        <!-- extra parents (Phase 2b.3: N-parent UI) -->
        {#each extraParentRefs as ref (ref.personId)}
            {@const p = tree.people[ref.personId]}
            {#if p}
                <div class={rowCls} data-extra-parent-row>
                    <span class="text-fg-muted w-12 shrink-0 text-xs">parent</span>
                    <button
                        type="button"
                        class="flex-1 truncate text-left hover:underline"
                        onclick={() => onselect(p.id)}
                    >
                        {fullName(p)}
                    </button>
                    <select
                        class="border-line bg-canvas text-fg-muted hover:text-fg shrink-0 rounded border px-1 py-0.5 text-[11px]"
                        title="role"
                        aria-label="role for {fullName(p)}"
                        value={ref.role ?? "parent"}
                        onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                            onupdateParentRef?.(person.id, ref.personId, {
                                role: e.currentTarget.value as ParentRole,
                            })}
                    >
                        {#each ROLE_OPTIONS as opt (opt)}
                            <option value={opt}>{opt}</option>
                        {/each}
                    </select>
                    <select
                        class="border-line bg-canvas text-fg-muted hover:text-fg shrink-0 rounded border px-1 py-0.5 text-[11px]"
                        title="pedigree"
                        aria-label="pedigree for {fullName(p)}"
                        value={ref.pedi ?? "birth"}
                        onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                            onupdateParentRef?.(person.id, ref.personId, {
                                pedi: e.currentTarget.value as ParentPedi,
                            })}
                    >
                        {#each PEDI_OPTIONS as opt (opt)}
                            <option value={opt}>{opt}</option>
                        {/each}
                    </select>
                    <button
                        type="button"
                        class={iconBtnCls}
                        title="unlink parent"
                        aria-label="unlink parent {fullName(p)}"
                        onclick={() => onunsetParentById?.(person.id, ref.personId)}
                    >
                        <X size={14} />
                    </button>
                </div>
            {/if}
        {/each}

        {#if onaddParentRef}
            <div class="relative">
                <button
                    type="button"
                    class={addBtnCls}
                    onclick={() => (chooserSlot = { kind: "parent-extra" })}
                    aria-label="add parent"
                >
                    <Plus size={12} />
                    add parent
                </button>
            </div>
        {/if}
    </section>

    <!-- partners -->
    <section class="space-y-1">
        <h3 class={sectionH}>
            <Heart size={11} />
            partners ({partners.length})
        </h3>
        {#each partners as p (p.id)}
            {@const couple = coupleWith(p)}
            <div class={rowCls}>
                <button
                    type="button"
                    class="flex-1 truncate text-left hover:underline"
                    onclick={() => onselect(p.id)}
                >
                    {fullName(p)}
                </button>
                <button
                    type="button"
                    class={iconBtnCls}
                    title="unlink partner"
                    aria-label="unlink partner {fullName(p)}"
                    onclick={() => onremovePartner(person.id, p.id)}
                >
                    <X size={14} />
                </button>
            </div>
            {#if couple}
                <div class="mb-1 flex items-center gap-2 px-2 text-[11px]">
                    <div class="min-w-0 flex-1">
                        <DateInput
                            value={couple.marriageDate}
                            placeholder="marriage date"
                            onchange={(v: HaracalndeDateData | undefined) =>
                                onpatchCouple(person.id, p.id, { marriageDate: v })}
                        />
                    </div>
                    <button
                        type="button"
                        onclick={() => toggleCurrent(couple, p.id)}
                        class="border-line text-fg-muted hover:text-fg shrink-0 rounded border px-1.5 py-0.5"
                        class:text-amber-400={couple.isCurrent === false}
                        class:border-amber-500={couple.isCurrent === false}
                    >
                        {couple.isCurrent === false ? "ended" : "married"}
                    </button>
                    {#if partners.length > 1}
                        <button
                            type="button"
                            onclick={() => togglePrimary(couple, p.id)}
                            class="border-line text-fg-muted hover:text-fg shrink-0 rounded border px-1.5 py-0.5"
                            class:text-accent={couple.isPrimary !== false}
                            class:border-accent={couple.isPrimary !== false}
                        >
                            {couple.isPrimary !== false ? "primary" : "secondary"}
                        </button>
                    {/if}
                </div>
            {/if}
        {/each}
        <div class="relative">
            <button
                type="button"
                class={addBtnCls}
                onclick={() => (chooserSlot = { kind: "partner" })}
            >
                <Plus size={12} />
                add partner
            </button>
        </div>
    </section>

    <!-- children -->
    <section class="space-y-1">
        <h3 class={sectionH}>
            <Baby size={11} />
            children ({children.length})
        </h3>
        {#each children as c (c.id)}
            <div class={rowCls}>
                <button
                    type="button"
                    class="flex-1 truncate text-left hover:underline"
                    onclick={() => onselect(c.id)}
                    title="open {fullName(c)}"
                >
                    {fullName(c)}
                </button>
                <span class="text-fg-muted shrink-0 text-[10px]">{partnerLabelFor(c)}</span>
                <button
                    type="button"
                    class={iconBtnCls}
                    title="open child"
                    aria-label="open {fullName(c)}"
                    onclick={() => onselect(c.id)}
                >
                    <Eye size={12} />
                </button>
                <button
                    type="button"
                    class={iconBtnCls}
                    title="unlink child"
                    aria-label="unlink child {fullName(c)}"
                    onclick={() => onremoveChild(person.id, c.id)}
                >
                    <X size={14} />
                </button>
            </div>
        {/each}
        <div class="relative">
            <button
                type="button"
                class={addBtnCls}
                onclick={() => (chooserSlot = { kind: "child" })}
            >
                <Plus size={12} />
                add child
            </button>
        </div>
    </section>

    <!-- trace path -->
    <section class="space-y-1">
        <button
            type="button"
            class={addBtnCls}
            onclick={() => (traceMode = true)}
            title="open person chooser to trace path"
        >
            <ArrowRight size={12} />
            trace path to…
        </button>
        {#if traceTargetId}
            {@const targetName =
                Object.values(tree.people).find((p) => p.id === traceTargetId)?.given || "?"}
            <div class="flex items-center gap-1 px-1.5 py-1 text-xs text-fg-muted">
                <span>tracing to {targetName}</span>
                <button
                    type="button"
                    class={iconBtnCls}
                    title="clear trace target"
                    onclick={() => onsetTraceTarget?.(undefined)}
                >
                    <XCircle size={12} />
                </button>
            </div>
        {/if}
    </section>

    {#if chooserSlot || traceMode}
        <!-- positioned absolute relative to the inspector body; renders as an overlay -->
        <div class="fixed inset-0 z-30 pointer-events-none">
            <div class="absolute right-3 top-32 pointer-events-auto">
                <PersonChooser
                    people={allPeople}
                    excludeIds={traceMode ? [person.id] : chooserExcludes(chooserSlot!)}
                    title={traceMode ? "trace path to…" : chooserTitle(chooserSlot!)}
                    onpick={onpickFromChooser}
                    oncreate={traceMode ? () => {} : oncreateFromChooser}
                    onclose={() => {
                        chooserSlot = undefined;
                        traceMode = false;
                    }}
                />
            </div>
        </div>
    {/if}
</div>
