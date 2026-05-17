<!--
    FamilyTreeEditor - per-person card; absolutely positioned by TreeCanvas.
    detail level is set by the canvas based on zoom; see PersonNodeLevel.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { Link2 } from "@lucide/svelte";
    import { HaracalndeDate, type HaracalndeDateData } from "$lib/date/HaracalndeDate";
    import type { Person } from "$lib/domain/types";
    import type { PersonNodeLevel } from "$lib/components/tree/edges";
    import { decorate } from "$lib/layout/engines/family-view/cardDecorator";

    interface Props {
        person: Person;
        selected?: boolean;
        level?: PersonNodeLevel;
        portraitUrl?: string | undefined;
        /** whether this is a ghost (duplicate adjacent to spouse) */
        isGhost?: boolean;
        /** show the link icon (person appears in >1 location on the canvas) */
        hasMultipleInstances?: boolean;
        onselect?: (id: string, opts?: { fromGhost?: boolean }) => void;
        onedit?: (id: string) => void;
        oncontextmenu?: (id: string, x: number, y: number) => void;
        /** click on the link icon — anchor is the icon's own element */
        onShowInstances?: ((id: string, anchor: HTMLElement) => void) | undefined;
    }

    let {
        person,
        selected = false,
        level = 0,
        portraitUrl,
        isGhost = false,
        hasMultipleInstances = false,
        onselect,
        onedit,
        oncontextmenu,
        onShowInstances,
    }: Props = $props();

    let firstName = $derived(person.given.trim());
    let lastName = $derived(person.surname.trim());
    let fullName = $derived([firstName, lastName].filter(Boolean).join(" ").trim());
    let initials = $derived(((firstName[0] ?? "") + (lastName[0] ?? "")).toUpperCase() || "?");
    let dateRange = $derived(formatRange(person.birth, person.death));

    /**
     * Phase 5 decorator pass. All visual hints (shape, tone, frame,
     * underline) come from `cardDecorator.ts` — PersonNode contains zero
     * gender-conditional branches of its own. Phase 5 of the
     * relationship-vocabulary plan will extend `decorate(person)` to
     * read `species` / `kind` / `origin` etc.; PersonNode picks the
     * new fields up automatically.
     */
    let decoration = $derived(decorate(person));
    let toneClass = $derived(toneClassFor(decoration.fillTone, level));
    let isDeceased = $derived(person.death !== undefined);

    function formatRange(
        birth: HaracalndeDateData | undefined,
        death: HaracalndeDateData | undefined,
    ): string {
        const b = birth ? HaracalndeDate.of(birth) : undefined;
        const d = death ? HaracalndeDate.of(death) : undefined;
        if (!b && !d) return "";
        if (b && d) {
            // share-era: append era once at the end ("1500 - 1570 PC")
            // cross-era: stamp each side ("1500 TT - 50 PC")
            return b.era === d.era
                ? `${String(b.year)} - ${String(d.year)} ${b.era}`
                : `${String(b.year)} ${b.era} - ${String(d.year)} ${d.era}`;
        }
        if (b) return `b. ${String(b.year)} ${b.era}`;
        if (d) return `d. ${String(d.year)} ${d.era}`;
        return "";
    }

    /**
     * Tone-to-Tailwind mapper. Branches on the decorator's abstract
     * `fillTone` ("sky" | "rose" | "amber"), not on `person.gender`,
     * so the decorator stays the single source of gender-driven
     * choices. Level 5 (dot) uses an opaque fill so the tiny shape
     * reads at distance; lower levels use the muted bg+border pair.
     */
    function toneClassFor(tone: "sky" | "rose" | "amber", lvl: PersonNodeLevel): string {
        if (lvl >= 5) {
            if (tone === "sky") return "bg-sky-500";
            if (tone === "rose") return "bg-rose-500";
            return "bg-amber-400";
        }
        if (tone === "sky") return "bg-sky-700/35 border-sky-400/70";
        if (tone === "rose") return "bg-rose-700/35 border-rose-400/70";
        return "bg-amber-600/30 border-amber-400/70";
    }
</script>

<button
    type="button"
    role="treeitem"
    class="text-fg person-card group relative flex h-full w-full cursor-pointer flex-col items-stretch overflow-hidden px-2 py-1 text-center outline-none hover:z-10 focus:outline-none focus-visible:outline-none {toneClass}"
    class:is-faded={person.display === "z0"}
    class:is-selected={selected}
    data-person-id={person.id}
    data-level={level}
    data-portrait={portraitUrl ? "1" : "0"}
    tabindex={selected ? 0 : -1}
    aria-selected={selected}
    aria-label={fullName || initials}
    onclick={() => (isGhost ? onselect?.(person.id, { fromGhost: true }) : onselect?.(person.id))}
    ondblclick={() => onedit?.(person.id)}
    oncontextmenu={(e) => {
        if (!oncontextmenu) return;
        e.preventDefault();
        oncontextmenu(person.id, e.clientX, e.clientY);
    }}
