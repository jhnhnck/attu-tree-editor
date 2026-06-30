<!--
    FamilyTreeEditor - settings body (theme, inspector side, layout flags).
    body-only component: wrapped in DockDialog by the caller.

    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import {
        Sun,
        Moon,
        Monitor,
        PanelLeft,
        PanelRight,
        CornerUpLeft,
        CornerUpRight,
        CornerDownLeft,
        CornerDownRight,
        Layers,
        Network,
        CircleDot,
        Plus,
        Minus,
    } from "@lucide/svelte";
    import type { PreferencesStore, Theme, InspectorSide } from "../../state/preferences.js";

    type DockCorner = "bl" | "tl" | "tr" | "br";
    type EngineKind = "family-view" | "layered" | "hyperbolic";

    interface Props {
        prefs: PreferencesStore;
        corner: DockCorner;
        oncornerchange: (c: DockCorner) => void;
        engine: EngineKind;
        onenginedefaultchange: (e: EngineKind) => void;
        smoothDiff: boolean;
        onsmoothDiffChange: (v: boolean) => void;
        crossingMin: boolean;
        oncrossingMinChange: (v: boolean) => void;
        secondaryUnion: boolean;
        onsecondaryUnionChange: (v: boolean) => void;
    }

    let {
        prefs,
        corner,
        oncornerchange,
        engine,
        onenginedefaultchange,
        smoothDiff,
        onsmoothDiffChange,
        crossingMin,
        oncrossingMinChange,
        secondaryUnion,
        onsecondaryUnionChange,
    }: Props = $props();

    type Tab = "appearance" | "layout" | "advanced";
    const TABS: { id: Tab; label: string }[] = [
        { id: "appearance", label: "appearance" },
        { id: "layout", label: "layout" },
        { id: "advanced", label: "advanced" },
    ];
    let tab = $state<Tab>("appearance");

    const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
        { value: "light", label: "light", icon: Sun },
        { value: "dark", label: "dark", icon: Moon },
        { value: "auto", label: "auto", icon: Monitor },
    ];

    const SIDE_OPTIONS: { value: InspectorSide; label: string; icon: typeof PanelLeft }[] = [
        { value: "left", label: "left", icon: PanelLeft },
        { value: "right", label: "right", icon: PanelRight },
    ];

    const CORNER_OPTIONS: { value: DockCorner; label: string; icon: typeof CornerDownLeft }[] = [
        { value: "tl", label: "top-left", icon: CornerUpLeft },
        { value: "tr", label: "top-right", icon: CornerUpRight },
        { value: "bl", label: "bottom-left", icon: CornerDownLeft },
        { value: "br", label: "bottom-right", icon: CornerDownRight },
    ];

    const ENGINE_OPTIONS: { value: EngineKind; label: string; icon: typeof Layers }[] = [
        { value: "family-view", label: "family view", icon: Network },
        { value: "layered", label: "layered", icon: Layers },
        { value: "hyperbolic", label: "hyperbolic", icon: CircleDot },
    ];
</script>

<div class="min-w-80">
<!-- tab bar -->
<div class="-mx-3 -mt-3 mb-4 flex shrink-0 border-b border-line px-2">
    {#each TABS as t (t.id)}
        <button
            type="button"
            onclick={() => (tab = t.id)}
            class="border-b-2 px-3 py-2.5 text-sm transition-colors {tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-fg-muted hover:text-fg'}"
        >
            {t.label}
        </button>
    {/each}
</div>

{#snippet iconRadio(
    legend: string,
    desc: string,
    options: { value: string; label: string; icon: typeof Sun }[],
    value: string,
    onchange: (v: string) => void,
)}
    <fieldset class="mb-4 last:mb-0">
        <legend class="text-fg-muted mb-0.5 text-[11px] uppercase tracking-wider">{legend}</legend>
        <p class="text-fg-muted mb-2 text-xs">{desc}</p>
        <div role="radiogroup" aria-label={legend} class="flex gap-1.5">
            {#each options as opt (opt.value)}
                {@const Icon = opt.icon}
                {@const active = value === opt.value}
                <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onclick={() => onchange(opt.value)}
                    class="hover:bg-canvas flex flex-1 flex-col items-center gap-1 rounded border px-2 py-2 text-xs"
                    class:border-accent={active}
                    class:text-accent={active}
                    class:border-line={!active}
                    class:text-fg-muted={!active}
                >
                    <Icon size={14} />
                    {opt.label}
                </button>
            {/each}
        </div>
    </fieldset>
{/snippet}

{#snippet toggleRow(label: string, desc: string, checked: boolean, onchange: () => void)}
    <div class="flex items-center justify-between border-b border-line py-2.5 last:border-0">
        <div class="mr-4 min-w-0">
            <p class="text-sm text-fg">{label}</p>
            <p class="mt-0.5 text-xs text-fg-muted">{desc}</p>
        </div>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onclick={onchange}
            class="fte-window-control shrink-0 {checked
                ? 'fte-window-control-on'
                : 'fte-window-control-off'}"
        >
            {#if checked}<Plus size={8} strokeWidth={2.5} />{:else}<Minus size={8} strokeWidth={2.5} />{/if}
        </button>
    </div>
{/snippet}

<!-- content -->
<div class="h-56 overflow-y-auto">
    {#if tab === "appearance"}
        {@render iconRadio("theme", "color scheme for the interface", THEME_OPTIONS, prefs.theme, (v) =>
            prefs.setTheme(v as Theme))}
        {@render iconRadio("dock corner", "where the dock panel appears on screen", CORNER_OPTIONS, corner, (v) =>
            oncornerchange(v as DockCorner))}
    {:else if tab === "layout"}
        {@render iconRadio("inspector side", "which side the inspector opens on", SIDE_OPTIONS, prefs.inspectorSide, (v) =>
            prefs.setInspectorSide(v as InspectorSide))}
        {@render iconRadio("default engine", "layout engine used when opening a tree", ENGINE_OPTIONS, engine, (v) =>
            onenginedefaultchange(v as EngineKind))}
    {:else if tab === "advanced"}
        {@render toggleRow("smooth diff animation", "animate transitions when the tree layout changes", smoothDiff, () =>
            onsmoothDiffChange(!smoothDiff))}
        {@render toggleRow("crossing minimisation", "reduce edge crossings in the layout (slower)", crossingMin, () =>
            oncrossingMinChange(!crossingMin))}
        {@render toggleRow("secondary union expansion", "expand secondary unions into separate rows", secondaryUnion, () =>
            onsecondaryUnionChange(!secondaryUnion))}
    {/if}
</div>
</div>
