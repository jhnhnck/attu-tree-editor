<!--
    FamilyTreeEditor - per-person card; absolutely positioned by TreeCanvas.
    detail level is set by the canvas based on zoom; see PersonNodeLevel.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { Link2 } from "@lucide/svelte";
    import { HaracalndeDate, type HaracalndeDateData } from "@attu/ui";
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
        /**
         * roving-tabindex: when no card is `selected`, the canvas flags
         * exactly one visible card as `isFirstFocusable` so Tab from
         * outside still lands inside the tree. with a selection present
         * the canvas leaves this `false` and the selected card carries
         * tabindex=0 instead. only one card per canvas should ever be
         * `selected || isFirstFocusable` at a time.
         */
        isFirstFocusable?: boolean;
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
        isFirstFocusable = false,
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
    // the card is sized tall by `cardHeight()` whenever portraitBlobId is set,
    // regardless of whether the blob URL has been resolved yet. render the
    // slot in both cases so the tall card never shows an empty top band; the
    // slot stays blank (no img) until portraitUrl arrives.
    let hasPortraitSlot = $derived(Boolean(portraitUrl || person.portraitBlobId));

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
    // at levels 4 (initials) and 5 (dot) the card hides the name entirely, so
    // surface name + lifespan via a native title tooltip so users can identify
    // cards without zooming in. at lower levels the name is already visible on
    // the card, so the tooltip would just duplicate what the user can read.
    let farZoomTitle = $derived(
        level >= 4 ? [fullName || "(unnamed)", dateRange].filter(Boolean).join(" · ") : undefined,
    );

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
    /**
     * Phase 5: origin / fluid glyph mapper. Single character so each glyph
     * is one stacked row in the corner column. Glyphs are picked for high
     * legibility at small sizes (avoid emoji that render colour-only).
     */
    function glyphFor(glyph: string): string {
        switch (glyph) {
            case "summoned":
                return "✨";
            case "manufactured":
                return "⚙";
            case "hatched":
                return "◯";
            case "awoken":
                return "✦";
            case "cloned":
                return "⟲";
            case "fluid":
                return "≈";
            default:
                return "";
        }
    }

    function toneClassFor(tone: "sky" | "rose" | "amber", lvl: PersonNodeLevel): string {
        if (lvl >= 5) {
            if (tone === "sky") return "bg-sky-500";
            // rose tone uses pink palette - rose-700 reads as dark blood-red on the
            // card fill, pink-* sits in the intended pink-red family
            if (tone === "rose") return "bg-pink-500";
            return "bg-amber-400";
        }
        if (tone === "sky") return "bg-sky-700/35 border-sky-400/70";
        if (tone === "rose") return "bg-pink-700/35 border-pink-400/70";
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
    data-portrait={hasPortraitSlot ? "1" : "0"}
    data-has-date={dateRange ? "true" : "false"}
    data-frame={decoration.frame}
    data-era-underline={decoration.underlineColour ? "true" : undefined}
    style:--era-bottom={decoration.underlineColour || "transparent"}
    tabindex={selected || isFirstFocusable ? 0 : -1}
    aria-selected={selected}
    aria-label={fullName || initials}
    title={farZoomTitle}
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
        {#if hasPortraitSlot}
            <!-- portrait slot is 1:1 (square) to match the 600x600 source
                 portraits. object-cover with no position bias keeps the full
                 image visible without cropping. the card is sized double-height
                 by `cardHeight()` when portraitBlobId is present. when the url
                 hasn't resolved yet, the slot still renders as a placeholder so
                 the tall card doesn't show an empty top band. -->
            <div
                class="border-line/40 portrait-slot mx-auto mb-1 overflow-hidden rounded border"
                class:is-deceased={isDeceased}
                class:is-portrait-pending={!portraitUrl}
                data-portrait-slot="true"
                data-portrait-pending={!portraitUrl ? "true" : undefined}
            >
                {#if portraitUrl}
                    <img src={portraitUrl} alt="" class="h-full w-full object-cover" />
                {/if}
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

    {#if decoration.cornerGlyphs.length > 0 || decoration.identityFluid}
        <!-- Phase 5: origin-glyph stack in the top-left corner. Each glyph
             represents one decorator-axis hit (origin.kind, identity-fluid).
             Stacked vertically so multiple glyphs read as a list rather than
             colliding into a single chip. Pointer-events-none so they don't
             steal clicks from the card. -->
        <div
            class="origin-glyphs pointer-events-none absolute top-0 left-0 flex flex-col gap-0.5 px-1 py-0.5 text-xs"
            data-origin-glyphs="true"
        >
            {#each decoration.cornerGlyphs as glyph (glyph)}
                <span class="origin-glyph" data-glyph={glyph}>{glyphFor(glyph)}</span>
            {/each}
        </div>
    {/if}

    {#if decoration.assignedAtBirth !== undefined}
        <!-- Phase 5: AAB side-label at the bottom-left when set explicitly.
             Inferred AAB is shown only in PersonalTab; on the card we only
             expose it when the user has told us. -->
        <span
            class="aab-label pointer-events-none absolute bottom-0 left-0 font-mono text-[10px] opacity-70 px-1"
            data-aab={decoration.assignedAtBirth}
        >
            {decoration.assignedAtBirth}
        </span>
    {/if}
</button>

<style>
    button {
        border-width: var(--node-border-width, 2px);
        border-style: solid;
        /* phase 5: bumped 0.375rem → 0.5rem (6→8px). with border-width 2px the
           padding-box inner radius becomes 6px (was 4px), so the inset selection
           ring at spread=3px has enough arc to render flush against the border's
           inner corner — closes the visible corner-gap from #7/B9. */
        border-radius: 0.5rem;
        /* era underline: inset bottom shadow driven by --era-bottom (set inline).
           inset shadow is immune to overflow:hidden clipping and doesn't affect
           the tone-based border color. transparent default means no shadow when
           no era colour is set. */
        box-shadow: inset 0 -3px 0 0 var(--era-bottom, transparent);
    }
    /* relationship-vocabulary Phase 5: per-frame stroke style driven by the
       cardDecorator's `frame` axis. The decorator maps species + kind →
       frame; mechanical kinds get dashed, spirit gets double, collective /
       concept get gradient. Solid is the default (no rule needed). */
    .person-card[data-frame="dashed"] {
        border-style: dashed;
    }
    .person-card[data-frame="dotted"] {
        border-style: dotted;
    }
    .person-card[data-frame="double"] {
        border-style: double;
        border-width: 3px;
    }
    .person-card[data-frame="gradient"] {
        border-style: solid;
        border-image: linear-gradient(135deg, var(--accent, #60a5fa), transparent) 1;
    }
    /* level 5 is a tiny dot - circular */
    .person-card[data-level="5"] {
        border-radius: 9999px;
    }
    /* level 0 with no portrait centers the name+date vertically;
       with a portrait, default flex-start lets the portrait sit at the top.
       phase 5 adds: any level-0 card without a date is centered too, so the
       portrait+name block doesn't leave an empty band at the bottom of a
       tall portrait card. */
    .person-card[data-level="0"][data-portrait="0"],
    .person-card[data-level="0"][data-has-date="false"] {
        justify-content: center;
    }
    /* portrait slot is 1:1 (square) to match the 600x600 source images.
       width 70% keeps the slot from spanning the full card width while
       still reading as a prominent photo. the card itself is sized
       double-height by `cardHeight()` when a portrait is present. */
    .portrait-slot {
        width: 70%;
        aspect-ratio: 1 / 1;
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
    /* deceased people's portrait photos render greyscale + slightly
       dimmed so a face-with-colour always means alive-or-unknown and
       greyscale always means deceased. applied to the portrait slot
       container; tint is light enough to keep the photo readable at
       fit-zoom. */
    .is-deceased {
        filter: grayscale(1) brightness(0.85);
    }
    /* portraitBlobId is set but the resolved URL hasn't arrived yet.
       the slot keeps its 1:1 footprint so the tall card doesn't show
       an empty top band; a subtle background fills the area until the
       img mounts. */
    .is-portrait-pending {
        background-color: hsl(0 0% 50% / 0.08);
        transition: background-color 80ms ease-out;
    }
    /* selection ring as an inset box-shadow rather than `outline`. outline
       was being beaten by the UA's `:focus-visible { outline: ... }` rule
       (higher specificity than our class), which is what produced the
       "black flash" - it was the default focus ring showing through.
       inset box-shadow draws inside the element's own padding box, so it's
       immune to the parent's `contain: paint` and to focus-ring cascade. */
    .is-selected {
        box-shadow:
            inset 0 0 0 3px hsl(50 100% 65%),
            inset 0 -3px 0 0 var(--era-bottom, transparent);
        z-index: 5;
    }
</style>
