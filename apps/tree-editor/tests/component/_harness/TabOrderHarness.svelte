<!--
    FamilyTreeEditor - parent that places DateInput between two sibling fields
    so tab order is observable for keyboard-reachability specs
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import { DateInput } from "@attu/ui";
    import type { HaracalndeDateData } from "@attu/ui";

    interface Props {
        value?: HaracalndeDateData | undefined;
        onchange?: (next: HaracalndeDateData | undefined) => void;
    }

    let { value = undefined, onchange = () => {} }: Props = $props();
</script>

<div>
    <input type="text" data-testid="before" aria-label="before" />
    <DateInput {value} {onchange} />
    <input type="text" data-testid="after" aria-label="after" />
</div>
