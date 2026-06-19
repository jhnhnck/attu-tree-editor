/*
 * AttuUI - vitest setup; pulls in jest-dom matchers + cleanup
 * licensed under the MIT license; see LICENSE.md for full text
 */

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/svelte";

// global jsdom shims for browser apis vitest's jsdom environment omits.
// each shim is a no-op: it satisfies the runtime presence check so component
// `$effect`s that construct one don't throw, but never dispatches anything.
// specs that actually need synthetic dispatch (e.g. auto-fit-suppression)
// install a local synthetic observer over the top in beforeEach and restore
// in afterEach - the global shim is the floor, not the contract.
//
// rationale: see notes/dev/test-strategy.md - the hyperbolic-mount probe
// observed that the first $effect in HyperbolicCanvas calls
// `new ResizeObserver(...)` and aborts the mount with ReferenceError when
// no shim is present. the same pattern (`new ResizeObserver`,
// `new IntersectionObserver`, `window.matchMedia(...)`) recurs across the
// chrome surfaces phase-1c is about to migrate.

interface ObserverShim {
    observe(_target?: unknown): void;
    unobserve(_target?: unknown): void;
    disconnect(): void;
    takeRecords?(): unknown[];
}

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
    class ResizeObserverShim implements ObserverShim {
        observe(): void {
            // no-op
        }
        unobserve(): void {
            // no-op
        }
        disconnect(): void {
            // no-op
        }
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverShim;
}

if (
    typeof (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver === "undefined"
) {
    class IntersectionObserverShim implements ObserverShim {
        observe(): void {
            // no-op
        }
        unobserve(): void {
            // no-op
        }
        disconnect(): void {
            // no-op
        }
        takeRecords(): unknown[] {
            return [];
        }
    }
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
        IntersectionObserverShim;
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {
            // no-op, legacy api retained for older callers
        },
        removeListener: () => {
            // no-op, legacy api retained for older callers
        },
        addEventListener: () => {
            // no-op
        },
        removeEventListener: () => {
            // no-op
        },
        dispatchEvent: () => false,
    });
}

// svelte transition directives (fade, fly, etc.) use the web animations api
// (`element.animate()`) which jsdom does not implement. stub it with a no-op
// animation object so transition:fade on FamilyViewCanvas cards and badges
// doesn't throw "element.animate is not a function" in component tests.
if (
    typeof Element !== "undefined" &&
    typeof (Element.prototype as { animate?: unknown }).animate !== "function"
) {
    (Element.prototype as { animate: unknown }).animate = function animate() {
        // returns a minimal animation-like object so callers that destructure
        // or chain `.finished` / `.cancel()` don't throw a secondary error
        return {
            finished: Promise.resolve(),
            cancel() {
                // no-op
            },
            addEventListener() {
                // no-op
            },
            removeEventListener() {
                // no-op
            },
        };
    };
}

afterEach(() => {
    cleanup();
});
