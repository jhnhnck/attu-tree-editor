/*
 * FamilyTreeEditor - canvas viewport state (pan offset + zoom level)
 * licensed under the MIT license; see LICENSE.md for full text
 */

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;

export interface ViewportStore {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
    setPan(x: number, y: number): void;
    setZoom(zoom: number): void;
    reset(): void;
}

export function createViewportStore(): ViewportStore {
    let x = $state(0);
    let y = $state(0);
    let zoom = $state(1);

    return {
        get x() {
            return x;
        },
        get y() {
            return y;
        },
        get zoom() {
            return zoom;
        },
        setPan(nx, ny): void {
            x = nx;
            y = ny;
        },
        setZoom(next): void {
            zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
        },
        reset(): void {
            x = 0;
            y = 0;
            zoom = 1;
        },
    };
}
