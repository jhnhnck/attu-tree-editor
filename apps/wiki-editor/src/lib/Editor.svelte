<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import {
        EditorView,
        keymap,
        drawSelection,
        dropCursor,
        rectangularSelection,
        crosshairCursor,
        highlightActiveLine,
        highlightSpecialChars,
        lineNumbers,
        scrollPastEnd,
    } from "@codemirror/view";
    import { EditorState } from "@codemirror/state";
    import { history, historyKeymap, defaultKeymap, undo, redo } from "@codemirror/commands";
    import { bracketMatching, indentOnInput } from "@codemirror/language";
    import { wikitext } from "$lib/lang-wikitext";
    import {
        closeBrackets,
        closeBracketsKeymap,
        autocompletion,
        completionKeymap,
    } from "@codemirror/autocomplete";
    import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
    import {
        toggleBold,
        toggleItalic,
        toggleBoldItalic,
        toggleStrikethrough,
        toggleSuperscript,
        toggleSubscript,
        toggleInlineCode,
        toggleNowiki,
        setHeading,
        insertListItem,
        indent,
        outdent,
        insertBlockquote,
        insertHorizontalRule,
        insertPreformatted,
        clearBlockMarkup,
        removeMarkup,
        buildWikilinkText,
        buildExternalLinkText,
    } from "$lib/commands";

    type ContextType =
        "selection" | "wikilink" | "external-link" | "template" | "reference" | "table" | "image";

    type LinkPopoverKind = "wikilink" | "external-link";

    interface Props {
        line?: number;
        col?: number;
        selectionLength?: number;
        onselectionchange?: (hasSelection: boolean) => void;
        oncontextmenu?: (ctx: { type: ContextType; x: number; y: number }) => void;
        onopenlinkpopover?: (kind: LinkPopoverKind) => void;
    }

    let {
        line = $bindable(1),
        col = $bindable(1),
        selectionLength = $bindable(0),
        onselectionchange,
        oncontextmenu,
        onopenlinkpopover,
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
            background: "var(--color-editor-selection) !important",
        },
        "&.cm-focused .cm-selectionBackground": {
            background: "var(--color-editor-selection) !important",
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
        wikitext(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ activateOnTyping: false }),
        highlightSelectionMatches(),
        indentOnInput(),
        keymap.of([
            { key: "Mod-b", run: toggleBold },
            { key: "Mod-i", run: toggleItalic },
            { key: "Mod-.", run: toggleSuperscript },
            { key: "Mod-,", run: toggleSubscript },
            { key: "Mod-`", run: toggleInlineCode },
            { key: "Mod-2", run: setHeading(2) },
            { key: "Mod-3", run: setHeading(3) },
            { key: "Mod-4", run: setHeading(4) },
            { key: "Mod-5", run: setHeading(5) },
            { key: "Mod-6", run: setHeading(6) },
            { key: "Tab", run: indent, shift: outdent },
            {
                key: "Mod-k",
                run: () => {
                    onopenlinkpopover?.("wikilink");
                    return true;
                },
            },
            {
                key: "Mod-Shift-k",
                run: () => {
                    onopenlinkpopover?.("external-link");
                    return true;
                },
            },
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
            tr.changes.iterChanges((fromA) => {
                if (from === null) from = fromA;
            });
            if (from === null) return tr;
            return [tr, { selection: { anchor: from }, scrollIntoView: true }];
        }),
        EditorView.domEventHandlers({
            mousedown() {
                isDragging = true;
                return false;
            },
            mouseup(_, view) {
                isDragging = false;
                onselectionchange?.(!view.state.selection.main.empty);
                return false;
            },
            wheel(event, view) {
                if (event.deltaMode === 0) return false; // trackpad pixels: native is fine
                event.preventDefault();
                let dy = event.deltaY;
                if (event.deltaMode === 1)
                    dy *= 20; // lines → px (firefox wheel)
                else if (event.deltaMode === 2) dy *= 400; // pages → px
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
        const coords = view.coordsAtPos(sel.head);
        if (!coords) return null;
        return { x: coords.left, y: coords.top };
    }

    export function applyBold(): void {
        if (view) toggleBold(view);
    }

    export function applyItalic(): void {
        if (view) toggleItalic(view);
    }

    export function applyBoldItalic(): void {
        if (view) toggleBoldItalic(view);
    }

    export function applyStrikethrough(): void {
        if (view) toggleStrikethrough(view);
    }

    export function applySuperscript(): void {
        if (view) toggleSuperscript(view);
    }

    export function applySubscript(): void {
        if (view) toggleSubscript(view);
    }

    export function applyInlineCode(): void {
        if (view) toggleInlineCode(view);
    }

    export function applyNowiki(): void {
        if (view) toggleNowiki(view);
    }

    export function applyHeading(level: 2 | 3 | 4 | 5 | 6): void {
        if (view) setHeading(level)(view);
    }

    export function applyBulletList(): void {
        if (view) insertListItem("*")(view);
    }

    export function applyNumberedList(): void {
        if (view) insertListItem("#")(view);
    }

    export function applyIndent(): void {
        if (view) indent(view);
    }

    export function applyOutdent(): void {
        if (view) outdent(view);
    }

    export function applyBlockquote(): void {
        if (view) insertBlockquote(view);
    }

    export function applyHorizontalRule(): void {
        if (view) insertHorizontalRule(view);
    }

    export function applyPreformatted(): void {
        if (view) insertPreformatted(view);
    }

    export function applyClearBlockMarkup(): void {
        if (view) clearBlockMarkup(view);
    }

    export function applyRemoveMarkup(): void {
        if (view) removeMarkup(view);
    }

    export function getLinkPopoverContext(): {
        x: number;
        y: number;
        from: number;
        to: number;
        initialText: string;
    } | null {
        if (!view) return null;
        const sel = view.state.selection.main;
        const coords = getCursorCoords();
        if (!coords) return null;
        return {
            x: coords.x,
            y: coords.y,
            from: sel.from,
            to: sel.to,
            initialText: sel.empty ? "" : view.state.sliceDoc(sel.from, sel.to),
        };
    }

    export function insertWikilink(
        from: number,
        to: number,
        target: string,
        display: string,
    ): void {
        if (!view) return;
        const text = buildWikilinkText(target, display);
        view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
        });
    }

    export function insertExternalLink(from: number, to: number, url: string, label: string): void {
        if (!view) return;
        const text = buildExternalLinkText(url, label);
        view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
        });
    }
</script>

<div bind:this={editorEl} class="absolute inset-0"></div>
