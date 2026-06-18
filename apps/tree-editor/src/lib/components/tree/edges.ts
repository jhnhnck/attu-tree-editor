/*
 * FamilyTreeEditor - shared types for tree canvas (edge segments + node detail levels)
 * licensed under the MIT license; see LICENSE.md for full text
 */

import type { EdgeKind, EdgeRole } from "$lib/layout/edgeRouter";
import type { PersonId } from "$lib/domain/types";

/**
 * A segment ready for rendering in the canvas's local pixel coordinate space.
 * Produced by TreeCanvas by multiplying `routeEdges` output (in unit coords)
 * by UNIT. The renderer styles each segment by role; `hops` carries the
 * y-positions of bridge hops on vertical segments (Layer 3 will draw them
 * as arc breaks; the current `<line>` renderer ignores them).
 */
export interface RenderedSegment {
    readonly id: string;
    /** group key for one-`<path>`-per-bundle rendering and path-trace highlight */
    readonly bundleId: string;
    readonly kind: EdgeKind;
    readonly role: EdgeRole;
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    readonly hops?: readonly number[];
    /** people represented by this segment (for path highlighting) */
    readonly persons?: readonly PersonId[];
    /** Holten-2006 hierarchical-edge-bundling control point (pixel coords). */
    readonly bundleControl?: { readonly x: number; readonly y: number };
}

export type { EdgeKind, EdgeRole };

/**
 * Detail level for PersonNode, set by the canvas based on zoom.
 * 0 = full (portrait + name + dates), 5 = empty box.
 */
export type PersonNodeLevel = 0 | 1 | 2 | 3 | 4 | 5;
