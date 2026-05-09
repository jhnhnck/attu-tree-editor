/*
 * FamilyTreeEditor - ambient type references for vite + svelte
 * licensed under the MIT license; see LICENSE.md for full text
 */

/// <reference types="svelte" />
/// <reference types="vite/client" />

interface TreeDebugHandle {
	layout: import("$lib/layout/hvLayout").HvLayoutResult;
	rawSegments: readonly import("$lib/layout/edgeRouter").Segment[];
	positions: ReadonlyMap<string, { x: number; y: number }>;
	/** LayeredGraph — undefined until the first worker response arrives. */
	layeredGraph?: import("$lib/layout/ir").LayeredGraph;
	/** OrderedGraph — undefined until the first worker response arrives. */
	orderedGraph?: import("$lib/layout/ir").OrderedGraph;
	/** PlacedGraph — undefined until the first worker response arrives. */
	placedGraph?: import("$lib/layout/ir").PlacedGraph;
	dumpSegment(id: string): void;
	findPath(id1: string, id2: string): void;
}

/** runtime config injected into index.html by the fastapi server, sourced
 * from `data/trees-config.toml`. lets one image serve any environment by
 * swapping the toml; see notes/agents.md §4. */
interface TreesRuntimeConfig {
	wikiBaseUrl?: string;
	environment?: "dev" | "prod";
}

interface Window {
	__treeDebug?: TreeDebugHandle;
	__TREES_CONFIG__?: TreesRuntimeConfig;
}
