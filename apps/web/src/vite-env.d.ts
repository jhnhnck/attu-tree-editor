/*
 * FamilyTreeEditor - ambient type references for vite + svelte
 * licensed under the MIT license; see LICENSE.md for full text
 */

/// <reference types="svelte" />
/// <reference types="vite/client" />

/** runtime config injected into index.html by the fastapi server, sourced
 * from `data/trees-config.toml`. lets one image serve any environment by
 * swapping the toml; see notes/agents.md §4. */
interface TreesRuntimeConfig {
	wikiBaseUrl?: string;
	environment?: "dev" | "prod";
}

interface Window {
	__TREES_CONFIG__?: TreesRuntimeConfig;
}
