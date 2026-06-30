<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
    import { untrack } from "svelte";

    interface Props {
        kind: "wikilink" | "external-link";
        x: number;
        y: number;
        initialPrimary: string;
        onconfirm: (primary: string, secondary: string) => void;
        oncancel: () => void;
    }

    let { kind, x, y, initialPrimary, onconfirm, oncancel }: Props = $props();

    // form fields are seeded once from props on open, then locally editable -
    // they must not resync if the (never-changing, fresh-mounted-per-open) props change
    let primary = $state(untrack(() => initialPrimary));
    let secondary = $state("");

    let panelEl: HTMLDivElement | undefined = $state();
    let primaryInputEl: HTMLInputElement | undefined = $state();
    let clampedLeft = $state(untrack(() => x));
    let clampedTop = $state(untrack(() => y));

    const primaryLabel = $derived(kind === "wikilink" ? "target" : "url");
    const secondaryLabel = $derived(kind === "wikilink" ? "display text" : "label");

    $effect(() => {
        primaryInputEl?.focus();
    });

    $effect(() => {
        if (!panelEl) return;
        const rect = panelEl.getBoundingClientRect();
        const margin = 8;
        clampedLeft = Math.min(Math.max(margin, x), window.innerWidth - rect.width - margin);
        clampedTop = Math.min(y, window.innerHeight - rect.height - margin);
    });

    function handleKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            event.preventDefault();
            oncancel();
        } else if (event.key === "Enter") {
            event.preventDefault();
            onconfirm(primary, secondary);
        }
    }
</script>

<div class="fixed inset-0 z-40" role="presentation" aria-hidden="true" onclick={oncancel}></div>
<div
    bind:this={panelEl}
    class="fixed z-50 flex w-64 flex-col gap-2 rounded border border-line bg-canvas-elev p-3 shadow-lg"
    style="left: {clampedLeft}px; top: {clampedTop}px"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={kind === "wikilink" ? "insert wikilink" : "insert external link"}
    onkeydown={handleKeydown}
>
    <label class="flex flex-col gap-1 text-xs text-fg-muted">
        {primaryLabel}
        <input
            bind:this={primaryInputEl}
            type="text"
            class="rounded border border-line bg-canvas px-2 py-1 text-xs text-fg outline-none focus:border-accent"
            bind:value={primary}
        />
    </label>
    <label class="flex flex-col gap-1 text-xs text-fg-muted">
        {secondaryLabel}
        <input
            type="text"
            class="rounded border border-line bg-canvas px-2 py-1 text-xs text-fg outline-none focus:border-accent"
            bind:value={secondary}
        />
    </label>
    <div class="flex justify-end gap-2 pt-1">
        <button
            type="button"
            class="rounded px-2 py-1 text-xs text-fg-muted hover:bg-canvas"
            onclick={oncancel}
        >
            cancel
        </button>
        <button
            type="button"
            class="rounded bg-accent px-2 py-1 text-xs text-white hover:opacity-90"
            onclick={() => onconfirm(primary, secondary)}
        >
            insert
        </button>
    </div>
</div>
