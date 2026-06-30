<!--
    wiki-editor preferences body — body-only, wrapped in DockDialog by App.svelte.
    close is handled by DockDialog's × button.
-->
<script lang="ts">
    import { SHORTCUTS } from "./shortcuts.js";

    type Tab = "editor" | "autosave" | "preview" | "shortcuts" | "account";

    let tab = $state<Tab>("editor");

    const TABS: { id: Tab; label: string }[] = [
        { id: "editor", label: "Editor" },
        { id: "autosave", label: "Autosave" },
        { id: "preview", label: "Preview" },
        { id: "shortcuts", label: "Keyboard Shortcuts" },
        { id: "account", label: "Account" },
    ];
</script>

{#snippet toggleRow(label: string, checked: boolean)}
    <div class="flex items-center justify-between border-b border-line py-2.5">
        <span class="text-sm text-fg">{label}</span>
        <div
            class="relative h-5 w-9 cursor-default rounded-full border {checked
                ? 'border-accent bg-accent/10'
                : 'border-line bg-canvas'}"
        >
            <div
                class="absolute top-[3px] h-3.5 w-3.5 rounded-full {checked
                    ? 'left-5 bg-accent'
                    : 'left-0.5 bg-fg-muted'}"
            ></div>
        </div>
    </div>
{/snippet}

{#snippet selectRow(label: string, options: readonly string[], selected: string)}
    <div class="flex items-center justify-between border-b border-line py-2.5">
        <span class="text-sm text-fg">{label}</span>
        <select class="rounded border border-line bg-canvas px-2 py-1 text-xs text-fg">
            {#each options as opt (opt)}
                <option value={opt} selected={opt === selected}>{opt}</option>
            {/each}
        </select>
    </div>
{/snippet}

<!-- tab bar: negative margins to flush against DockDialog panel edges -->
<div class="-mx-3 -mt-3 mb-3 flex shrink-0 border-b border-line px-2">
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

<!-- content area -->
<div class="min-h-0 overflow-y-auto">
    {#if tab === "editor"}
        {@render selectRow(
            "Font family",
            ["JetBrains Mono", "Fira Code", "Cascadia Code", "monospace"],
            "JetBrains Mono",
        )}
        {@render selectRow("Font size", ["12px", "13px", "14px", "15px", "16px"], "14px")}
        {@render toggleRow("Line wrap", false)}
        {@render toggleRow("Line numbers", true)}
        {@render toggleRow("Minimap", false)}
        {@render toggleRow("Bracket matching", true)}
        {@render selectRow(
            "Syntax theme",
            ["Attu Dark", "Attu Light", "Nord", "Dracula", "Solarized Dark"],
            "Attu Dark",
        )}
        {@render selectRow("Tab size", ["2", "4"], "4")}
        <div class="border-b-0 py-2.5">
            {@render toggleRow("Trim trailing whitespace", true)}
        </div>
    {:else if tab === "autosave"}
        {@render toggleRow("Enable autosave", false)}
        {@render selectRow(
            "Interval",
            ["30 seconds", "1 minute", "2 minutes", "5 minutes"],
            "1 minute",
        )}
        {@render selectRow(
            "Storage",
            ["Browser storage", "Session only"],
            "Browser storage",
        )}
        <div class="py-4">
            <button
                type="button"
                disabled
                class="rounded border border-line px-3 py-1.5 text-sm text-fg-muted opacity-50"
            >
                View/restore drafts…
            </button>
        </div>
    {:else if tab === "preview"}
        {@render selectRow(
            "Default mode",
            ["Editor only", "Side-by-side", "Preview only"],
            "Editor only",
        )}
        {@render selectRow(
            "Update trigger",
            ["On save", "On typing (delay)", "Manual"],
            "On save",
        )}
        <div class="py-2.5">
            {@render selectRow(
                "Preview theme",
                ["Match site theme", "Light", "Dark"],
                "Match site theme",
            )}
        </div>
    {:else if tab === "shortcuts"}
        <div class="py-2">
            {#each SHORTCUTS as group (group.category)}
                <h3
                    class="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-wider text-fg-muted first:mt-0"
                >
                    {group.category}
                </h3>
                <table class="mb-2 w-full border-collapse text-sm">
                    <tbody>
                        {#each group.rows as row (row.keys)}
                            <tr class="border-b border-line last:border-0">
                                <td class="w-44 py-1.5 pr-4 font-mono text-xs text-fg"
                                    >{row.keys}</td
                                >
                                <td class="py-1.5 text-fg-muted">{row.action}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/each}
        </div>
        <div class="flex gap-2 py-4">
            <button
                type="button"
                disabled
                class="rounded border border-line px-3 py-1.5 text-sm text-fg-muted opacity-50"
            >
                Customize…
            </button>
            <button
                type="button"
                disabled
                class="rounded border border-line px-3 py-1.5 text-sm text-fg-muted opacity-50"
            >
                Reset to defaults
            </button>
        </div>
    {:else}
        <div class="flex flex-col items-center gap-4 py-10 text-center">
            <p class="text-sm text-fg-muted">Not signed in</p>
            <button
                type="button"
                disabled
                class="rounded border border-line px-4 py-1.5 text-sm text-fg-muted opacity-50"
            >
                Sign in
            </button>
        </div>
    {/if}
</div>

