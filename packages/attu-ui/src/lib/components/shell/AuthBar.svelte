<!--
    sign-in / sign-out strip for the top bar.
    shows the user's display_name when signed in, or a "sign in" button.
-->
<script lang="ts">
    import { auth as authApi } from "@attu/api-client";
    import { authStore } from "../../state/auth.svelte.js";
    import { dockStore } from "../dock/store.svelte.js";
    import Button from "../ui/Button.svelte";
    import DockItem from "../dock/DockItem.svelte";
    import DockModal from "../dock/DockModal.svelte";
    import LinkCodeDialog from "./LinkCodeDialog.svelte";

    interface Props {
        onSignedIn?: (() => void) | undefined;
        onerror?: ((msg: string) => void) | undefined;
    }

    const { onSignedIn, onerror }: Props = $props();

    let linkCode = $state<{ code: string; expiresAt: string } | null>(null);

    // clear linkCode when the modal is dismissed externally (Escape or × on DockModal)
    $effect(() => {
        if (linkCode !== null && dockStore.activeModal !== "link-code") {
            linkCode = null;
        }
    });

    async function startSignIn(): Promise<void> {
        try {
            const r = await authApi.start();
            linkCode = { code: r.code, expiresAt: r.expires_at };
            dockStore.openModal("link-code");
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
        dockStore.closeModal();
        linkCode = null;
        onSignedIn?.();
    }

    function onClose(): void {
        dockStore.closeModal();
        linkCode = null;
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

<!-- link-code modal: registered permanently so DockSurface can render it -->
{#snippet linkCodeRender(_ctx: { forcedCollapse: boolean })}
    <DockModal id="link-code" title="Sign in with Discord">
        {#snippet children()}
            {#if linkCode}
                <LinkCodeDialog
                    code={linkCode.code}
                    expiresAt={linkCode.expiresAt}
                    {onSuccess}
                    {onClose}
                />
            {/if}
        {/snippet}
    </DockModal>
{/snippet}
<DockItem
    id="link-code"
    kind="modal"
    corner="bl"
    priority={0}
    title="Sign in with Discord"
    render={linkCodeRender}
/>
