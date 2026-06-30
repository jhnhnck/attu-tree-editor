<!--
    wiki-editor preferences body — body-only, wrapped in DockDialog by App.svelte.
    close is handled by DockDialog's × button.
-->
<script lang="ts">
    import {
        Sun,
        Moon,
        Monitor,
        CornerUpLeft,
        CornerUpRight,
        CornerDownLeft,
        CornerDownRight,
    } from "@lucide/svelte";
    import type { WikiPreferencesStore, Theme, DockCorner } from "./state/preferences.svelte.js";

    interface Props {
        prefs: WikiPreferencesStore;
    }
    let { prefs }: Props = $props();

    type Tab = "appearance" | "editor" | "autosave" | "preview";

    const TABS: { id: Tab; label: string }[] = [
        { id: "appearance", label: "Appearance" },
        { id: "editor", label: "Editor" },
        { id: "autosave", label: "Autosave" },
        { id: "preview", label: "Preview" },
    ];

    let tab = $state<Tab>("appearance");

    const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
        { value: "light", label: "light", icon: Sun },
        { value: "dark", label: "dark", icon: Moon },
        { value: "auto", label: "auto", icon: Monitor },
    ];

    const CORNER_OPTIONS: {
        value: DockCorner;
        label: string;
        icon: typeof CornerDownLeft;
    }[] = [
        { value: "tl", label: "top-left", icon: CornerUpLeft },
        { value: "tr", label: "top-right", icon: CornerUpRight },
        { value: "bl", label: "bottom-left", icon: CornerDownLeft },
        { value: "br", label: "bottom-right", icon: CornerDownRight },
    ];

    const FONT_FAMILIES = ["JetBrains Mono", "Fira Code", "Cascadia Code", "monospace"] as const;
    const FONT_SIZES = ["12px", "13px", "14px", "15px", "16px"] as const;
    const TAB_SIZES = ["2", "4"] as const;
    const SYNTAX_THEMES = [
        "Attu Dark",
        "Attu Light",
        "Nord",
        "Dracula",
        "Solarized Dark",
    ] as const;
    const AUTOSAVE_INTERVALS = ["30 seconds", "1 minute", "2 minutes", "5 minutes"] as const;
    const AUTOSAVE_STORAGE = ["Browser storage", "Session only"] as const;
    const PREVIEW_MODES = ["Editor only", "Side-by-side", "Preview only"] as const;
    const PREVIEW_TRIGGERS = ["On save", "On typing (delay)", "Manual"] as const;
    const PREVIEW_THEMES = ["Match site theme", "Light", "Dark"] as const;
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
    options: { value: string; label: string; icon: typeof Sun }[],
    value: string,
    onchange: (v: string) => void,
)}
    <fieldset class="mb-4">
        <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider">{legend}</legend>
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

{#snippet toggleRow(label: string, checked: boolean, onchange: () => void)}
    <div class="flex items-center justify-between border-b border-line py-2.5 last:border-0">
        <span class="text-sm text-fg">{label}</span>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onclick={onchange}
            class="relative h-5 w-9 rounded-full border transition-colors {checked
                ? 'border-accent bg-accent/10'
                : 'border-line bg-canvas'}"
        >
            <div
                class="absolute top-[3px] h-3.5 w-3.5 rounded-full transition-[left] {checked
                    ? 'left-5 bg-accent'
                    : 'left-0.5 bg-fg-muted'}"
            ></div>
        </button>
    </div>
{/snippet}

{#snippet selectRow(
    label: string,
    options: readonly string[],
    selected: string,
    onchange: (v: string) => void,
    disabled?: boolean,
)}
    <div
        class="flex items-center justify-between border-b border-line py-2.5 last:border-0"
        class:opacity-50={disabled}
    >
        <span class="text-sm text-fg">{label}</span>
        <select
            class="rounded border border-line bg-canvas px-2 py-1 text-xs text-fg disabled:cursor-not-allowed"
            {disabled}
            onchange={(e) => onchange((e.target as HTMLSelectElement).value)}
        >
            {#each options as opt (opt)}
                <option value={opt} selected={opt === selected}>{opt}</option>
            {/each}
        </select>
    </div>
{/snippet}

<!-- content area -->
<div class="h-56 overflow-y-auto">
    {#if tab === "appearance"}
        {@render iconRadio("theme", THEME_OPTIONS, prefs.theme, (v) =>
            prefs.setTheme(v as Theme))}
        {@render iconRadio("dock corner", CORNER_OPTIONS, prefs.corner, (v) =>
            prefs.setCorner(v as DockCorner))}
    {:else if tab === "editor"}
        <fieldset class="mb-4">
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider">text</legend>
            {@render selectRow("Font family", FONT_FAMILIES, prefs.fontFamily, (v) =>
                prefs.setFontFamily(v))}
            {@render selectRow("Font size", FONT_SIZES, prefs.fontSize, (v) =>
                prefs.setFontSize(v))}
        </fieldset>
        <fieldset class="mb-4">
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider"
                >editing</legend
            >
            {@render selectRow("Tab size", TAB_SIZES, prefs.tabSize, (v) => prefs.setTabSize(v))}
            {@render toggleRow("Line wrap", prefs.lineWrap, () =>
                prefs.setLineWrap(!prefs.lineWrap))}
            {@render toggleRow("Line numbers", prefs.lineNumbers, () =>
                prefs.setLineNumbers(!prefs.lineNumbers))}
            {@render toggleRow("Minimap", prefs.minimap, () => prefs.setMinimap(!prefs.minimap))}
            {@render toggleRow("Bracket matching", prefs.bracketMatching, () =>
                prefs.setBracketMatching(!prefs.bracketMatching))}
            {@render toggleRow("Trim trailing whitespace", prefs.trimTrailingWhitespace, () =>
                prefs.setTrimTrailingWhitespace(!prefs.trimTrailingWhitespace))}
        </fieldset>
        <fieldset>
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider"
                >syntax</legend
            >
            {@render selectRow("Syntax theme", SYNTAX_THEMES, prefs.syntaxTheme, (v) =>
                prefs.setSyntaxTheme(v))}
        </fieldset>
    {:else if tab === "autosave"}
        <fieldset>
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider"
                >autosave</legend
            >
            {@render toggleRow("Enable autosave", prefs.autosaveEnabled, () =>
                prefs.setAutosaveEnabled(!prefs.autosaveEnabled))}
            {@render selectRow(
                "Interval",
                AUTOSAVE_INTERVALS,
                prefs.autosaveInterval,
                (v) => prefs.setAutosaveInterval(v),
                !prefs.autosaveEnabled,
            )}
            {@render selectRow(
                "Storage",
                AUTOSAVE_STORAGE,
                prefs.autosaveStorage,
                (v) => prefs.setAutosaveStorage(v),
                !prefs.autosaveEnabled,
            )}
        </fieldset>
    {:else if tab === "preview"}
        <fieldset>
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider"
                >preview</legend
            >
            {@render selectRow("Default mode", PREVIEW_MODES, prefs.previewMode, (v) =>
                prefs.setPreviewMode(v))}
            {@render selectRow("Update trigger", PREVIEW_TRIGGERS, prefs.previewTrigger, (v) =>
                prefs.setPreviewTrigger(v))}
            {@render selectRow("Preview theme", PREVIEW_THEMES, prefs.previewTheme, (v) =>
                prefs.setPreviewTheme(v))}
        </fieldset>
    {/if}
</div>
</div>
