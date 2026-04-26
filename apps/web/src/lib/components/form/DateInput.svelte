<!--
    FamilyTreeEditor - text input that round-trips through HaracalndeDate parseNarrative
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { HaracalndeDate, type HaracalndeDateData } from "$lib/date/HaracalndeDate";

    interface Props {
        value: HaracalndeDateData | undefined;
        id?: string;
        placeholder?: string;
        onchange: (next: HaracalndeDateData | undefined) => void;
    }

    let { value, id, placeholder = "e.g. ABT 1234 PC, or 5-3 1700 TT", onchange }: Props = $props();

    let raw = $state("");
    let error = $state<string | undefined>(undefined);

    // mirror the bound value onto `raw` whenever the parent rewrites it.
    // partial keystrokes don't propagate (commit only fires on blur/Enter), so
    // user input isn't clobbered mid-edit. $effect.pre runs before paint so the
    // initial render shows the formatted value rather than an empty input.
    $effect.pre(() => {
        raw = formatValue(value);
        error = undefined;
    });

    function formatValue(v: HaracalndeDateData | undefined): string {
        if (!v) return "";
        try {
            return HaracalndeDate.of(v).toNarrative();
        } catch {
            return "";
        }
    }

    function commit(): void {
        const trimmed = raw.trim();
        if (trimmed === "") {
            error = undefined;
            onchange(undefined);
            return;
        }
        const parsed = HaracalndeDate.parseNarrative(trimmed);
        if (!parsed.ok) {
            error = humanise(parsed.error);
            return;
        }
        error = undefined;
        onchange(parsed.value.toJSON());
    }

    function humanise(code: string): string {
        switch (code) {
            case "BadShape":
                return "expected: [ABT] [day-month] year era";
            case "YearZero":
                return "year must be 1 or greater";
            case "MonthOutOfRange":
                return "month must be 1-12";
            case "DayOutOfRange":
                return "day must be 1-30";
            default:
                return "invalid date";
        }
    }
</script>

<input
    {id}
    type="text"
    class="bg-canvas border-line text-fg focus:border-accent focus:ring-accent w-full rounded-md border px-2 py-1 font-mono text-sm focus:ring-1 focus:outline-none"
    class:border-red-500={error}
    bind:value={raw}
    onblur={commit}
    onkeydown={(e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            commit();
        }
    }}
    {placeholder}
    aria-invalid={error ? "true" : undefined}
    aria-errormessage={error ? `${id ?? "date"}-error` : undefined}
/>
{#if error}
    <p id="{id ?? 'date'}-error" class="mt-1 text-xs text-red-400" role="alert">{error}</p>
{/if}