>
    <!-- all level variants are mounted once; CSS shows the matching one based on
         the button's data-level attribute. avoids tearing down/re-mounting card
         contents on each zoom-level threshold (was the top SetNeedStyleFlush
         source via Svelte's compiled {#if} branch ContentRangeInserted). -->
    <div class="lvl" data-lvl="0">
        {#if portraitUrl}
            <!-- Visual fix-up plan: portrait slot uses a true portrait
                 aspect (3:4, taller than wide) and centers horizontally.
                 The card itself is sized double-height by `cardHeight()`
                 in family-view layout when `portraitBlobId` is present,
                 so the slot has room to render the photo prominently.
                 No-portrait cards intentionally render no slot at all
                 (no silhouette placeholder). -->
            <div
                class="border-line/40 portrait-slot mx-auto mb-1 overflow-hidden rounded border"
                class:is-deceased={isDeceased}
                data-portrait-slot="true"
            >
                <img src={portraitUrl} alt="" class="h-full w-full object-cover object-top" />
            </div>
        {/if}
        <span class="line-clamp-2 text-sm leading-tight font-semibold">
            {fullName || "(unnamed)"}
        </span>
        {#if dateRange}
            <span class="mt-0.5 font-mono text-[11px] opacity-80">{dateRange}</span>
        {/if}
    </div>
    <div class="lvl" data-lvl="1">
        <span class="m-auto line-clamp-2 text-base leading-tight font-semibold">
            {fullName || "(unnamed)"}
        </span>
        {#if dateRange}
            <span class="mt-0.5 font-mono text-xs opacity-80">{dateRange}</span>
        {/if}
    </div>
    <div class="lvl" data-lvl="2">
        <span
            class="m-auto line-clamp-2 px-1 text-center text-2xl leading-tight font-semibold wrap-break-word"
        >
            {fullName || initials}
        </span>
    </div>
    <div class="lvl" data-lvl="3">
        <span class="m-auto truncate px-1 text-4xl font-semibold">
            {lastName || firstName || initials}
        </span>
    </div>
    <div class="lvl" data-lvl="4">
        <span class="m-auto text-6xl leading-none font-bold tracking-tight">{initials}</span>
    </div>
    <!-- level 5: empty box, no text -->

    {#if decoration.underlineColour}
        <!-- Phase 5 era underline: a subtle 1-px band at the bottom of
             the card, hue derived from the birth-year's century by
             cardDecorator. Cards without a birth-year have
             `underlineColour: null` so this block doesn't render and
             no stray pixel-row appears. Positioned absolutely so it
             doesn't push the existing flex layout. -->
        <span
            class="pointer-events-none absolute right-0 bottom-0 left-0 h-px"
            style:background-color={decoration.underlineColour}
            aria-hidden="true"
            data-era-underline="true"
        ></span>
    {/if}

    {#if hasMultipleInstances}
        <div
            class="link-icon absolute top-0 right-0 p-1 cursor-pointer"
            role="button"
            tabindex="0"
            title="jump to another instance"
            onclick={(e) => {
                e.stopPropagation();
                onShowInstances?.(person.id, e.currentTarget);
            }}
            onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onShowInstances?.(person.id, e.currentTarget);
                }
            }}
        >
            <Link2 size={16} />
        </div>
    {/if}
</button>

<style>
    button {
        border-width: var(--node-border-width, 2px);
        border-style: solid;
        border-radius: 0.375rem;
    }
    /* level 5 is a tiny dot - circular */
    .person-card[data-level="5"] {
        border-radius: 9999px;
    }
    /* level 0 with no portrait centers the name+date vertically;
       with a portrait, default flex-start lets the portrait sit at the top */
    .person-card[data-level="0"][data-portrait="0"] {
        justify-content: center;
    }
    /* Visual fix-up plan: portrait slot uses a true portrait aspect ratio
       (3:4, taller than wide) and occupies ~70% of the card width so it
       reads as a portrait photo, not a landscape strip. Card itself is
       sized double-height by `cardHeight()` in family-view layout when a
       portrait is present, giving the slot room. The slot centers
       horizontally via `mx-auto` on the element. */
    .portrait-slot {
        width: 70%;
        aspect-ratio: 3 / 4;
    }
    /* hide every level variant by default; the matching one is revealed below.
       `display: contents` keeps the variant's children as direct flex children
       of the button, preserving the previous layout (m-auto centering etc). */
    .lvl {
        display: none;
    }
    .person-card[data-level="0"] .lvl[data-lvl="0"],
    .person-card[data-level="1"] .lvl[data-lvl="1"],
    .person-card[data-level="2"] .lvl[data-lvl="2"],
    .person-card[data-level="3"] .lvl[data-lvl="3"],
    .person-card[data-level="4"] .lvl[data-lvl="4"] {
        display: contents;
    }
    .link-icon {
        opacity: 0.5;
    }
    .link-icon:hover {
        opacity: 1;
    }
    .is-faded {
        opacity: 0.45;
    }
    /* Phase 5 silhouette fallback: deceased people render with a
       greyscale tint so a colour-on-the-face always means alive-or-
       unknown and greyscale always means deceased. Tint is light
       enough to keep the icon readable at fit-zoom. */
    .is-deceased {
        filter: grayscale(1) brightness(0.85);
    }
    /* selection ring as an inset box-shadow rather than `outline`. outline
       was being beaten by the UA's `:focus-visible { outline: ... }` rule
       (higher specificity than our class), which is what produced the
       "black flash" - it was the default focus ring showing through.
       inset box-shadow draws inside the element's own padding box, so it's
       immune to the parent's `contain: paint` and to focus-ring cascade. */
    .is-selected {
        box-shadow: inset 0 0 0 3px hsl(50 100% 65%);
        z-index: 5;
    }
</style>
