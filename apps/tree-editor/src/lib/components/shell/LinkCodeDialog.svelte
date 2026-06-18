<!--
    sign-in dialog: shows a 6-char code, polls /api/auth/check, closes on ok.
    the code was issued by the server when the user clicked "sign in" in AuthBar.
-->
<script lang="ts">
    import { onDestroy } from "svelte";
    import { auth as authApi } from "$lib/api/client";
    import { authStore } from "$lib/state/auth.svelte";
    import Button from "$lib/components/ui/Button.svelte";

    interface Props {
        code: string;
        expiresAt: string;
        onSuccess: () => void;
        onClose: () => void;
    }

    const { code, expiresAt, onSuccess, onClose }: Props = $props();

    let copied = $state(false);
    let status = $state<"pending" | "ok" | "expired" | "not_found">("pending");
    let secondsLeft = $state(0);

    function computeSecondsLeft(): number {
        return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    }

    secondsLeft = computeSecondsLeft();

    const ticker = setInterval(() => {
        secondsLeft = computeSecondsLeft();
        if (secondsLeft === 0) stop();
    }, 1000);

    const poller = setInterval(() => {
        if (status !== "pending") return;
        void (async () => {
            try {
                const r = await authApi.check();
                status = r.status;
                if (r.status === "ok") {
                    stop();
                    await authStore.fetch();
                    onSuccess();
                } else if (r.status === "expired") {
                    stop();
                }
            } catch {
                // ignore transient network errors
            }
        })();
    }, 2000);

    function stop(): void {
        clearInterval(ticker);
        clearInterval(poller);
    }

    onDestroy(stop);

    async function copyCode(): Promise<void> {
        await navigator.clipboard.writeText(code);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }

    const minutes = $derived(Math.floor(secondsLeft / 60));
    const seconds = $derived(secondsLeft % 60);
    const expiredOrNotFound = $derived(
        status === "expired" || status === "not_found" || secondsLeft === 0,
    );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={(e) => e.target === e.currentTarget && onClose()}
>
    <div class="bg-canvas-elev border-line w-full max-w-sm rounded-lg border p-6 shadow-lg">
        <h2 class="text-fg mb-1 text-base font-semibold">sign in with discord</h2>
        <p class="text-fg-muted mb-5 text-sm">
            run this command in any discord channel where the bot is present:
        </p>

        <div class="border-line bg-canvas mb-2 rounded border p-3 text-center font-mono text-sm">
            /trees link code:<span class="text-accent font-bold">{code}</span>
        </div>

        <button
            type="button"
            class="text-fg-muted hover:text-fg mb-4 w-full cursor-pointer text-center text-xs"
            onclick={copyCode}
        >
            {copied ? "copied!" : "copy command"}
        </button>

        {#if expiredOrNotFound}
            <p class="text-error mb-4 text-center text-sm">
                code expired. close and click "sign in" for a new one.
            </p>
        {:else if status === "ok"}
            <p class="text-success mb-4 text-center text-sm">linked! signing you in…</p>
        {:else}
            <p class="text-fg-muted mb-4 text-center text-sm">
                waiting for discord…
                <span class="tabular-nums">
                    {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </span>
            </p>
        {/if}

        <Button type="button" variant="ghost" onclick={onClose}>
            {#snippet children()}cancel{/snippet}
        </Button>
    </div>
</div>
