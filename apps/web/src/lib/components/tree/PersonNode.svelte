<!--
    FamilyTreeEditor - per-person card; absolutely positioned by TreeCanvas.
    detail level is set by the canvas based on zoom; see PersonNodeLevel.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { HaracalndeDate, type HaracalndeDateData } from "$lib/date/HaracalndeDate";
    import type { Person } from "$lib/domain/types";
    import type { PersonNodeLevel } from "$lib/components/tree/edges";

    interface Props {
        person: Person;
        selected?: boolean;
        level?: PersonNodeLevel;
        /** canvas scale, used to keep border thickness visually constant */
        scale?: number;
        portraitUrl?: string | undefined;
        onselect?: (id: string) => void;
        onedit?: (id: string) => void;
        oncontextmenu?: (id: string, x: number, y: number) => void;
    }

    let {
        person,
        selected = false,
        level = 0,
        scale = 1,
        portraitUrl,
        onselect,
        onedit,
        oncontextmenu,
    }: Props = $props();

    let firstName = $derived(person.given.trim());
    let lastName = $derived(person.surname.trim());
    let fullName = $derived([firstName, lastName].filter(Boolean).join(" ").trim());
    let initials = $derived(((firstName[0] ?? "") + (lastName[0] ?? "")).toUpperCase() || "?");
    let dateRange = $derived(formatRange(person.birth, person.death));

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

    // at level 5 (dot) use a solid opaque fill so the tiny shape reads clearly
    let genderClass = $derived(
        level >= 5
            ? person.gender === "m"
                ? "bg-sky-500"
                : person.gender === "f"
                  ? "bg-rose-500"
                  : "bg-amber-400"
            : person.gender === "m"
              ? "bg-sky-700/35 border-sky-400/70"
              : person.gender === "f"
                ? "bg-rose-700/35 border-rose-400/70"
                : "bg-amber-600/30 border-amber-400/70",
    );

    // keep visual border thickness at ~2px regardless of canvas zoom
    let borderWidth = $derived(level >= 5 ? "0px" : `${(2 / Math.max(scale, 0.001)).toFixed(2)}px`);
</script>

<button
    type="button"
    class="text-fg group relative flex h-full w-full flex-col items-stretch overflow-hidden px-2 py-1 text-center outline-none transition-colors hover:z-10 focus:outline-none focus-visible:outline-none {genderClass} {level >=
    5
        ? 'rounded-full'
        : 'rounded-md'} {level === 0 && !portraitUrl ? 'justify-center' : ''}"
    style:border-width={borderWidth}
    style:border-style="solid"
    class:is-faded={person.display === "z0"}
    class:is-selected={selected}
    data-person-id={person.id}
    aria-pressed={selected}
    aria-label={fullName || initials}
    onclick={() => onselect?.(person.id)}
    ondblclick={() => onedit?.(person.id)}
    oncontextmenu={(e) => {
        if (!oncontextmenu) return;
        e.preventDefault();
        oncontextmenu(person.id, e.clientX, e.clientY);
    }}
>
    {#if level <= 0}
        {#if portraitUrl}
            <div class="border-line/40 mb-1 h-10 w-full overflow-hidden rounded border">
                <img src={portraitUrl} alt="" class="h-full w-full object-cover" />
            </div>
        {/if}
        <span class="line-clamp-2 text-sm leading-tight font-semibold">
            {fullName || "(unnamed)"}
        </span>
        {#if dateRange}
            <span class="mt-0.5 font-mono text-[11px] opacity-80">{dateRange}</span>
        {/if}
    {:else if level === 1}
        <span class="m-auto line-clamp-2 text-base leading-tight font-semibold">
            {fullName || "(unnamed)"}
        </span>
        {#if dateRange}
            <span class="mt-0.5 font-mono text-xs opacity-80">{dateRange}</span>
        {/if}
    {:else if level === 2}
        <span
            class="m-auto line-clamp-2 px-1 text-center text-2xl leading-tight font-semibold wrap-break-word"
        >
            {fullName || initials}
        </span>
    {:else if level === 3}
        <span class="m-auto truncate px-1 text-4xl font-semibold">
            {lastName || firstName || initials}
        </span>
    {:else if level === 4}
        <span class="m-auto text-6xl leading-none font-bold tracking-tight">{initials}</span>
    {/if}
    <!-- level 5: empty box, no text -->
</button>

<style>
    .is-faded {
        opacity: 0.45;
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
