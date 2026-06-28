<!-- SPDX-License-Identifier: MIT -->
<!--
    registration bridge between App.svelte markup snippets and dockStore.
    exists for the same reason as the old DockRegistration: Svelte 5
    top-level {#snippet} declarations are template-scoped and cannot be
    addressed from a script-block $effect, so wrapping the call in a tiny
    component is the only way to keep registration colocated with the snippet.

    prev-comparison optimization carried forward from old DockRegistration
    phase-4 fix: Svelte 5 gives each {#snippet} a NEW function identity on
    every parent render, so without the guard updateItem fans on every tick.
    compare field-by-field; call updateItem only when something changed.

    renders nothing.
-->
<script lang="ts">
    import { untrack } from "svelte";
    import { dockStore, type DockCorner, type DockKind, type DockRenderSnippet } from "./store.svelte.js";

    interface Props {
        id: string;
        kind: DockKind;
        corner: DockCorner;
        priority: number;
        render: DockRenderSnippet;
        panelId?: string | undefined;
        closeable?: boolean | undefined;
        persistent?: boolean | undefined;
        title?: string | undefined;
        focusedAt?: number | undefined;
        order?: number | undefined;
    }

    let { id, kind, corner, priority, render, panelId, closeable, persistent, title, focusedAt, order }: Props = $props();

    // mount-only register / unmount-only unregister — id is immutable per
    // instance (parent re-mounts if it changes).
    $effect(() => {
        untrack(() => dockStore.register({ id, kind, corner, priority, render, panelId, closeable, persistent, title, focusedAt, order }));
        return () => untrack(() => dockStore.unregister(id));
    });

    // prev-comparison guard: only call updateItem when a meaningful prop
    // actually changed. snippet identity is NOT stable across parent
    // re-renders in Svelte 5 — this guard is what keeps updateItem from
    // fanning on every App.svelte tick.
    let prev:
        | {
              corner: DockCorner;
              priority: number;
              kind: DockKind;
              render: DockRenderSnippet;
              panelId: string | undefined;
              closeable: boolean | undefined;
              persistent: boolean | undefined;
              title: string | undefined;
              focusedAt: number | undefined;
              order: number | undefined;
          }
        | undefined;

    $effect(() => {
        const next = { corner, priority, kind, render, panelId, closeable, persistent, title, focusedAt, order };
        if (
            prev !== undefined &&
            prev.corner === next.corner &&
            prev.priority === next.priority &&
            prev.kind === next.kind &&
            prev.render === next.render &&
            prev.panelId === next.panelId &&
            prev.closeable === next.closeable &&
            prev.persistent === next.persistent &&
            prev.title === next.title &&
            prev.focusedAt === next.focusedAt &&
            prev.order === next.order
        ) {
            return;
        }
        prev = next;
        untrack(() => dockStore.updateItem(id, next));
    });
</script>
