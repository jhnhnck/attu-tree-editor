/*
 * FamilyTreeEditor - small toast queue (auto-dismiss, manual close, stackable)
 * licensed under the MIT license; see LICENSE.md for full text
 */

export type ToastKind = "info" | "error" | "success";

export interface Toast {
    id: string;
    message: string;
    kind: ToastKind;
}

export interface ToastsStore {
    readonly toasts: readonly Toast[];
    /** push a toast; returns its id. duration in ms (default 10s) */
    push(message: string, kind?: ToastKind, durationMs?: number): string;
    dismiss(id: string): void;
}

const DEFAULT_DURATION_MS = 10_000;
let nextId = 0;

export function createToastsStore(): ToastsStore {
    let toasts = $state<Toast[]>([]);

    function dismiss(id: string): void {
        toasts = toasts.filter((t) => t.id !== id);
    }

    return {
        get toasts() {
            return toasts;
        },
        push(message, kind = "info", durationMs = DEFAULT_DURATION_MS): string {
            nextId += 1;
            const id = `t${String(nextId)}`;
            toasts = [...toasts, { id, message, kind }];
            if (durationMs > 0) {
                setTimeout(() => dismiss(id), durationMs);
            }
            return id;
        },
        dismiss,
    };
}
