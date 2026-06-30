<script lang="ts">
    import type { Component } from "svelte";
    import {
        Bold,
        Italic,
        Strikethrough,
        Code,
        Link2,
        ExternalLink,
        MessageSquare,
        Braces,
        EllipsisVertical,
        Superscript,
        Subscript,
        Eraser,
    } from "@lucide/svelte";

    interface EditorBinding {
        applyBold: () => void;
        applyItalic: () => void;
        applyRemoveMarkup: () => void;
    }

    interface Props {
        coords: { x: number; y: number } | null;
        editor?: EditorBinding | undefined;
        onopenlinkpopover?: (kind: "wikilink" | "external-link") => void;
    }

    let { coords, editor, onopenlinkpopover }: Props = $props();

    let moreOpen = $state(false);
</script>

{#snippet sbtn(Icon: Component, title: string, onclick: () => void = () => {})}
    <button
        type="button"
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg hover:bg-canvas"
        {title}
        {onclick}
    >
        <Icon size={13} strokeWidth={2} />
    </button>
{/snippet}

{#if coords}
    <div
        class="fixed z-50 flex items-center gap-px rounded border border-line bg-canvas-elev px-1 py-0.5 shadow-lg"
        style="left: {Math.max(
            4,
            coords.x,
        )}px; top: {coords.y}px; transform: translateY(calc(-100% - 4px));"
    >
        {@render sbtn(Bold, "Bold (Ctrl+B)", () => editor?.applyBold())}
        {@render sbtn(Italic, "Italic (Ctrl+I)", () => editor?.applyItalic())}
        {@render sbtn(Strikethrough, "Strikethrough")}
        {@render sbtn(Code, "Inline code (Ctrl+`)")}
        <div class="mx-0.5 h-4 w-px shrink-0 bg-line"></div>
        {@render sbtn(Link2, "Wikilink (Ctrl+K)", () => onopenlinkpopover?.("wikilink"))}
        {@render sbtn(ExternalLink, "External link", () => onopenlinkpopover?.("external-link"))}
        <div class="mx-0.5 h-4 w-px shrink-0 bg-line"></div>
        {@render sbtn(MessageSquare, "Toggle comment")}
        {@render sbtn(Braces, "Nowiki wrap")}

        <!-- more overflow -->
        <div class="mx-0.5 h-4 w-px shrink-0 bg-line"></div>
        <div class="relative shrink-0">
            <button
                type="button"
                class="flex h-6 w-6 items-center justify-center rounded text-fg hover:bg-canvas"
                title="More"
                onclick={() => {
                    moreOpen = !moreOpen;
                }}
            >
                <EllipsisVertical size={13} strokeWidth={2} />
            </button>
            {#if moreOpen}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="fixed inset-0 z-40"
                    onclick={() => {
                        moreOpen = false;
                    }}
                    onkeydown={() => {}}
                ></div>
                <div
                    class="absolute left-0 top-full z-50 mt-1 rounded border border-line bg-canvas-elev py-1 shadow-lg"
                >
                    {#snippet moremenuitem(
                        Icon: Component,
                        label: string,
                        onAction: () => void = () => {},
                    )}
                        <button
                            type="button"
                            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg hover:bg-canvas"
                            onclick={() => {
                                moreOpen = false;
                                onAction();
                            }}
                        >
                            <Icon size={13} strokeWidth={2} />
                            {label}
                        </button>
                    {/snippet}
                    {@render moremenuitem(Superscript, "Superscript")}
                    {@render moremenuitem(Subscript, "Subscript")}
                    {@render moremenuitem(Eraser, "Remove markup", () =>
                        editor?.applyRemoveMarkup(),
                    )}
                </div>
            {/if}
        </div>
    </div>
{/if}
