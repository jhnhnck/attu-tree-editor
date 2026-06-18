/*
 * FamilyTreeEditor - ambient type references for vite + svelte
 * licensed under the MIT license; see LICENSE.md for full text
 */

/// <reference types="svelte" />
/// <reference types="vite/client" />

interface TreeDebugHandle {
    /**
     * Active engine that populated this handle. Hyperbolic and family-view
     * canvases both mount onto the same `window.__treeDebug` name; the
     * discriminator lets devtools readers tell which engine's shape they
     * see. `undefined` for backwards compatibility — the layered engine
     * (which has populated this handle since v1) doesn't set it today,
     * and existing readers gate on engine state in the UI rather than on
     * this field. Family-view sets `"family-view"` so its consumers can
     * confirm the right canvas is mounted.
     */
    engine?: "layered" | "hyperbolic" | "family-view";
    /**
     * Layered-engine layout result. Undefined while the hyperbolic engine
     * is active (which mounts its own debug surface on the same handle).
     */
    layout?: import("$lib/components/tree/canvasLayout").HvLayoutResult;
    rawSegments: readonly import("$lib/layout/edgeRouter").Segment[];
    positions: ReadonlyMap<string, { x: number; y: number }>;
    /** LayeredGraph — undefined until the first worker response arrives. */
    layeredGraph?: import("$lib/layout/ir").LayeredGraph;
    /** OrderedGraph — undefined until the first worker response arrives. */
    orderedGraph?: import("$lib/layout/ir").OrderedGraph;
    /** PlacedGraph — undefined until the first worker response arrives. */
    placedGraph?: import("$lib/layout/ir").PlacedGraph;
    /**
     * Person ids implicated in a parent-DAG cycle, populated by the layering
     * pass. Empty / absent on acyclic trees.
     */
    cycleNodes?: readonly string[];
    /**
     * Per-pass wall-clock timings (ms) from the most recent layered-engine
     * run. Undefined while the hyperbolic engine is active.
     */
    timings?: import("$lib/layout/engines/layered-hv").LayeredEngineTimings;
    /**
     * Non-fatal anomalies from the most recent layout pass. Empty on a clean
     * run; populated entries indicate `route()` invariant violations
     * (negative drops, etc.) or future pass-level warnings. Replaces direct
     * `console.warn` calls so symptoms can be inspected post-hoc.
     */
    warnings: readonly import("$lib/layout/ir").LayoutWarning[];
    dumpSegment(id: string): void;
    findPath(id1: string, id2: string): void;
    /**
     * DOI scoring lookup — set while the hyperbolic canvas is mounted.
     * Returns `undefined` for persons outside the proband's component.
     */
    doi?(id: string): import("$lib/layout/doi").DoiScore | undefined;
    /** Current DOI clusters; only meaningful while the hyperbolic canvas is mounted. */
    clusters?: readonly import("$lib/layout/doi").ClusterGlyph[];
    /**
     * Family-view layout snapshot — set while `FamilyViewCanvas` is mounted
     * and `debugOptions.layers.exposeFamilyDebug` is on. Phase 0 walking
     * skeleton; phases 1-5 extend the shape (subset rejections, edge
     * roles, focus events, coi breakdown).
     */
    familyView?: {
        readonly focus: import("$lib/domain/types").PersonId;
        /** Full FamilyViewLayout (nodes + anchors + edges + badges + bbox). */
        readonly layout: import("$lib/layout/engines/family-view").FamilyViewLayout;
        /** Visible / rank / hasMoreChildren / hasMoreParents from `selectBoundedSubset`. */
        readonly subset: {
            readonly visible: ReadonlySet<import("$lib/domain/types").PersonId>;
            readonly rank: ReadonlyMap<import("$lib/domain/types").PersonId, number>;
            readonly hasMoreChildren: ReadonlySet<import("$lib/domain/types").PersonId>;
            readonly hasMoreParents: ReadonlySet<import("$lib/domain/types").PersonId>;
            /**
             * Phase 1 of the family-view-debug plan: per-person rejection
             * reason for every person not in `visible`. Keys never overlap
             * with `visible`; together they cover the full `tree.people`
             * keyset. Read by the `showOffSubsetPeople` overlay to surface
             * why floating-people are floating.
             */
            readonly rationale: ReadonlyMap<
                import("$lib/domain/types").PersonId,
                import("$lib/layout/engines/family-view").RejectionReason
            >;
        };
        /** Explicit-expansion set (persisted per `(treeId, focusId)`). */
        readonly expansion: ReadonlySet<import("$lib/domain/types").PersonId>;
        /** Per-person primary-union override → coupleIndex. */
        readonly primaryUnion: ReadonlyMap<import("$lib/domain/types").PersonId, number>;
        /** Per-person expanded-secondary-union set → coupleIndexes. */
        readonly secondaryUnion: ReadonlyMap<
            import("$lib/domain/types").PersonId,
            ReadonlySet<number>
        >;
        /** Mirror of `App.svelte`'s `selectedPersonId` for cross-check. */
        readonly selectedId: import("$lib/domain/types").PersonId | undefined;
        /** BFS path set from focus to selected, for the path-highlight overlay. */
        readonly pathHighlight: ReadonlySet<import("$lib/domain/types").PersonId>;
    };
    /**
     * Phase 4 of the family-view-debug plan: COI inspector snapshot.
     * Populated alongside `familyView` when the active focus has at
     * least one duplicate ancestor (i.e. `computeAncestorOverlap`
     * returned a non-`EMPTY` value). Absent on probands with no
     * detected consanguinity. The breakdown rows already sum to
     * `rawCoi` within float-precision drift — diff against the
     * displayed rounded percent to spot a rendering rounding bug.
     */
    coi?: {
        readonly duplicates: readonly import("$lib/domain/types").PersonId[];
        readonly rawCoi: number;
        readonly breakdown: readonly import("$lib/domain/consanguinity").CoiBreakdownRow[];
        readonly cacheHits: number;
        readonly cacheMisses: number;
        readonly editRev: number;
    };
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
