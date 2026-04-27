<!--
    FamilyTreeEditor - structured date picker for partial Haracalnde dates
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { HaracalndeDate, type Era, type HaracalndeDateData } from "$lib/date/HaracalndeDate";

    interface Props {
        value: HaracalndeDateData | undefined;
        id?: string;
        placeholder?: string;
        onchange: (next: HaracalndeDateData | undefined) => void;
    }

    let { value, id, placeholder = "set date", onchange }: Props = $props();

    type Mode = "closed" | "picker" | "manual";
    let mode = $state<Mode>("closed");
    let alignRight = $state(false);

    let textValue = $state("");
    let textError = $state<string | undefined>();

    let containerEl: HTMLDivElement | undefined = $state();
    let fieldEl: HTMLInputElement | undefined = $state();

    // picker scratch state - committed only on Done
    let pYear = $state(1);
    let pMonth = $state(1);
    let pDay = $state(1);
    let pEra = $state<Era>("PC");
    let pApprox = $state(false);

    let editingMonth = $state(false);
    let editingYear = $state(false);
    let monthInputEl: HTMLInputElement | undefined = $state();
    let yearInputEl: HTMLInputElement | undefined = $state();

    function formatDate(v: HaracalndeDateData | undefined): string {
        if (!v) return "";
        try {
            return new HaracalndeDate(v).toNarrative();
        } catch {
            return "";
        }
    }

    let displayText = $derived(formatDate(value));

    function openPicker(): void {
        if (value) {
            pYear = value.year;
            pMonth = value.month ?? 1;
            pDay = value.day ?? 1;
            pEra = value.era;
            pApprox = value.approximate ?? false;
        } else {
            pYear = 1;
            pMonth = 1;
            pDay = 1;
            pEra = "PC";
            pApprox = false;
        }
        editingMonth = false;
        editingYear = false;
        mode = "picker";
        void tick().then(() => {
            if (!containerEl) return;
            const left = containerEl.getBoundingClientRect().left;
            alignRight = left + 256 > window.innerWidth - 8;
        });
    }

    function closePicker(): void {
        mode = "closed";
        editingMonth = false;
        editingYear = false;
    }

    function commitPicker(): void {
        if (!Number.isInteger(pYear) || pYear < 1) return;
        const out: HaracalndeDateData = {
            era: pEra,
            year: pYear,
            month: pMonth,
            day: pDay,
        };
        if (pApprox) out.approximate = true;
        onchange(out);
        closePicker();
    }

    async function startManualEdit(): Promise<void> {
        textValue = formatDate(value);
        textError = undefined;
        mode = "manual";
        await tick();
        fieldEl?.focus();
        fieldEl?.select();
    }

    function commitManualEdit(): void {
        const trimmed = textValue.trim();
        if (trimmed === "") {
            onchange(undefined);
            textError = undefined;
            mode = "closed";
            return;
        }
        const result = HaracalndeDate.parseNarrative(trimmed);
        if (result.ok) {
            onchange(result.value.toJSON());
            textError = undefined;
            mode = "closed";
        } else {
            textError = "invalid date — try '15-3 1700 PC' or 'ABT 1700 TT'";
        }
    }

    function cancelManualEdit(): void {
        mode = "closed";
        textError = undefined;
    }

    function onFieldClick(): void {
        if (mode === "closed") openPicker();
        else if (mode === "picker") void startManualEdit();
    }

    function onFieldKeyDown(e: KeyboardEvent): void {
        if (mode === "manual") {
            if (e.key === "Enter") {
                e.preventDefault();
                commitManualEdit();
            } else if (e.key === "Escape") {
                e.preventDefault();
                cancelManualEdit();
            }
        } else if (mode === "closed") {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                e.preventDefault();
                openPicker();
            }
        }
    }

    function onFieldBlur(): void {
        if (mode === "manual") commitManualEdit();
    }

    // ----- month/year arithmetic across PC/TT boundary -----
    function currentMonthIdx(): number {
        return pEra === "PC" ? (pYear - 1) * 12 + (pMonth - 1) : -pYear * 12 + (pMonth - 1);
    }

    function setFromMonthIdx(idx: number): void {
        if (idx >= 0) {
            pEra = "PC";
            pYear = Math.floor(idx / 12) + 1;
            pMonth = (idx % 12) + 1;
        } else {
            const y = Math.ceil(-idx / 12);
            const within = idx + y * 12;
            pEra = "TT";
            pYear = y;
            pMonth = within + 1;
        }
    }

    function adjustMonth(delta: number): void {
        setFromMonthIdx(currentMonthIdx() + delta);
    }

    function adjustYear(delta: number): void {
        setFromMonthIdx(currentMonthIdx() + delta * 12);
    }

    // ----- header inline edits -----
    async function startEditMonth(): Promise<void> {
        editingMonth = true;
        await tick();
        monthInputEl?.focus();
        monthInputEl?.select();
    }

    function commitMonthEdit(): void {
        const raw = monthInputEl?.value ?? "";
        const n = Number(raw);
        if (Number.isInteger(n) && n >= 1 && n <= 12) pMonth = n;
        editingMonth = false;
    }

    async function startEditYear(): Promise<void> {
        editingYear = true;
        await tick();
        yearInputEl?.focus();
        yearInputEl?.select();
    }

    function commitYearEdit(): void {
        const raw = yearInputEl?.value ?? "";
        const n = Number(raw);
        if (Number.isInteger(n) && n >= 1) pYear = n;
        editingYear = false;
    }

    function toggleEra(): void {
        pEra = pEra === "PC" ? "TT" : "PC";
    }

    function onMonthKeyDown(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            e.preventDefault();
            commitMonthEdit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            editingMonth = false;
        }
    }

    function onYearKeyDown(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            e.preventDefault();
            commitYearEdit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            editingYear = false;
        }
    }

    // ----- outside-click + escape close -----
    function onWindowDown(e: PointerEvent): void {
        if (mode === "closed") return;
        if (!containerEl) return;
        if (e.target instanceof Node && containerEl.contains(e.target)) return;
        if (mode === "manual") commitManualEdit();
        else closePicker();
    }
    function onWindowKey(e: KeyboardEvent): void {
        if (mode === "picker" && e.key === "Escape") {
            e.preventDefault();
            closePicker();
        }
    }

    onMount(() => {
        window.addEventListener("pointerdown", onWindowDown, true);
        window.addEventListener("keydown", onWindowKey);
    });
    onDestroy(() => {
        window.removeEventListener("pointerdown", onWindowDown, true);
        window.removeEventListener("keydown", onWindowKey);
    });

    const fieldCls =
        "bg-canvas border-line text-fg focus:border-accent focus:ring-accent w-full min-w-0 cursor-pointer rounded border px-2 py-1 text-sm focus:ring-1 focus:outline-none";
    const arrowCls =
        "text-fg-muted hover:text-accent flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm select-none";
    const headerNumCls =
        "hover:text-accent rounded px-1 text-sm font-medium tabular-nums cursor-pointer select-none";
    const headerInputCls =
        "bg-canvas border-line focus:border-accent focus:ring-accent w-12 rounded border px-1 py-0.5 text-center text-sm tabular-nums focus:ring-1 focus:outline-none";
    const dayCls =
        "hover:bg-canvas hover:text-accent flex h-7 items-center justify-center rounded text-xs tabular-nums select-none";
    const footerBtnCls =
        "border-line hover:border-accent hover:text-accent rounded border px-2 py-0.5 text-xs";
