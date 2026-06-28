<!--
    FamilyTreeEditor - settings body (theme + inspector side).
    body-only component: wrapped in DockDialog by the caller.

    auto-commits on change (no save/cancel, per design profile).

    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { Sun, Moon, Monitor, PanelLeft, PanelRight } from "@lucide/svelte";
    import type { PreferencesStore, Theme, InspectorSide } from "../../state/preferences.js";

    interface Props {
        prefs: PreferencesStore;
    }

    let { prefs }: Props = $props();

    const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
        { value: "light", label: "light", icon: Sun },
        { value: "dark", label: "dark", icon: Moon },
        { value: "auto", label: "auto", icon: Monitor },
    ];

    const SIDE_OPTIONS: { value: InspectorSide; label: string; icon: typeof PanelLeft }[] = [
        { value: "left", label: "left", icon: PanelLeft },
        { value: "right", label: "right", icon: PanelRight },
    ];
</script>

<div class="flex flex-col gap-4">
    <fieldset>
        <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider">
            theme
        </legend>
        <div role="radiogroup" aria-label="theme" class="flex gap-1.5">
            {#each THEME_OPTIONS as opt (opt.value)}
                {@const Icon = opt.icon}
                {@const active = prefs.theme === opt.value}
                <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    class="hover:bg-canvas flex flex-1 flex-col items-center gap-1 rounded border px-2 py-2 text-xs"
                    class:border-accent={active}
                    class:text-accent={active}
                    class:border-line={!active}
                    class:text-fg-muted={!active}
                    onclick={() => prefs.setTheme(opt.value)}
                >
                    <Icon size={14} />
                    {opt.label}
                </button>
            {/each}
        </div>
    </fieldset>

    <fieldset>
        <legend class="text-fg-muted mb-1.5 text-[11px] uppercase tracking-wider">
            inspector side
        </legend>
        <div role="radiogroup" aria-label="inspector side" class="flex gap-1.5">
            {#each SIDE_OPTIONS as opt (opt.value)}
                {@const Icon = opt.icon}
                {@const active = prefs.inspectorSide === opt.value}
                <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    class="hover:bg-canvas flex flex-1 flex-col items-center gap-1 rounded border px-2 py-2 text-xs"
                    class:border-accent={active}
                    class:text-accent={active}
                    class:border-line={!active}
                    class:text-fg-muted={!active}
                    onclick={() => prefs.setInspectorSide(opt.value)}
                >
                    <Icon size={14} />
                    {opt.label}
                </button>
            {/each}
        </div>
    </fieldset>
</div>
