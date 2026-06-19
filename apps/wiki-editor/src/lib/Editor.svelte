<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { EditorView, minimalSetup } from "codemirror";
    import { undo, redo } from "@codemirror/commands";

    let editorEl: HTMLDivElement;
    let view: EditorView;

    const theme = EditorView.theme({
        "&": { height: "100%", backgroundColor: "var(--color-canvas)", color: "var(--color-fg)" },
        ".cm-scroller": { overflow: "auto", fontFamily: "inherit" },
        ".cm-cursor": { borderLeftColor: "var(--color-fg)" },
        ".cm-selectionBackground": { backgroundColor: "var(--color-accent-muted, #334155)" },
        "&.cm-focused .cm-selectionBackground": { backgroundColor: "var(--color-accent-muted, #334155)" },
    });

    onMount(() => {
        view = new EditorView({
            extensions: [minimalSetup, theme],
            parent: editorEl,
        });
        view.focus();
    });

    onDestroy(() => {
        view?.destroy();
    });

    export function undoEdit() {
        if (view) undo(view);
    }

    export function redoEdit() {
        if (view) redo(view);
    }
</script>

<div bind:this={editorEl} class="h-full"></div>
