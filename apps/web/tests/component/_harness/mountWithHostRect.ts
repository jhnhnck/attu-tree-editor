/* SPDX-License-Identifier: MIT */
/*
 * FamilyTreeEditor - test helper: mount a svelte component with a stubbed
 * host bounding rect so fit/zoom/pan effects see non-zero dims.
 *
 * jsdom returns zero-rects from every `getBoundingClientRect` call - the
 * fit-effects in `FamilyViewCanvas` / `TreeCanvas` / `HyperbolicCanvas`
 * short-circuit on a zero host, and nothing observable lands in the dom.
 *
 * `mountWithHostRect` stubs `Element.prototype.getBoundingClientRect` for
 * the lifetime of the mount with the supplied rect, then restores the
 * original on `unmount()`. one rect for every element is enough: the only
 * reader we care about is the host itself, and the chrome-inset measurement
 * (`measureCanvasChromeInsets`) walks `[data-canvas-chrome]` overlays which
 * are absent in unit-tests anyway.
 *
 * the helper is the extracted form of the pattern already in use by
 * `auto-fit-suppression.test.ts`; future specs in phase 1c / phase 4 can
 * import it instead of re-inlining the same shim.
 */

import { mount, unmount } from "svelte";
import type { Component } from "svelte";

export interface HostRect {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
}

const DEFAULT_HOST_RECT: HostRect = {
    x: 0,
    y: 0,
    width: 1024,
    height: 768,
    top: 0,
    left: 0,
    right: 1024,
    bottom: 768,
};

export interface MountWithHostRectResult {
    container: HTMLElement;
    unmount(): void;
}

export interface MountWithHostRectOptions<Props extends Record<string, unknown>> {
    props: Props;
    hostRect?: Partial<HostRect>;
}

/**
 * mount a svelte 5 component inside a fresh container appended to
 * `document.body`. every `getBoundingClientRect()` call on any element
 * returns the supplied rect until `unmount()` restores the prototype.
 *
 * pair with a synthetic `ResizeObserver` shim if the component reads its
 * host size via RO; the global no-op shim in `tests/setup.ts` is enough
 * to clear the ReferenceError but does not fire entries on its own.
 */
export function mountWithHostRect<Props extends Record<string, unknown>>(
    Comp: Component<Props>,
    options: MountWithHostRectOptions<Props>,
): MountWithHostRectResult {
    const rect: HostRect = { ...DEFAULT_HOST_RECT, ...(options.hostRect ?? {}) };
    // re-derive right/bottom if width/height were overridden without them
    if (options.hostRect?.width !== undefined && options.hostRect.right === undefined) {
        rect.right = rect.left + rect.width;
    }
    if (options.hostRect?.height !== undefined && options.hostRect.bottom === undefined) {
        rect.bottom = rect.top + rect.height;
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const origGetRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
        return {
            x: rect.x,
            y: rect.y,
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            toJSON() {
                return this;
            },
        };
    };

    const container = document.createElement("div");
    document.body.appendChild(container);

    let instance: ReturnType<typeof mount>;
    try {
        instance = mount(Comp, {
            target: container,
            props: options.props,
        });
    } catch (err) {
        Element.prototype.getBoundingClientRect = origGetRect;
        container.remove();
        throw err;
    }

    return {
        container,
        unmount(): void {
            try {
                void unmount(instance);
            } finally {
                container.remove();
                Element.prototype.getBoundingClientRect = origGetRect;
            }
        },
    };
}
