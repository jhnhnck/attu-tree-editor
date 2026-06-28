<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { EditorView, keymap, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, highlightSpecialChars, lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
    import { EditorState } from "@codemirror/state";
    import { history, historyKeymap, defaultKeymap, undo, redo } from "@codemirror/commands";
    import { bracketMatching, indentOnInput } from "@codemirror/language";
    import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
    import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";

    type ContextType =
        | "selection"
        | "wikilink"
        | "external-link"
        | "template"
        | "reference"
        | "table"
        | "image";

    interface Props {
        onselectionchange?: (hasSelection: boolean) => void;
        oncontextmenu?: (ctx: { type: ContextType; x: number; y: number }) => void;
    }

    let { onselectionchange, oncontextmenu }: Props = $props();

    let editorEl: HTMLDivElement;
    let view: EditorView;

    function insideAny(text: string, col: number, re: RegExp): boolean {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
            if (col >= m.index && col < m.index + m[0].length) return true;
        }
        return false;
    }

    function classifyContext(event: MouseEvent): ContextType {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return "selection";
        const line = view.state.doc.lineAt(pos);
        const text = line.text;
        const col = pos - line.from;
        if (insideAny(text, col, /\[\[File:[^\]]*\]\]/g)) return "image";
        if (insideAny(text, col, /\[\[[^\]]*\]\]/g)) return "wikilink";
        if (insideAny(text, col, /\[https?:\/\/[^\]]*\]/g)) return "external-link";
        if (insideAny(text, col, /\{\{[^}]*\}\}/g)) return "template";
        if (insideAny(text, col, /<ref[^>]*>[\s\S]*?<\/ref>/g)) return "reference";
        if (/^\s*(\{\||[|!])/.test(text)) return "table";
        return "selection";
    }

    function handleContextMenu(event: MouseEvent): void {
        event.preventDefault();
        const type = classifyContext(event);
        oncontextmenu?.({ type, x: event.clientX, y: event.clientY });
    }

    const theme = EditorView.theme({
        "&": {
            height: "100%",
            background: "var(--color-canvas-elev)",
            color: "var(--color-fg)",
            fontFamily: "var(--font-mono)",
        },
        ".cm-gutters": {
            background: "var(--color-canvas)",
            borderRight: "1px solid var(--color-line)",
            color: "var(--color-fg-muted)",
        },
        ".cm-activeLineGutter": {
            background: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
        },
        ".cm-activeLine": {
            background: "color-mix(in srgb, var(--color-accent) 5%, transparent)",
        },
        ".cm-matchingBracket": {
            outline: "1px solid var(--color-accent)",
            background: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
        },
        ".cm-selectionMatch": {
            background: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
        },
        ".cm-cursor": { borderLeftColor: "var(--color-fg)" },
        ".cm-scroller": {
            fontFamily: "var(--font-mono)",
            overflow: "auto",
            padding: "1rem 1.5rem",
        },
        ".cm-content": { maxWidth: "80ch", margin: "0 auto" },
    });

    const extensions = [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history({ minDepth: 10_000 }),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ activateOnTyping: false }),
        highlightSelectionMatches(),
        indentOnInput(),
        keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...searchKeymap,
        ]),
        theme,
        EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged) {
                onselectionchange?.(!update.state.selection.main.empty);
            }
        }),
        EditorView.lineWrapping,
    ];

    onMount(() => {
        view = new EditorView({
            extensions,
            parent: editorEl,
        });
        view.dom.addEventListener("contextmenu", handleContextMenu);
        view.focus();
    });

    onDestroy(() => {
        view?.dom.removeEventListener("contextmenu", handleContextMenu);
        view?.destroy();
    });

    export function undoEdit() {
        if (view) undo(view);
    }

    export function redoEdit() {
        if (view) redo(view);
    }

    export function getCursorCoords(): { x: number; y: number } | null {
        if (!view) return null;
        const sel = view.state.selection.main;
        if (sel.empty) return null;
        const coords = view.coordsAtPos(sel.head);
        if (!coords) return null;
        return { x: coords.left, y: coords.top };
    }
</script>

<div bind:this={editorEl} class="absolute inset-0"></div>
