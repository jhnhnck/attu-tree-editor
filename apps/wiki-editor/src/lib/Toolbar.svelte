<script lang="ts">
    import type { Component } from "svelte";
    import {
        Undo2,
        Redo2,
        ChevronDown,
        Bold,
        Italic,
        Strikethrough,
        Code,
        Link2,
        ExternalLink,
        List,
        ListOrdered,
        Indent,
        Outdent,
        Table,
        Quote,
        Image,
        Omega,
        Sigma,
        Eye,
        Columns2,
        Replace,
        Superscript,
        Subscript,
        Braces,
        PenLine,
        LayoutGrid,
        Ellipsis,
    } from "@lucide/svelte";

    const PARAGRAPH_STYLES = [
        "paragraph",
        "heading 2",
        "heading 3",
        "heading 4",
        "heading 5",
        "heading 6",
        "preformatted",
        "block quote",
    ] as const;

    interface EditorBinding {
        applyBold: () => void;
        applyItalic: () => void;
        applyStrikethrough: () => void;
        applySuperscript: () => void;
        applySubscript: () => void;
        applyInlineCode: () => void;
        applyNowiki: () => void;
        applyHeading: (level: 2 | 3 | 4 | 5 | 6) => void;
        applyBulletList: () => void;
        applyNumberedList: () => void;
        applyIndent: () => void;
        applyOutdent: () => void;
        applyBlockquote: () => void;
        applyPreformatted: () => void;
        applyClearBlockMarkup: () => void;
    }

    interface Props {
        editor?: EditorBinding | undefined;
    }

    let { editor }: Props = $props();

    let styleOpen = $state(false);
    let overflowOpen = $state(false);
    let currentStyle = $state<string>("paragraph");

    function applyParagraphStyle(style: (typeof PARAGRAPH_STYLES)[number]): void {
        if (!editor) return;
        if (style === "paragraph") editor.applyClearBlockMarkup();
        else if (style === "preformatted") editor.applyPreformatted();
        else if (style === "block quote") editor.applyBlockquote();
        else editor.applyHeading(Number(style.slice("heading ".length)) as 2 | 3 | 4 | 5 | 6);
    }
</script>

{#snippet btn(Icon: Component, title: string, onclick: () => void = () => {})}
    <button
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-fg hover:bg-canvas"
        {title}
        {onclick}
    >
        <Icon size={15} strokeWidth={2} />
    </button>
{/snippet}

{#snippet divider()}
    <div class="mx-1 h-5 w-px shrink-0 bg-line"></div>
{/snippet}

<div class="flex h-full items-center gap-px px-2">
    <!-- history -->
    {@render btn(Undo2, "Undo (Ctrl+Z)")}
    {@render btn(Redo2, "Redo (Ctrl+Shift+Z)")}
    {@render divider()}

    <!-- paragraph style dropdown -->
    <div class="relative shrink-0">
        <button
            type="button"
            class="flex h-7 w-28 items-center justify-between rounded px-2 text-xs text-fg hover:bg-canvas"
            onclick={() => {
                styleOpen = !styleOpen;
            }}
        >
            {currentStyle}
            <ChevronDown size={12} strokeWidth={2} />
        </button>
        {#if styleOpen}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="fixed inset-0 z-40"
                onclick={() => {
                    styleOpen = false;
                }}
                onkeydown={() => {}}
            ></div>
            <div
                class="absolute left-0 top-full z-50 mt-1 min-w-36 rounded border border-line bg-canvas-elev py-1 shadow-lg"
            >
                {#each PARAGRAPH_STYLES as style (style)}
                    <button
                        type="button"
                        class="flex w-full items-center px-3 py-1 text-left text-xs text-fg hover:bg-canvas"
                        onclick={() => {
                            currentStyle = style;
                            styleOpen = false;
                            applyParagraphStyle(style);
                        }}
                    >
                        {style}
                    </button>
                {/each}
            </div>
        {/if}
    </div>
    {@render divider()}

    <!-- character -->
    {@render btn(Bold, "Bold (Ctrl+B)", () => editor?.applyBold())}
    {@render btn(Italic, "Italic (Ctrl+I)", () => editor?.applyItalic())}
    {@render btn(Strikethrough, "Strikethrough", () => editor?.applyStrikethrough())}
    {@render btn(Code, "Inline code (Ctrl+`)", () => editor?.applyInlineCode())}
    {@render divider()}

    <!-- links -->
    {@render btn(Link2, "Wikilink (Ctrl+K)")}
    {@render btn(ExternalLink, "External link (Ctrl+Shift+K)")}
    {@render divider()}

    <!-- lists -->
    {@render btn(List, "Bullet list", () => editor?.applyBulletList())}
    {@render btn(ListOrdered, "Numbered list", () => editor?.applyNumberedList())}
    {@render btn(Indent, "Increase indent", () => editor?.applyIndent())}
    {@render btn(Outdent, "Decrease indent", () => editor?.applyOutdent())}
    {@render divider()}

    <!-- insert -->
    {@render btn(Table, "Table")}
    {@render btn(Quote, "Reference / citation")}
    {@render btn(Image, "Image / file")}
    {@render divider()}

    <!-- special -->
    {@render btn(Omega, "Special character")}
    {@render btn(Sigma, "Math formula")}
    {@render divider()}

    <!-- view -->
    {@render btn(Eye, "Preview (Ctrl+P)")}
    {@render btn(Columns2, "Side-by-side")}
    {@render divider()}

    <!-- edit -->
    {@render btn(Replace, "Find & replace (Ctrl+H)")}
    {@render divider()}

    <!-- overflow: low-priority items always accessible via … -->
    <div class="relative shrink-0">
        <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-fg hover:bg-canvas"
            title="More"
            onclick={() => {
                overflowOpen = !overflowOpen;
            }}
        >
            <Ellipsis size={15} strokeWidth={2} />
        </button>
        {#if overflowOpen}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="fixed inset-0 z-40"
                onclick={() => {
                    overflowOpen = false;
                }}
                onkeydown={() => {}}
            ></div>
            <div
                class="absolute right-0 top-full z-50 mt-1 rounded border border-line bg-canvas-elev py-1 shadow-lg"
            >
                {#snippet omenuitem(
                    Icon: Component,
                    label: string,
                    onAction: () => void = () => {},
                )}
                    <button
                        type="button"
                        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg hover:bg-canvas"
                        onclick={() => {
                            overflowOpen = false;
                            onAction();
                        }}
                    >
                        <Icon size={13} strokeWidth={2} />
                        {label}
                    </button>
                {/snippet}
                {@render omenuitem(Superscript, "Superscript (Ctrl+.)", () =>
                    editor?.applySuperscript(),
                )}
                {@render omenuitem(Subscript, "Subscript (Ctrl+,)", () => editor?.applySubscript())}
                {@render omenuitem(Braces, "Nowiki wrap", () => editor?.applyNowiki())}
                {@render omenuitem(PenLine, "Signature")}
                {@render omenuitem(Quote, "Template")}
                {@render omenuitem(LayoutGrid, "Gallery")}
            </div>
        {/if}
    </div>
</div>
