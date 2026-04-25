<!--
    FamilyTreeEditor - top-level shell component; expanded with real ui in phase 3
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    let now = $state(new Date());

    $effect(() => {
        const id = setInterval(() => {
            now = new Date();
        }, 1000);
        return () => clearInterval(id);
    });

    let stamp = $derived(now.toISOString().replace("T", " ").slice(0, 19));
</script>

<main class="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
    <h1 class="text-fg text-3xl font-semibold tracking-tight">family tree editor</h1>
    <p class="text-fg-muted text-sm">phase 0 shell. real ui ships in phase 3.</p>
    <p class="text-fg-muted font-mono text-xs">
        {stamp}
    </p>
</main>
