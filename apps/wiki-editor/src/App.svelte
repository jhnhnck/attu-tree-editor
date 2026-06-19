<script lang="ts">
    import { Shell } from "@attu/ui";
    import type { MenuConfig } from "@attu/ui";
    import { Undo2, Redo2 } from "@lucide/svelte";
    import Editor from "./lib/Editor.svelte";

    let { title: pageTitle }: { title: string } = $props();

    let editor: Editor;

    const menus: MenuConfig[] = [
        {
            label: "File",
            items: [
                { label: "New", onclick: () => {} },
                { label: "Open", onclick: () => {} },
            ],
        },
    ];
</script>

<Shell title={pageTitle || "untitled"} {menus}>
    {#snippet tools()}
        <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded text-fg hover:bg-canvas"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            onclick={() => editor?.undoEdit()}
        >
            <Undo2 size={17} strokeWidth={2.5} />
        </button>
        <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded text-fg hover:bg-canvas"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            onclick={() => editor?.redoEdit()}
        >
            <Redo2 size={17} strokeWidth={2.5} />
        </button>
    {/snippet}
    <Editor bind:this={editor} />
</Shell>
