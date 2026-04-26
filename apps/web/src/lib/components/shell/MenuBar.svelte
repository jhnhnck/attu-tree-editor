<!--
    FamilyTreeEditor - top-of-app menu bar (File / Edit / View / Insert / Tree / Help)
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import Menu from "./Menu.svelte";
    import type { MenuConfig } from "./menu";

    interface Props {
        menus: readonly MenuConfig[];
    }

    let { menus }: Props = $props();

    let openIdx = $state(-1);
    let containerEl: HTMLDivElement | undefined = $state();

    function open(i: number): void {
        openIdx = i;
    }
    function close(): void {
        openIdx = -1;
    }

    function navigate(direction: "left" | "right"): void {
        if (openIdx < 0) return;
        const n = menus.length;
        const next = direction === "left" ? (openIdx - 1 + n) % n : (openIdx + 1) % n;
        openIdx = next;
    }

    function onWindowDown(e: PointerEvent): void {
        if (openIdx < 0) return;
        if (!containerEl) return;
        if (e.target instanceof Node && containerEl.contains(e.target)) return;
        close();
    }

    onMount(() => {
        window.addEventListener("pointerdown", onWindowDown, true);
    });
    onDestroy(() => {
        window.removeEventListener("pointerdown", onWindowDown, true);
    });
</script>

<div bind:this={containerEl} class="flex items-center gap-0" role="menubar">
    {#each menus as menu, i (menu.label)}
        <Menu
            label={menu.label}
            items={menu.items}
            open={openIdx === i}
            onopen={() => open(i)}
            onclose={close}
            onnavigate={navigate}
            onhover={() => {
                // when any menu is already open, hovering another switches to it
                // (Google Docs / VS Code menu-bar behaviour). idle hover does nothing.
                if (openIdx >= 0 && openIdx !== i) open(i);
            }}
        />
    {/each}
</div>
