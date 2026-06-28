<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { EditorView, keymap, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, highlightSpecialChars, lineNumbers, scrollPastEnd } from "@codemirror/view";
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
        line?: number;
        col?: number;
        selectionLength?: number;
        onselectionchange?: (hasSelection: boolean) => void;
        oncontextmenu?: (ctx: { type: ContextType; x: number; y: number }) => void;
    }

    let {
        line = $bindable(1),
        col = $bindable(1),
        selectionLength = $bindable(0),
        onselectionchange,
        oncontextmenu,
    }: Props = $props();

    let editorEl: HTMLDivElement;
    let view: EditorView;
    let isDragging = false;

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

    function updateCursorState(state: EditorState): void {
        const sel = state.selection.main;
        const lineInfo = state.doc.lineAt(sel.head);
        line = lineInfo.number;
        col = sel.head - lineInfo.from + 1;
        selectionLength = sel.empty ? 0 : Math.abs(sel.to - sel.from);
    }

    const theme = EditorView.theme({
        "&": {
            height: "100%",
            background: "var(--color-editor-bg)",
            color: "var(--color-fg)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.8125rem",
        },
        ".cm-gutters": {
            background: "transparent",
            border: "none",
            color: "var(--color-fg-muted)",
            paddingRight: "0.75rem",
        },
        ".cm-lineNumbers .cm-gutterElement": {
            minWidth: "2.5rem",
            textAlign: "right",
        },
        ".cm-activeLineGutter": {
            background: "transparent",
            color: "var(--color-fg)",
        },
        ".cm-activeLine": {
            background: "color-mix(in srgb, var(--color-fg) 4%, transparent)",
        },
        ".cm-matchingBracket": {
            outline: "1px solid var(--color-accent)",
            background: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
        },
        ".cm-selectionMatch": {
            background: "transparent",
            outline: "1px solid color-mix(in srgb, var(--color-accent) 45%, transparent)",
        },
        ".cm-selectionBackground": {
            background: "color-mix(in srgb, var(--color-accent) 30%, transparent)",
        },
        "&.cm-focused .cm-selectionBackground": {
            background: "color-mix(in srgb, var(--color-accent) 40%, transparent)",
        },
        ".cm-cursor": { borderLeftColor: "var(--color-fg)" },
        ".cm-scroller": {
            fontFamily: "var(--font-mono)",
            lineHeight: "1.7",
            overflow: "auto",
            paddingTop: "2.5rem",
            paddingBottom: "3rem",
            paddingLeft: "0.5rem",
            paddingRight: "1rem",
        },
        ".cm-content": { maxWidth: "none", margin: "0" },
    });

    const extensions = [
        lineNumbers(),
        highlightSpecialChars(),
        history({ minDepth: 10_000 }),
        scrollPastEnd(),
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
                updateCursorState(update.state);
                if (!isDragging) onselectionchange?.(!update.state.selection.main.empty);
            }
        }),
        EditorView.lineWrapping,
        EditorState.transactionFilter.of((tr) => {
            if (!tr.isUserEvent("input.paste")) return tr;
            let from: number | null = null;
            tr.changes.iterChanges((fromA) => { if (from === null) from = fromA; });
            if (from === null) return tr;
            return [tr, { selection: { anchor: from }, scrollIntoView: true }];
        }),
        EditorView.domEventHandlers({
            mousedown() { isDragging = true; return false; },
            mouseup(_, view) {
                isDragging = false;
                onselectionchange?.(!view.state.selection.main.empty);
                return false;
            },
            wheel(event, view) {
                event.preventDefault();
                let dy = event.deltaY;
                if (event.deltaMode === 1) dy *= 20;       // lines → px (firefox)
                else if (event.deltaMode === 2) dy *= 400;  // pages → px
                view.scrollDOM.scrollTop += dy * 0.35;
                return true;
            },
        }),
    ];

    onMount(() => {
        view = new EditorView({
            extensions,
            parent: editorEl,
        });
        view.dom.addEventListener("contextmenu", handleContextMenu);
        view.focus();
        updateCursorState(view.state);
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

    export function getContent(): string {
        return view ? view.state.doc.toString() : "";
    }

    export function setContent(text: string): void {
        if (!view) return;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: text },
        });
    }

    export function focus(): void {
        view?.focus();
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
