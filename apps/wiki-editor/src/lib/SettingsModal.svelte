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

    type Tab = "appearance" | "editor" | "autosave" | "preview";

    const TABS: { id: Tab; label: string }[] = [
        { id: "appearance", label: "Appearance" },
        { id: "editor", label: "Editor" },
        { id: "autosave", label: "Autosave" },
        { id: "preview", label: "Preview" },
    ];

    let tab = $state<Tab>("appearance");

    // --- appearance ---
    type Theme = "light" | "dark" | "auto";
    type DockCorner = "bl" | "tl" | "tr" | "br";

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

    let theme = $state<Theme>("auto");
    let corner = $state<DockCorner>("bl");

    // --- editor ---
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

    let fontFamily = $state<string>("JetBrains Mono");
    let fontSize = $state<string>("14px");
    let tabSize = $state<string>("4");
    let syntaxTheme = $state<string>("Attu Dark");
    let lineWrap = $state(false);
    let lineNumbers = $state(true);
    let minimap = $state(false);
    let bracketMatching = $state(true);
    let trimTrailingWhitespace = $state(true);

    // --- autosave ---
    const AUTOSAVE_INTERVALS = ["30 seconds", "1 minute", "2 minutes", "5 minutes"] as const;
    const AUTOSAVE_STORAGE = ["Browser storage", "Session only"] as const;

    let autosaveEnabled = $state(false);
    let autosaveInterval = $state<string>("1 minute");
    let autosaveStorage = $state<string>("Browser storage");

    // --- preview ---
    const PREVIEW_MODES = ["Editor only", "Side-by-side", "Preview only"] as const;
    const PREVIEW_TRIGGERS = ["On save", "On typing (delay)", "Manual"] as const;
    const PREVIEW_THEMES = ["Match site theme", "Light", "Dark"] as const;

    let previewMode = $state<string>("Editor only");
    let previewTrigger = $state<string>("On save");
    let previewTheme = $state<string>("Match site theme");
</script>

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
<div class="min-h-0 overflow-y-auto">
    {#if tab === "appearance"}
        {@render iconRadio("theme", THEME_OPTIONS, theme, (v) => (theme = v as Theme))}
        {@render iconRadio("dock corner", CORNER_OPTIONS, corner, (v) => (corner = v as DockCorner))}
    {:else if tab === "editor"}
        <fieldset class="mb-4">
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider">text</legend>
            {@render selectRow("Font family", FONT_FAMILIES, fontFamily, (v) => (fontFamily = v))}
            {@render selectRow("Font size", FONT_SIZES, fontSize, (v) => (fontSize = v))}
        </fieldset>
        <fieldset class="mb-4">
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider"
                >editing</legend
            >
            {@render selectRow("Tab size", TAB_SIZES, tabSize, (v) => (tabSize = v))}
            {@render toggleRow("Line wrap", lineWrap, () => (lineWrap = !lineWrap))}
            {@render toggleRow("Line numbers", lineNumbers, () => (lineNumbers = !lineNumbers))}
            {@render toggleRow("Minimap", minimap, () => (minimap = !minimap))}
            {@render toggleRow(
                "Bracket matching",
                bracketMatching,
                () => (bracketMatching = !bracketMatching),
            )}
            {@render toggleRow(
                "Trim trailing whitespace",
                trimTrailingWhitespace,
                () => (trimTrailingWhitespace = !trimTrailingWhitespace),
            )}
        </fieldset>
        <fieldset>
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider"
                >syntax</legend
            >
            {@render selectRow(
                "Syntax theme",
                SYNTAX_THEMES,
                syntaxTheme,
                (v) => (syntaxTheme = v),
            )}
        </fieldset>
    {:else if tab === "autosave"}
        <fieldset>
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider"
                >autosave</legend
            >
            {@render toggleRow(
                "Enable autosave",
                autosaveEnabled,
                () => (autosaveEnabled = !autosaveEnabled),
            )}
            {@render selectRow(
                "Interval",
                AUTOSAVE_INTERVALS,
                autosaveInterval,
                (v) => (autosaveInterval = v),
                !autosaveEnabled,
            )}
            {@render selectRow(
                "Storage",
                AUTOSAVE_STORAGE,
                autosaveStorage,
                (v) => (autosaveStorage = v),
                !autosaveEnabled,
            )}
        </fieldset>
    {:else if tab === "preview"}
        <fieldset>
            <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider"
                >preview</legend
            >
            {@render selectRow("Default mode", PREVIEW_MODES, previewMode, (v) => (previewMode = v))}
            {@render selectRow(
                "Update trigger",
                PREVIEW_TRIGGERS,
                previewTrigger,
                (v) => (previewTrigger = v),
            )}
            {@render selectRow(
                "Preview theme",
                PREVIEW_THEMES,
                previewTheme,
                (v) => (previewTheme = v),
            )}
        </fieldset>
    {/if}
</div>
