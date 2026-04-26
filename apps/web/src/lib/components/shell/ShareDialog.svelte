<!--
    share / manage access dialog for a tree.
    adds / revokes grants by discord id (entered as text).
-->
<script lang="ts">
    import { trees as treesApi } from "$lib/api/client";
    import Button from "$lib/components/ui/Button.svelte";

    interface Props {
        treeId: string;
        onClose: () => void;
    }

    const { treeId, onClose }: Props = $props();

    let discordId = $state("");
    let role = $state<"viewer" | "editor">("editor");
    let message = $state<{ text: string; ok: boolean } | null>(null);
    let busy = $state(false);

    async function addGrant(): Promise<void> {
        const id = discordId.trim();
        if (!id) return;
        busy = true;
        message = null;
        try {
            await treesApi.addGrant(treeId, { discord_id: id, role });
            message = { text: `granted ${role} access to ${id}`, ok: true };
            discordId = "";
        } catch (err) {
            message = { text: String(err), ok: false };
        } finally {
            busy = false;
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={(e) => e.target === e.currentTarget && onClose()}
>
    <div class="bg-canvas-elev border-line w-full max-w-sm rounded-lg border p-6 shadow-lg">
        <h2 class="text-fg mb-4 text-base font-semibold">share tree</h2>

        <label for="share-discord-id" class="text-fg-muted mb-1 block text-xs">discord id</label>
        <input
            id="share-discord-id"
            type="text"
            class="border-line bg-canvas text-fg mb-3 w-full rounded border px-3 py-1.5 text-sm"
            placeholder="123456789012345678"
            bind:value={discordId}
        />

        <label for="share-role" class="text-fg-muted mb-1 block text-xs">role</label>
        <select
            id="share-role"
            class="border-line bg-canvas text-fg mb-4 w-full rounded border px-3 py-1.5 text-sm"
            bind:value={role}
        >
            <option value="editor">editor</option>
            <option value="viewer">viewer (read-only)</option>
        </select>

        {#if message}
            <p class="mb-3 text-sm {message.ok ? 'text-success' : 'text-error'}">{message.text}</p>
        {/if}

        <div class="flex gap-2">
            <Button
                type="button"
                variant="primary"
                disabled={busy || !discordId.trim()}
                onclick={addGrant}
            >
                {#snippet children()}{busy ? "sharing…" : "share"}{/snippet}
            </Button>
            <Button type="button" variant="ghost" onclick={onClose}>
                {#snippet children()}close{/snippet}
            </Button>
        </div>
    </div>
</div>
