<!--
    FamilyTreeEditor - styled button primitive used by editor + top bar
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import type { Snippet } from "svelte";
    import type { HTMLButtonAttributes } from "svelte/elements";

    type Variant = "primary" | "ghost" | "danger";

    interface Props extends HTMLButtonAttributes {
        variant?: Variant;
        children: Snippet;
    }

    let {
        variant = "ghost",
        children,
        class: extraClass = "",
        type = "button",
        disabled,
        onclick,
    }: Props = $props();

    const base =
        "inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
    const variants: Record<Variant, string> = {
        primary:
            "bg-accent text-canvas hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-strong",
        ghost: "text-fg hover:bg-canvas-elev focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        danger: "text-fg hover:bg-red-900/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500",
    };
</script>

<button class="{base} {variants[variant]} {extraClass}" {type} {disabled} {onclick}>
    {@render children()}
</button>