</script>

<div bind:this={containerEl} class="relative">
    <input
        bind:this={fieldEl}
        {id}
        type="text"
        class={fieldCls}
        class:cursor-text={mode === "manual"}
        class:border-red-500={textError}
        readonly={mode !== "manual"}
        value={mode === "manual" ? textValue : displayText}
        placeholder={mode === "closed" ? placeholder : ""}
        aria-label="date"
        aria-invalid={textError ? "true" : undefined}
        oninput={(e) => {
            textValue = e.currentTarget.value;
        }}
        onclick={onFieldClick}
        onkeydown={onFieldKeyDown}
        onblur={onFieldBlur}
    />

    {#if mode === "picker"}
        <div
            class="bg-canvas-elev border-line absolute top-full z-40 mt-1 w-[16rem] rounded-md border p-2 shadow-xl"
            class:left-0={!alignRight}
            class:right-0={alignRight}
            role="dialog"
            aria-label="calendar"
        >
            <div class="flex items-center justify-between">
                <button
                    type="button"
                    class={arrowCls}
                    aria-label="previous month"
                    onclick={() => adjustMonth(-1)}>‹</button
                >
                <div class="text-fg-muted flex items-center gap-1 text-xs">
                    <span class="uppercase tracking-wider">month</span>
                    {#if editingMonth}
                        <input
                            bind:this={monthInputEl}
                            type="text"
                            inputmode="numeric"
                            class={headerInputCls}
                            value={pMonth}
                            onblur={commitMonthEdit}
                            onkeydown={onMonthKeyDown}
                            aria-label="month input"
                        />
                    {:else}
                        <button
                            type="button"
                            class="{headerNumCls} text-fg"
                            onclick={() => void startEditMonth()}
                            aria-label="edit month">{pMonth}</button
                        >
                    {/if}
                </div>
                <button
                    type="button"
                    class={arrowCls}
                    aria-label="next month"
                    onclick={() => adjustMonth(1)}>›</button
                >
            </div>

            <div class="mt-1 flex items-center justify-between">
                <button
                    type="button"
                    class={arrowCls}
                    aria-label="previous year"
                    onclick={() => adjustYear(-1)}>‹</button
                >
                <div class="flex items-center gap-1 text-sm">
                    {#if editingYear}
                        <input
                            bind:this={yearInputEl}
                            type="text"
                            inputmode="numeric"
                            class="{headerInputCls} w-20"
                            value={pYear}
                            onblur={commitYearEdit}
                            onkeydown={onYearKeyDown}
                            aria-label="year input"
                        />
                    {:else}
                        <button
                            type="button"
                            class="{headerNumCls} text-fg"
                            onclick={() => void startEditYear()}
                            aria-label="edit year">{pYear}</button
                        >
                    {/if}
                    <button
                        type="button"
                        class="border-line hover:border-accent hover:text-accent text-fg rounded border px-1.5 py-0.5 text-xs select-none"
                        onclick={toggleEra}
                        aria-label="toggle era">{pEra}</button
                    >
                </div>
                <button
                    type="button"
                    class={arrowCls}
                    aria-label="next year"
                    onclick={() => adjustYear(1)}>›</button
                >
            </div>

            <div class="mt-2 grid grid-cols-6 gap-0.5">
                {#each { length: 30 } as _, i}
                    {@const d = i + 1}
                    <button
                        type="button"
                        class={dayCls}
                        class:bg-accent={d === pDay}
                        class:text-canvas={d === pDay}
                        class:font-semibold={d === pDay}
                        aria-label="day {d}"
                        aria-pressed={d === pDay}
                        onclick={() => (pDay = d)}>{d}</button
                    >
                {/each}
            </div>

            <div class="border-line mt-2 flex items-center justify-between border-t pt-2">
                <label
                    class="text-fg-muted flex cursor-pointer items-center gap-1 text-xs select-none"
                >
                    <input
                        type="checkbox"
                        bind:checked={pApprox}
                        class="accent-accent"
                        aria-label="approximate"
                    />
                    approximate (~)
                </label>
                <div class="flex gap-1">
                    <button type="button" class={footerBtnCls} onclick={closePicker}>cancel</button>
                    <button
                        type="button"
                        class="{footerBtnCls} text-accent border-accent"
                        onclick={commitPicker}>done</button
                    >
                </div>
            </div>
        </div>
    {/if}

    {#if textError}
        <p class="mt-1 text-xs text-red-400" role="alert">{textError}</p>
    {/if}
</div>
