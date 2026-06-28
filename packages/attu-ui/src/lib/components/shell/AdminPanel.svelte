<!--
    admin panel body: list users, change roles, soft-delete.
    body-only component: wrapped in DockDialog by the caller.
    only rendered when authStore.user.role === 'admin'.
-->
<script lang="ts">
    import { onMount } from "svelte";
    import { admin as adminApi } from "@attu/api-client";
    import type { AdminUserListing } from "@attu/api-client";

    let users = $state<AdminUserListing[]>([]);
    let total = $state(0);
    let loading = $state(true);
    let error = $state<string | null>(null);

    onMount(async () => {
        await refresh();
    });

    async function refresh(): Promise<void> {
        loading = true;
        error = null;
        try {
            const r = await adminApi.listUsers();
            users = r.users;
            total = r.total;
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    async function deleteUser(user: AdminUserListing): Promise<void> {
        if (!confirm(`soft-delete ${user.display_name}? their sessions will be revoked.`)) return;
        try {
            await adminApi.deleteUser(user.id);
            await refresh();
        } catch (e) {
            error = String(e);
        }
    }
</script>

<div class="overflow-y-auto">
    <p class="text-fg-muted mb-2 text-xs">users ({total})</p>
    {#if loading}
        <p class="text-fg-muted text-sm">loading…</p>
    {:else if error}
        <p class="text-error text-sm">{error}</p>
    {:else}
        <table class="w-full text-sm">
            <thead>
                <tr class="text-fg-muted border-line border-b text-left text-xs">
                    <th class="pb-1 pr-4 font-normal">display name</th>
                    <th class="pb-1 pr-4 font-normal">discord</th>
                    <th class="pb-1 pr-4 font-normal">role</th>
                    <th class="pb-1 font-normal">actions</th>
                </tr>
            </thead>
            <tbody>
                {#each users as user (user.id)}
                    <tr class="border-line border-b last:border-0">
                        <td class="py-1.5 pr-4">
                            {user.display_name}
                            {#if user.deleted_at}
                                <span class="text-error ml-1 text-xs">(deleted)</span>
                            {/if}
                        </td>
                        <td class="text-fg-muted py-1.5 pr-4 font-mono text-xs"
                            >{user.discord_username}</td
                        >
                        <td class="py-1.5 pr-4">
                            <span
                                class="text-xs {user.role === 'admin'
                                    ? 'text-accent'
                                    : 'text-fg-muted'}"
                            >
                                {user.role}
                            </span>
                        </td>
                        <td class="py-1.5">
                            {#if !user.deleted_at}
                                <button
                                    type="button"
                                    class="text-error hover:text-error/80 cursor-pointer text-xs"
                                    onclick={() => void deleteUser(user)}
                                >
                                    delete
                                </button>
                            {/if}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    {/if}
</div>
