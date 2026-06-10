<!--
    FamilyTreeEditor - mounts the AGAB (assigned-at-birth) select element
    sandwiched between two sibling inputs so a keyboard-reachability spec
    can observe tab-in / keyboard-driven selection / tab-out. mirrors the
    PersonalTab "assigned at birth" Field exactly, minus the surrounding
    sections, so the focus contract reads against the real markup.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    interface Props {
        onchange?: (next: string) => void;
    }

    let { onchange = () => {} }: Props = $props();

    const inputCls =
        "bg-canvas border-line text-fg focus:border-accent focus:ring-accent w-full rounded-md border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none";
</script>

<div>
    <input type="text" data-testid="before" aria-label="before" />
    <select
        id="ip-aab"
        aria-label="assigned at birth"
        onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
            onchange(e.currentTarget.value)}
        class={inputCls}
    >
        <option value="">(unset)</option>
        <option value="AMAB">AMAB</option>
        <option value="AFAB">AFAB</option>
        <option value="UAAB">UAAB</option>
    </select>
    <input type="text" data-testid="after" aria-label="after" />
</div>
