<!--
    FamilyTreeEditor - about dialog (app identity, license, acknowledgments).
    licensed under the MIT license; see LICENSE.md for full text
-->
<script lang="ts">
    import Button from "$lib/components/ui/Button.svelte";

    interface Props {
        onClose: () => void;
    }

    const { onClose }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={(e) => e.target === e.currentTarget && onClose()}
>
    <div class="bg-canvas-elev border-line w-full max-w-md rounded-lg border p-6 shadow-lg">
        <div class="mb-4 flex items-center gap-3">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="40"
                height="45"
                viewBox="1749 135 438 489"
                class="shrink-0"
                aria-hidden="true"
            >
                <polygon
                    fill="var(--color-tree-trunk)"
                    stroke="var(--color-line)"
                    stroke-width="12"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-miterlimit="10"
                    points="2149.367,368.782 2139.871,359.289 2008.219,478.622 1996.79,322.486 1975.788,322.486 1961.608,516.185 1858.209,424.05 1848.711,433.542 1958.628,556.899 1954.167,617.83 2018.409,617.83 2011.329,521.102"
                />
                <path
                    fill="#0ea5e9"
                    stroke="#0369a1"
                    stroke-width="12"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-miterlimit="10"
                    d="M2083.975,238.967c0,70.953-26.738,97.688-97.687,97.688c-70.949,0-97.687-26.735-97.687-97.688c0-70.952,26.738-97.687,97.687-97.687C2057.237,141.281,2083.975,168.015,2083.975,238.967z"
                />
                <path
                    fill="#f43f5e"
                    stroke="#be123c"
                    stroke-width="12"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-miterlimit="10"
                    d="M1915.633,404.205c0,58.393-22.005,80.395-80.394,80.395c-58.39,0-80.395-22.002-80.395-80.395c0-58.392,22.005-80.395,80.395-80.395C1893.628,323.811,1915.633,345.813,1915.633,404.205z"
                />
                <path
                    fill="#fbbf24"
                    stroke="#d97706"
                    stroke-width="12"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-miterlimit="10"
                    d="M2181.424,388.904c0,42.997-16.204,59.198-59.197,59.198c-42.994,0-59.197-16.201-59.197-59.198c0-42.996,16.204-59.197,59.197-59.197C2165.22,329.707,2181.424,345.908,2181.424,388.904z"
                />
            </svg>
            <div>
                <h2 class="text-fg text-base font-semibold">family tree editor</h2>
                <p class="text-fg-muted text-xs">
                    for the <a
                        href="https://attuproject.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-accent hover:text-accent-strong underline">attu project</a
                    > wiki universe
                </p>
            </div>
        </div>

        <p class="text-fg-muted mb-3 text-xs">
            licensed under the MIT license. copyright 2026 john hancock, the attu project.
        </p>

        <h3 class="text-fg-muted mb-1 text-xs">acknowledgments</h3>
        <ul class="text-fg-muted mb-4 list-disc pl-5 text-xs">
            <li>
                tree icon remixed from <a
                    href="https://www.freevector.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-accent hover:text-accent-strong underline">www.freevector.com</a
                >
            </li>
        </ul>

        <div class="flex justify-end">
            <Button type="button" variant="ghost" onclick={onClose}>
                {#snippet children()}close{/snippet}
            </Button>
        </div>
    </div>
</div>
