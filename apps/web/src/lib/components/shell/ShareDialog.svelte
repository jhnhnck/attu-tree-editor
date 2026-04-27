<!--
    share / manage access dialog for a tree.
    - copy view-link button (clipboard)
    - list current grants with revoke
    - add grant by discord id
-->
<script lang="ts">
    import { onMount } from "svelte";
    import { Copy, Link as LinkIcon } from "@lucide/svelte";
    import { trees as treesApi } from "$lib/api/client";
    import type { GrantListing } from "$lib/api/client";
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

    let grants = $state<GrantListing[]>([]);
    let loadingGrants = $state(true);
    let grantsError = $state<string | null>(null);

    // transient "copied!" feedback
    let copied = $state(false);
    let copyTimer: ReturnType<typeof setTimeout> | undefined;

    onMount(() => {
        void refresh();
        return () => {
            if (copyTimer !== undefined) clearTimeout(copyTimer);
        };
    });

    async function refresh(): Promise<void> {
        loadingGrants = true;
        grantsError = null;
        try {
            const r = await treesApi.listGrants(treeId);
            grants = r.grants;
        } catch (e) {
            grantsError = String(e);
        } finally {
            loadingGrants = false;
        }
    }

    async function addGrant(): Promise<void> {
        const id = discordId.trim();
        if (!id) return;
        busy = true;
        message = null;
        try {
            await treesApi.addGrant(treeId, { discord_id: id, role });
            message = { text: `granted ${role} access to ${id}`, ok: true };
            discordId = "";
            await refresh();
        } catch (err) {
            message = { text: String(err), ok: false };
        } finally {
            busy = false;
        }
    }

    async function revoke(g: GrantListing): Promise<void> {
        if (!confirm(`Revoke ${g.role} access for ${g.display_name}?`)) return;
        try {
            await treesApi.revokeGrant(treeId, g.user_id);
            await refresh();
        } catch (e) {
            grantsError = String(e);
        }
    }

    const viewUrl = $derived(`${window.location.origin}/view/${treeId}`);

    async function copyLink(): Promise<void> {
        try {
            await navigator.clipboard.writeText(viewUrl);
            copied = true;
            if (copyTimer !== undefined) clearTimeout(copyTimer);
            copyTimer = setTimeout(() => (copied = false), 1800);
        } catch (e) {
            message = { text: `copy failed: ${String(e)}`, ok: false };
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={(e) => e.target === e.currentTarget && onClose()}
>
    <div class="bg-canvas-elev border-line w-full max-w-md rounded-lg border p-6 shadow-lg">
        <h2 class="text-fg mb-4 text-base font-semibold">share tree</h2>

        <!-- view-link copy -->
        <div class="border-line bg-canvas mb-4 flex items-center gap-2 rounded border px-2 py-1.5">
            <LinkIcon size={14} class="text-fg-muted shrink-0" />
            <span class="text-fg-muted flex-1 truncate font-mono text-xs" title={viewUrl}>
                {viewUrl}
            </span>
            <button
                type="button"
                class="text-fg hover:bg-canvas-elev inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
                onclick={() => void copyLink()}
                data-testid="copy-view-link"
                aria-label="copy view link"
            >
                <Copy size={12} />
                {copied ? "copied!" : "copy"}
            </button>
        </div>

        <!-- current shares -->
        <h3 class="text-fg-muted mb-1 text-xs">current shares</h3>
        <div class="border-line bg-canvas mb-4 max-h-40 overflow-y-auto rounded border">
            {#if loadingGrants}
                <p class="text-fg-muted px-3 py-2 text-xs">loading…</p>
            {:else if grantsError}
                <p class="text-error px-3 py-2 text-xs">{grantsError}</p>
            {:else if grants.length === 0}
                <p class="text-fg-muted px-3 py-2 text-xs italic">no shares yet</p>
            {:else}
                <ul>
                    {#each grants as g (g.user_id)}
                        <li
                            class="border-line/60 flex items-center gap-2 border-b px-3 py-1.5 text-xs last:border-b-0"
                        >
                            <span class="text-fg flex-1 truncate">{g.display_name}</span>
                            <span class="text-fg-muted">{g.role}</span>
                            <button
                                type="button"
                                class="text-error hover:text-error/80"
                                onclick={() => void revoke(g)}
                                aria-label="revoke {g.display_name}"
                            >
                                revoke
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>

        <!-- add grant -->
        <h3 class="text-fg-muted mb-1 text-xs">grant access</h3>
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
