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
        Plus,
        Minus,
        ChevronDown,
    } from "@lucide/svelte";
    import type { WikiPreferencesStore, Theme, DockCorner } from "./state/preferences.svelte.js";

    interface Props {
        prefs: WikiPreferencesStore;
    }
    let { prefs }: Props = $props();

    type Tab = "appearance" | "editor" | "autosave" | "preview";

    const TABS: { id: Tab; label: string }[] = [
        { id: "appearance", label: "appearance" },
        { id: "editor", label: "editor" },
        { id: "autosave", label: "autosave" },
        { id: "preview", label: "preview" },
    ];

    let tab = $state<Tab>("appearance");
    let openSelect = $state<string | null>(null);

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

{#snippet selectRow(
    label: string,
    desc: string,
    options: readonly string[],
    selected: string,
    onchange: (v: string) => void,
    disabled?: boolean,
)}
    <div
        class="flex items-center justify-between border-b border-line py-2.5 last:border-0"
        class:opacity-50={disabled}
    >
        <div class="mr-4 min-w-0">
            <p class="text-sm text-fg">{label}</p>
            <p class="mt-0.5 text-xs text-fg-muted">{desc}</p>
        </div>
        <div class="relative shrink-0">
            <button
                type="button"
                disabled={disabled}
                class="flex h-6 min-w-28 items-center justify-between gap-2 rounded px-2 text-xs text-fg hover:bg-canvas disabled:cursor-not-allowed"
                onclick={() => { if (!disabled) openSelect = openSelect === label ? null : label; }}
            >
                {selected}<ChevronDown size={10} strokeWidth={2} />
            </button>
            {#if openSelect === label}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="fixed inset-0 z-40"
                    onclick={() => { openSelect = null; }}
                    onkeydown={() => {}}
                ></div>
                <div class="absolute right-0 top-full z-50 mt-0.5 min-w-28 rounded border border-line bg-canvas-elev py-1 shadow-lg">
                    {#each options as opt (opt)}
                        <button
                            type="button"
                            class="flex w-full items-center px-3 py-1 text-left text-xs {opt === selected
                                ? 'text-accent'
                                : 'text-fg hover:bg-canvas'}"
                            onclick={() => { onchange(opt); openSelect = null; }}
                        >
                            {opt}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/snippet}

<!-- content area -->
<div class="h-56 overflow-y-auto">
    {#if tab === "appearance"}
        {@render iconRadio("theme", "color scheme for the interface", THEME_OPTIONS, prefs.theme, (v) =>
            prefs.setTheme(v as Theme))}
        {@render iconRadio("dock corner", "where the dock panel appears on screen", CORNER_OPTIONS, prefs.corner, (v) =>
            prefs.setCorner(v as DockCorner))}
    {:else if tab === "editor"}
        <fieldset class="mb-4">
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider">text</legend>
            {@render selectRow("font family", "monospace font used in the editor", FONT_FAMILIES, prefs.fontFamily, (v) =>
                prefs.setFontFamily(v))}
            {@render selectRow("font size", "editor text size", FONT_SIZES, prefs.fontSize, (v) =>
                prefs.setFontSize(v))}
        </fieldset>
        <fieldset class="mb-4">
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider">editing</legend>
            {@render selectRow("tab size", "spaces inserted when tab key is pressed", TAB_SIZES, prefs.tabSize, (v) =>
                prefs.setTabSize(v))}
            {@render toggleRow("line wrap", "wrap long lines to the visible width", prefs.lineWrap, () =>
                prefs.setLineWrap(!prefs.lineWrap))}
            {@render toggleRow("line numbers", "show line numbers in the left gutter", prefs.lineNumbers, () =>
                prefs.setLineNumbers(!prefs.lineNumbers))}
            {@render toggleRow("minimap", "show a miniature overview of the document", prefs.minimap, () =>
                prefs.setMinimap(!prefs.minimap))}
            {@render toggleRow("bracket matching", "highlight matching brackets", prefs.bracketMatching, () =>
                prefs.setBracketMatching(!prefs.bracketMatching))}
            {@render toggleRow("trim trailing whitespace", "remove trailing spaces on save", prefs.trimTrailingWhitespace, () =>
                prefs.setTrimTrailingWhitespace(!prefs.trimTrailingWhitespace))}
        </fieldset>
        <fieldset>
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider">syntax</legend>
            {@render selectRow("syntax theme", "color scheme for wikitext syntax highlighting", SYNTAX_THEMES, prefs.syntaxTheme, (v) =>
                prefs.setSyntaxTheme(v))}
        </fieldset>
    {:else if tab === "autosave"}
        <fieldset>
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider">autosave</legend>
            {@render toggleRow("enable autosave", "periodically save editor content to storage", prefs.autosaveEnabled, () =>
                prefs.setAutosaveEnabled(!prefs.autosaveEnabled))}
            {@render selectRow(
                "interval",
                "how often the editor content is saved",
                AUTOSAVE_INTERVALS,
                prefs.autosaveInterval,
                (v) => prefs.setAutosaveInterval(v),
                !prefs.autosaveEnabled,
            )}
            {@render selectRow(
                "storage",
                "where saves are kept; session only = cleared on tab close",
                AUTOSAVE_STORAGE,
                prefs.autosaveStorage,
                (v) => prefs.setAutosaveStorage(v),
                !prefs.autosaveEnabled,
            )}
        </fieldset>
    {:else if tab === "preview"}
        <fieldset>
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider">preview</legend>
            {@render selectRow("default mode", "how the editor and preview are laid out when you open a page", PREVIEW_MODES, prefs.previewMode, (v) =>
                prefs.setPreviewMode(v))}
            {@render selectRow("update trigger", "when the preview refreshes after changes", PREVIEW_TRIGGERS, prefs.previewTrigger, (v) =>
                prefs.setPreviewTrigger(v))}
            {@render selectRow("preview theme", "color scheme for the rendered preview", PREVIEW_THEMES, prefs.previewTheme, (v) =>
                prefs.setPreviewTheme(v))}
        </fieldset>
    {/if}
</div>
</div>
