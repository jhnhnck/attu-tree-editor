<!--
    FamilyTreeEditor - mounts the gender-identity text input (with its
    datalist) sandwiched between two siblings so a keyboard-reachability
    spec can observe tab-in / printable-key / tab-out. mirrors the
    PersonalTab "gender identity" Field exactly, minus the surrounding
    sections, so the focus contract reads against the real markup.
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    interface Props {
        onblur?: (next: string) => void;
    }

    let { onblur = () => {} }: Props = $props();

    const inputCls =
        "bg-canvas border-line text-fg focus:border-accent focus:ring-accent w-full rounded-md border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none";

    const IDENTITY_PRESETS = ["male", "female", "unknown", "non-binary", "agender", "fluid"];
</script>

<div>
    <input type="text" data-testid="before" aria-label="before" />
    <input
        id="ip-identity"
        aria-label="gender identity"
        type="text"
        list="ip-identity-presets"
        onblur={(e: Event & { currentTarget: HTMLInputElement }) => onblur(e.currentTarget.value)}
        class={inputCls}
    />
    <datalist id="ip-identity-presets">
        {#each IDENTITY_PRESETS as preset (preset)}
            <option value={preset}></option>
        {/each}
    </datalist>
    <input type="text" data-testid="after" aria-label="after" />
</div>
