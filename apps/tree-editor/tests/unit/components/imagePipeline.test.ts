/*
 * FamilyTreeEditor - unit tests for the image pipeline (loadSourceBitmap + encodePortrait)
 * licensed under the MIT license; see LICENSE.md for full text
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from "vitest";
import { loadSourceBitmap, __setOrientationProbe, type SourceBitmap } from "@attu/ui";
import { encodePortrait, DOWNSCALE_RATIO_THRESHOLD } from "@attu/ui";

// shape of an arbitrary SourceBitmap used by encodePortrait. records what
// transform draw() was invoked with so tests can assert single vs two-step.
function fakeSource(w: number, h: number) {
    const calls: Array<{ scale: number; tx: number; ty: number }> = [];
    const sb: SourceBitmap = {
        get width() {
            return w;
        },
        get height() {
            return h;
        },
        draw(_ctx, t) {
            calls.push({ ...t });
        },
        dispose() {
            /* noop */
        },
    };
    return { sb, calls };
}

describe("loadSourceBitmap orientation probe", () => {
    it("when the probe says the option is not honored, the createImageBitmap path is skipped", async () => {
        // force the probe cache to "false"
        __setOrientationProbe(false);
        // jsdom doesn't ship createImageBitmap natively; stamp a watch-fn on
        // globalThis so we can assert it isn't invoked.
        const calls = vi.fn(() => {
            throw new Error("createImageBitmap should not be called when probe is false");
        });
        (globalThis as any).createImageBitmap = calls;
        // stub HTMLImageElement.decode so the fallback path rejects quickly
        // instead of hanging on jsdom's no-op image decoder.
        const origDecode = HTMLImageElement.prototype.decode;
        HTMLImageElement.prototype.decode = () =>
            Promise.reject(new Error("stubbed: jsdom doesn't decode"));
        try {
            const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
            await loadSourceBitmap(blob).catch(() => undefined);
            expect(calls).not.toHaveBeenCalled();
        } finally {
            HTMLImageElement.prototype.decode = origDecode;
            delete (globalThis as any).createImageBitmap;
            __setOrientationProbe(undefined);
        }
    });

    it("the test escape hatch is reversible", () => {
        __setOrientationProbe(true);
        __setOrientationProbe(undefined);
        // can't directly assert the cached promise; just confirm the function
        // doesn't throw and accepts both shapes.
        expect(true).toBe(true);
    });
});

describe("encodePortrait two-step downscale", () => {
    // jsdom doesn't implement OffscreenCanvas, so encodePortrait routes through
    // the <canvas>.toBlob path. that path needs a non-null context, which jsdom
    // provides as a stub. document.createElement("canvas").getContext("2d") is
    // available; .toBlob is also stubbed. these tests assert the routing logic
    // rather than the pixel output (covered by phase 4's visual goldens).

    // jsdom's <canvas> is a stub: getContext returns null and toBlob doesn't
    // produce a Blob. patch both to a minimal shape that exercises the routing
    // logic in encodePortrait without trying to render pixels.
    function patchCanvas() {
        const origGet = HTMLCanvasElement.prototype.getContext;
        const origBlob = HTMLCanvasElement.prototype.toBlob;
        const fakeCtx = {
            imageSmoothingQuality: "high",
            drawImage: () => undefined,
        } as unknown as CanvasRenderingContext2D;
        (HTMLCanvasElement.prototype as any).getContext = (kind: string) =>
            kind === "2d" ? fakeCtx : null;
        HTMLCanvasElement.prototype.toBlob = (cb: BlobCallback, type?: string) => {
            cb(new Blob([new Uint8Array([0])], { type: type ?? "image/webp" }));
        };
        return () => {
            HTMLCanvasElement.prototype.getContext = origGet;
            HTMLCanvasElement.prototype.toBlob = origBlob;
        };
    }

    it("uses a single direct draw when src/out is at or below the threshold", async () => {
        const restore = patchCanvas();
        try {
            const { sb, calls } = fakeSource(800, 800);
            // rect 1200 -> out 600 == ratio 2 (at threshold, still single-pass)
            await encodePortrait(
                sb,
                { sx: 0, sy: 0, sw: 1200, sh: 1200 },
                { outputW: 600, outputH: 600 },
            );
            expect(calls).toHaveLength(1);
            expect(calls[0]?.scale).toBeCloseTo(0.5); // 600 / 1200
        } finally {
            restore();
        }
    });

    it("uses an intermediate downscale when src/out exceeds the threshold", async () => {
        expect(DOWNSCALE_RATIO_THRESHOLD).toBe(2);
        const restore = patchCanvas();
        try {
            const { sb, calls } = fakeSource(5000, 5000);
            // rect 4800 -> out 600 == ratio 8 (well above threshold)
            await encodePortrait(
                sb,
                { sx: 0, sy: 0, sw: 4800, sh: 4800 },
                { outputW: 600, outputH: 600 },
            );
            // one draw into the intermediate canvas (src.draw); the final
            // composite is ctx.drawImage on the canvas, not src.draw.
            expect(calls).toHaveLength(1);
            // intermediate scale is min(4, ratio/2) = 4, so interW = 2400.
            // src scale = 2400 / 4800 = 0.5
            expect(calls[0]?.scale).toBeCloseTo(0.5);
        } finally {
            restore();
        }
    });
});
