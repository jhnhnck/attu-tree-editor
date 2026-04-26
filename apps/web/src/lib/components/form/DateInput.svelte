<!--
    FamilyTreeEditor - structured date picker for partial Haracalnde dates
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { type Era, type HaracalndeDateData } from "$lib/date/HaracalndeDate";

    interface Props {
        value: HaracalndeDateData | undefined;
        id?: string;
        placeholder?: string;
        onchange: (next: HaracalndeDateData | undefined) => void;
    }

    let { value, id, onchange }: Props = $props();

    let yearStr = $state("");
    let month = $state<number | "">("");
    let day = $state<number | "">("");
    let era = $state<Era>("PC");
    let approx = $state(false);

    let yearError = $derived(
        yearStr !== "" &&
            (isNaN(Number(yearStr)) || !Number.isInteger(Number(yearStr)) || Number(yearStr) < 1)
            ? "year must be 1 or greater"
            : undefined,
    );

    $effect.pre(() => {
        if (!value) {
            yearStr = "";
            month = "";
            day = "";
            era = "PC";
            approx = false;
        } else {
            yearStr = String(value.year);
            month = value.month ?? "";
            day = value.day ?? "";
            era = value.era;
            approx = value.approximate ?? false;
        }
    });

    function emit(): void {
        if (yearStr === "") {
            onchange(undefined);
            return;
        }
        const y = Number(yearStr);
        if (!Number.isInteger(y) || y < 1) return;
        const out: HaracalndeDateData = { era, year: y };
        if (month !== "") out.month = Number(month);
        if (day !== "") out.day = Number(day);
        if (approx) out.approximate = true;
        onchange(out);
    }

    function onMonthChange(): void {
        if (month === "") day = "";
        emit();
    }

    const selectCls =
        "bg-canvas border-line text-fg focus:border-accent focus:ring-accent min-w-0 rounded border px-1 py-1 text-sm focus:ring-1 focus:outline-none";
</script>

<div class="space-y-1.5">
    <div class="flex gap-1.5">
        <input
            {id}
            type="text"
            inputmode="numeric"
            placeholder="year"
            class="bg-canvas border-line text-fg focus:border-accent focus:ring-accent w-full min-w-0 rounded border px-2 py-1 text-sm focus:ring-1 focus:outline-none"
            class:border-red-500={yearError}
            bind:value={yearStr}
            oninput={emit}
            aria-label="year"
            aria-invalid={yearError ? "true" : undefined}
            aria-errormessage={yearError ? `${id ?? "date"}-year-error` : undefined}
        />
        <select bind:value={era} onchange={emit} class="{selectCls} shrink-0" aria-label="era">
            <option value="PC">PC</option>
            <option value="TT">TT</option>
        </select>
    </div>
    <div class="flex items-center gap-1.5">
        <select
            bind:value={month}
            onchange={onMonthChange}
            class="{selectCls} flex-1"
            aria-label="month"
        >
            <option value="">—</option>
            {#each { length: 12 } as _, i}
                <option value={i + 1}>{i + 1}</option>
            {/each}
        </select>
        <select
            bind:value={day}
            onchange={emit}
            disabled={month === ""}
            class="{selectCls} flex-1"
            aria-label="day"
        >
            <option value="">—</option>
            {#each { length: 30 } as _, i}
                <option value={i + 1}>{i + 1}</option>
            {/each}
        </select>
        <label
            class="text-fg-muted flex shrink-0 cursor-pointer items-center gap-1 text-sm select-none"
        >
            <input
                type="checkbox"
                bind:checked={approx}
                onchange={emit}
                class="accent-accent"
                aria-label="approximate"
            />
            ~
        </label>
    </div>
    {#if yearError}
        <p id="{id ?? 'date'}-year-error" class="text-xs text-red-400" role="alert">{yearError}</p>
    {/if}
</div>
