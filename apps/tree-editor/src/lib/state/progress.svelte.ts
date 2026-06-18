/*
 * FamilyTreeEditor - progress rune store.
 * Tracks in-flight operations; exposes active/label/fraction for ProgressStrip.
 * Visibility is debounced 150ms so sub-150ms saves never flash the strip.
 *
 * licensed under the MIT license; see LICENSE.md for full text
 */

export interface ProgressHandle {
    readonly id: number;
}

export interface ProgressStore {
    /** true once an operation has been active for ≥150ms */
    readonly visible: boolean;
    /** label of the most recently started operation */
    readonly label: string;
    /** 0–1 fraction if known, undefined for indeterminate */
    readonly fraction: number | undefined;
    start(label: string): ProgressHandle;
    update(handle: ProgressHandle, fraction: number): void;
    finish(handle: ProgressHandle): void;
}

export function createProgressStore(): ProgressStore {
    interface Op {
        id: number;
        label: string;
        fraction: number | undefined;
    }

    let ops = $state<Op[]>([]);
    let visible = $state(false);
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let nextId = 0;

    function scheduleShow(): void {
        if (visible || showTimer !== undefined) return;
        showTimer = setTimeout(() => {
            showTimer = undefined;
            if (ops.length > 0) visible = true;
        }, 150);
    }

    function maybeHide(): void {
        if (ops.length === 0) {
            clearTimeout(showTimer);
            showTimer = undefined;
            visible = false;
        }
    }

    return {
        get visible() {
            return visible;
        },
        get label() {
            return ops[ops.length - 1]?.label ?? "";
        },
        get fraction() {
            return ops[ops.length - 1]?.fraction;
        },
        start(label): ProgressHandle {
            const id = nextId++;
            ops = [...ops, { id, label, fraction: undefined }];
            scheduleShow();
            return { id };
        },
        update(handle, fraction): void {
            ops = ops.map((op) => (op.id === handle.id ? { ...op, fraction } : op));
        },
        finish(handle): void {
            ops = ops.filter((op) => op.id !== handle.id);
            maybeHide();
        },
    };
}
