<!-- SPDX-License-Identifier: MIT -->
<!--
    one-line bridge between markup-defined snippets and the
    dockRegistry. takes the id / corner / priority / kind / render
    snippet as props and handles the register / unregister lifecycle
    via $effect. this exists because svelte 5 top-level
    `{#snippet}` declarations are template-scoped and therefore not
    addressable from a script-block $effect — wrapping the call in a
    tiny component is the cleanest way to keep registration colocated
    with the snippet that backs it.

    no output. the wrapper renders nothing; the actual paint happens
    when CanvasChromeDock invokes `render()` from inside the matching
    corner's container.

    Window↔dockRegistry boundary (canvas-window-manager phase 0):
    callers wrap `<Window>` INSIDE `<DockRegistration kind="window">`,
    not the other way around. the `Window` primitive never calls
    `register()` itself — top-level `{#snippet}` declarations aren't
    addressable from a script $effect (that's why this shim exists in
    the first place), and Window swallowing registration would force
    callers off the snippet pattern that backs every other dock entry.
    `focusedAt` is owned by `windowManager.svelte.ts`; it propagates
    here via the same `updateItem` path the other ancillary fields
    use so the dock's sort sees the post-focus value on the next
    derived-run.
-->
<script lang="ts">
    import { untrack } from "svelte";
    import {
        register,
        unregister,
        updateItem,
        type DockCorner,
        type DockKind,
        type DockRenderSnippet,
    } from "./dockRegistry.svelte";

    interface Props {
        id: string;
        corner: DockCorner;
        priority: number;
        kind: DockKind;
        render: DockRenderSnippet;
        // mirrors DockItem.forceCollapsible. omit for the default
        // (true) behaviour; pass `false` to opt the item out of the
        // dock's force-collapse pass (primary control surfaces).
        // accepts `undefined` for callers that pass the field through
        // generically (e.g. test fixtures).
        forceCollapsible?: boolean | undefined;
        // mirrors DockItem.focusedAt. only meaningful when
        // kind="window"; callers pass the windowManager's focus
        // timestamp here so the dock's itemsForCorner sort can use
        // it as a within-priority desc tiebreaker. omitted for pills
        // and non-window panels.
        focusedAt?: number | undefined;
        // mirrors DockItem.windowId. taskbar model (phase 6): for a
        // pill, the id of the window it represents, so `reorderPills`
        // can mirror the pill row's order onto the docked window stack.
        // omitted for windows / panels.
        windowId?: string | undefined;
    }

    let { id, corner, priority, kind, render, forceCollapsible, focusedAt, windowId }: Props =
        $props();

    // mount-only register / unmount-only unregister, untracked so the
    // map mutation doesn't enter this effect's own dep set and trigger
    // update_depth_exceeded once the dock's $derived re-runs against
    // the same map. id never changes for a given instance (parent
    // re-mounts the component if it does), so the mount-only register
    // suffices.
    $effect(() => {
        untrack(() =>
            register({ id, corner, priority, kind, render, forceCollapsible, focusedAt, windowId }),
        );
        return () => untrack(() => unregister(id));
    });

    // ancillary prop changes (priority / kind / render snippet swap)
    // patch the existing entry in place rather than unregister-and-
    // register, again wrapped in untrack so the map mutation does not
    // re-enter this effect. corner is treated as immutable per item;
    // callers swap the id if they need to move corners.
    //
    // canvas-window-manager phase 4 lag fix (per phase-0 verdict D):
    // pre-fix, this $effect allocated a fresh `next` object literal
    // every time ANY of its reactive deps churned (and `render` is a
    // fresh snippet identity on every parent render in svelte 5),
    // which fanned `updateItem` calls across the registry on every
    // App.svelte tick. on cramped viewports with ~10 dock items the
    // resulting derive cascade dominated debug-menu open latency.
    // fix: compare component by component against the last-written
    // values and skip updateItem when nothing meaningful changed.
    // identity-equality on `render` (a snippet) suffices — svelte
    // gives each {#snippet} a stable identity within a parent scope.
    let prev:
        | {
              corner: DockCorner;
              priority: number;
              kind: DockKind;
              render: DockRenderSnippet;
              forceCollapsible: boolean | undefined;
              focusedAt: number | undefined;
              windowId: string | undefined;
          }
        | undefined;
    $effect(() => {
        // establish reactive deps explicitly so svelte re-runs us.
        const next = { corner, priority, kind, render, forceCollapsible, focusedAt, windowId };
        if (
            prev !== undefined &&
            prev.corner === next.corner &&
            prev.priority === next.priority &&
            prev.kind === next.kind &&
            prev.render === next.render &&
            prev.forceCollapsible === next.forceCollapsible &&
            prev.focusedAt === next.focusedAt &&
            prev.windowId === next.windowId
        ) {
            return;
        }
        prev = next;
        untrack(() => updateItem(id, next));
    });
</script>
