<!--
    FamilyTreeEditor - title-strip save-state pill (saved/saving/synced/failed/conflict)
    licensed under the MIT license; see LICENSE.md for full text

    canvas-window-manager phase 4: the pill renders TWO lucide glyphs
    inline — local (`laptop-minimal` when dirty / `laptop-minimal-check`
    when persisted) and remote (`cloud` idle / `cloud-check` synced /
    `cloud-off` unsync-configured / `cloud-upload` while syncing). this
    splits the two pieces of "is my work safe?" that previously
    collapsed into one indicator — local persistence (dexie / disk)
    and remote sync (server). title/aria-label describes both states.

    canvas-window-manager phase 0: the popover body has moved into a
    sibling <Window> registered as kind="window" priority=15
    forceCollapsible=false. open/close state lives in the caller
    (App.svelte) as `popoverOpen` and is mirrored as the Window's
    `expanded` prop. this component is now ONLY the trigger pill —
    the caller wires `onPopoverToggle` to flip the shared state.
-->
<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import {
        AlertCircle,
        AlertTriangle,
        Cloud,
        CloudCheck,
        CloudOff,
        CloudUpload,
        LaptopMinimal,
        LaptopMinimalCheck,
    } from "@lucide/svelte";

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
         * idle" (show persisted glyph) from "edited, pending flush" (show
         * dirty glyph).
         */
        dirty?: boolean;
        /** true when the user is signed in / a remote sync target exists. when false, remote glyph reads `cloud-off`. */
        remoteConfigured?: boolean;
        /** controlled popover-open state; mirrors expanded on the Window */
        popoverOpen: boolean;
        /** caller flips popoverOpen on trigger-pill click */
        onPopoverToggle: () => void;
        onretry: () => void;
        onconflict: () => void;
    }

    // lastSavedAt is part of the prop contract (caller threads it
    // identically across the pre/post phase-4 surfaces) but the pill
    // itself no longer renders the relative timestamp — that moved
    // into the Window body. kept here so the body's `fmtRelSimple`
    // path doesn't fork its props from this component.
    let {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- prop contract preserved; relative-timestamp rendering moved into the Window body
        lastSavedAt: _lastSavedAt,
        syncMode,
        syncedFlashUntil,
        lastError,
        dirty = false,
        remoteConfigured = false,
        popoverOpen,
        onPopoverToggle,
        onretry,
        onconflict,
    }: Props = $props();

    // tick re-renders the relative timestamp every ~10s
    let tick = $state(Date.now());
    let timer: ReturnType<typeof setInterval> | undefined;

    onMount(() => {
        timer = setInterval(() => (tick = Date.now()), 10_000);
    });
    onDestroy(() => {
        if (timer !== undefined) clearInterval(timer);
    });

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

    // local-state glyph: dirty = laptop-minimal (pending flush);
    // clean = laptop-minimal-check (persisted to dexie).
    const localPersisted = $derived(!dirty);
    const localLabel = $derived(localPersisted ? "saved locally" : "unsaved local changes");

    // remote-state glyph: priority order is
    //   conflict -> alert-triangle (handled via toneClass / tone branch)
    //   failed   -> alert-circle
    //   syncing  -> cloud-upload
    //   synced   -> cloud-check (briefly after a successful push)
    //   remote configured + idle -> cloud
    //   no remote target -> cloud-off
    const remoteLabel = $derived.by(() => {
        if (tone === "conflict") return "remote conflict";
        if (tone === "failed") return "remote save failed";
        if (tone === "saving") return "syncing to remote";
        if (tone === "synced") return "synced to remote";
        if (!remoteConfigured) return "no remote sync";
        return "remote idle";
    });

    const ariaLabel = $derived(`save status: ${localLabel}; ${remoteLabel}`);
    const title = $derived(`${localLabel} · ${remoteLabel}`);

    const remoteToneClass = $derived(
        tone === "conflict"
            ? "text-amber-400"
            : tone === "failed"
              ? "text-rose-400"
              : tone === "saving"
                ? "text-amber-400"
                : tone === "synced"
                  ? "text-sky-400"
                  : remoteConfigured
                    ? "text-fg-muted"
                    : "text-fg-muted",
    );
    const localToneClass = $derived(localPersisted ? "text-emerald-400" : "text-amber-400");

    function handleClick(): void {
        if (tone === "failed") {
            onretry();
            return;
        }
        if (tone === "conflict") {
            onconflict();
            return;
        }
        onPopoverToggle();
    }
</script>

<div class="relative" data-testid="save-status-pill">
    <button
        type="button"
        class="fte-pill gap-1.5"
        {title}
        aria-label={ariaLabel}
        aria-expanded={popoverOpen}
        onclick={handleClick}
    >
        <span
            class={localToneClass}
            data-testid="save-status-local-glyph"
            data-state={localPersisted ? "persisted" : "dirty"}
        >
            {#if localPersisted}
                <LaptopMinimalCheck size={12} />
            {:else}
                <LaptopMinimal size={12} />
            {/if}
        </span>
        <span class={remoteToneClass} data-testid="save-status-remote-glyph" data-state={tone}>
            {#if tone === "conflict"}
                <AlertTriangle size={12} />
            {:else if tone === "failed"}
                <AlertCircle size={12} />
            {:else if tone === "saving"}
                <CloudUpload size={12} />
            {:else if tone === "synced"}
                <CloudCheck size={12} />
            {:else if remoteConfigured}
                <Cloud size={12} />
            {:else}
                <CloudOff size={12} />
            {/if}
        </span>
    </button>
</div>
