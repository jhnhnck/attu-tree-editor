<!--
    sign-in / sign-out strip for the top bar.
    shows the user's display_name when signed in, or a "sign in" button.
-->
<script lang="ts">
    import { auth as authApi } from "$lib/api/client";
    import { authStore } from "$lib/state/auth.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import LinkCodeDialog from "$lib/components/shell/LinkCodeDialog.svelte";

    interface Props {
        onSignedIn?: (() => void) | undefined;
        onerror?: ((msg: string) => void) | undefined;
    }

    const { onSignedIn, onerror }: Props = $props();

    let linkCode = $state<{ code: string; expiresAt: string } | null>(null);

    async function startSignIn(): Promise<void> {
        try {
            const r = await authApi.start();
            linkCode = { code: r.code, expiresAt: r.expires_at };
        } catch {
            onerror?.("could not start sign-in. is the server running?");
        }
    }

    async function signOut(): Promise<void> {
        try {
            await authApi.logout();
        } finally {
            authStore.clear();
        }
    }

    function onSuccess(): void {
        linkCode = null;
        onSignedIn?.();
    }
</script>

{#if authStore.user}
    <span class="text-fg-muted text-sm" title={authStore.user.discord_username}>
        {authStore.user.display_name}
    </span>
    <Button type="button" variant="ghost" onclick={signOut}>
        {#snippet children()}sign out{/snippet}
    </Button>
{:else}
    <Button type="button" variant="ghost" onclick={startSignIn}>
        {#snippet children()}sign in{/snippet}
    </Button>
{/if}

{#if linkCode}
    <LinkCodeDialog
        code={linkCode.code}
        expiresAt={linkCode.expiresAt}
        {onSuccess}
        onClose={() => (linkCode = null)}
    />
{/if}
