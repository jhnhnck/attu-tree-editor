/*
 * FamilyTreeEditor - runtime finding emitter (Phase 0 stub).
 *
 * Phase 4 wires this to a real server-side validator that emits structured
 * findings; today the emitter only fans out to in-memory subscribers so the
 * family-view editing affordances can surface a "feature coming with
 * relationship-vocabulary work" toast without a hidden silent failure.
 *
 * Kept distinct from `domain/validate.ts`'s `Finding` discriminated union:
 * that one describes *static* tree-shape findings produced during import or
 * validation passes. This module is for *runtime* findings — user actions
 * that the schema cannot yet represent — and intentionally has its own
 * vocabulary so the validator schema does not have to grow knobs for
 * every UI affordance.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

export type RuntimeFindingKind =
    | "multi-parent-unsupported"
    | "multi-partner-unsupported"
    | "schema-overflow";

export interface RuntimeFinding {
    readonly kind: RuntimeFindingKind;
    /** Human-facing summary; lowercase, no trailing period (style rule). */
    readonly detail: string;
    /** Free-form structured context; consumers may render selectively. */
    readonly data?: Readonly<Record<string, string | number>>;
}

type Listener = (f: RuntimeFinding) => void;
const listeners = new Set<Listener>();

/**
 * Subscribe to runtime findings. Returns an unsubscribe callback.
 * App.svelte registers a single listener that pushes a toast; tests
 * register their own listener to assert emission without depending on
 * the toast pipeline.
 */
export function onFinding(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * Emit a runtime finding. Phase 4 may add a second path (server POST)
 * for findings that need to round-trip through validation; today every
 * subscriber sees every emit.
 */
export function emitFinding(
    kind: RuntimeFindingKind,
    detail: string,
    data?: Readonly<Record<string, string | number>>,
): void {
    const finding: RuntimeFinding = data === undefined ? { kind, detail } : { kind, detail, data };
    for (const listener of listeners) listener(finding);
}
