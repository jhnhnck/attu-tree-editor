<!--
    FamilyTreeEditor - title-strip save-state pill (saved/saving/synced/failed/conflict)
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { AlertCircle, AlertTriangle, Check, Cloud, Loader2 } from "@lucide/svelte";

    type Tone = "saved" | "saving" | "synced" | "failed" | "conflict";

    interface Props {
        /** undefined when there has been no save yet this session */
        lastSavedAt: number | undefined;
        /** mapped from syncStore.mode + autosaver state */
        syncMode: "local" | "syncing" | "conflict";
        /** ms-window after a successful sync where we flash "Synced" */
        syncedFlashUntil: number | undefined;
        /** undefined unless the autosaver reported an error since last success */
        lastError: string | undefined;
        /**
         * tree-store dirty flag - true once the user has mutated the tree
         * since the last save / hydrate. lets us distinguish "loaded clean,
         * idle" (show "Saved") from "edited, pending flush" (show "Not saved
         * yet"). defaults to false so a fresh paint of a clean tree stays
         * silent until the first edit.
         */
        dirty?: boolean;
        onretry: () => void;
        onconflict: () => void;
        onforceSave: () => void;
    }

    let {
        lastSavedAt,
        syncMode,
        syncedFlashUntil,
        lastError,
        dirty = false,
        onretry,
        onconflict,
        onforceSave,
    }: Props = $props();

    // tick re-renders the relative timestamp every ~10s
    let tick = $state(Date.now());
    let popoverOpen = $state(false);
    let containerEl: HTMLDivElement | undefined = $state();
    let timer: ReturnType<typeof setInterval> | undefined;

    onMount(() => {
        timer = setInterval(() => (tick = Date.now()), 10_000);
        window.addEventListener("pointerdown", onWindowDown, true);
    });
    onDestroy(() => {
        if (timer !== undefined) clearInterval(timer);
        window.removeEventListener("pointerdown", onWindowDown, true);
    });

    function onWindowDown(e: PointerEvent): void {
        if (!popoverOpen || !containerEl) return;
        if (e.target instanceof Node && containerEl.contains(e.target)) return;
        popoverOpen = false;
    }

    function fmtRel(ts: number, now: number): string {
        const ms = Math.max(0, now - ts);
        const s = Math.floor(ms / 1000);
        if (s < 5) return "just now";
        if (s < 60) return `${String(s)}s ago`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${String(m)}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${String(h)}h ago`;
        const d = Math.floor(h / 24);
        return `${String(d)}d ago`;
    }

    const tone = $derived<Tone>(
        syncMode === "conflict"
            ? "conflict"
            : lastError
              ? "failed"
              : syncMode === "syncing"
                ? "saving"
                : syncedFlashUntil !== undefined && syncedFlashUntil > tick
                  ? "synced"
                  : "saved",
    );

    const label = $derived.by(() => {
        if (tone === "conflict") return "Conflict";
        if (tone === "failed") return "Save failed";
        if (tone === "saving") return "Saving…";
        if (tone === "synced") return "Synced";
        if (lastSavedAt === undefined) {
            // loaded clean and never edited - the tree on disk matches the
            // canvas, so we report "Saved" rather than the misleading "Not
            // saved yet". once the user mutates the tree, dirty flips true
            // and we surface the pending-flush state until the next save.
            return dirty ? "Not saved yet" : "Saved";
        }
        return `Saved · ${fmtRel(lastSavedAt, tick)}`;
    });

    const toneClass = $derived(
        tone === "saved"
            ? "text-emerald-400"
            : tone === "saving"
              ? "text-amber-400"
              : tone === "synced"
                ? "text-sky-400"
                : tone === "failed"
                  ? "text-rose-400"
                  : "text-amber-400",
    );

    function handleClick(): void {
        if (tone === "failed") {
            onretry();
            return;
        }
        if (tone === "conflict") {
            onconflict();
            return;
        }
        popoverOpen = !popoverOpen;
    }
</script>

<div bind:this={containerEl} class="relative">
    <button
        type="button"
        class="fte-pill gap-1.5"
        title={label}
        aria-label="save status: {label}"
        onclick={handleClick}
    >
        <span class={toneClass}>
            {#if tone === "saving"}
                <Loader2 size={12} class="animate-spin" />
            {:else if tone === "synced"}
                <Cloud size={12} />
            {:else if tone === "failed"}
                <AlertCircle size={12} />
            {:else if tone === "conflict"}
                <AlertTriangle size={12} />
            {:else}
                <Check size={12} />
            {/if}
        </span>
        <span class={tone === "saved" ? "text-fg-muted" : toneClass}>{label}</span>
    </button>

    {#if popoverOpen}
        <div
            class="bg-canvas-elev border-line absolute bottom-full left-0 z-40 mb-1 w-64 rounded-md border p-3 text-xs shadow-xl"
            role="dialog"
            aria-label="save details"
        >
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt class="text-fg-muted">last saved</dt>
                <dd class="text-fg">
                    {lastSavedAt === undefined ? "never" : fmtRel(lastSavedAt, tick)}
                </dd>
                <dt class="text-fg-muted">sync</dt>
                <dd class="text-fg">{syncMode}</dd>
                {#if lastError}
                    <dt class="text-rose-400">error</dt>
                    <dd class="text-rose-400 break-words">{lastError}</dd>
                {/if}
            </dl>
            <button
                type="button"
                class="bg-accent text-canvas hover:bg-accent-strong mt-3 w-full rounded px-2 py-1 text-xs font-semibold"
                onclick={() => {
                    popoverOpen = false;
                    onforceSave();
                }}
            >
                Force save
            </button>
        </div>
    {/if}
</div>
