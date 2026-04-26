/*
 * FamilyTreeEditor - shared types for tree canvas (edges + node detail levels)
 * licensed under the MIT license; see LICENSE.md for full text
 */

export type EdgeKind = "spouse" | "parent";

export interface DerivedEdge {
    kind: EdgeKind;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

/**
 * Detail level for PersonNode, set by the canvas based on zoom.
 * 0 = full (portrait + name + dates), 5 = empty box.
 */
export type PersonNodeLevel = 0 | 1 | 2 | 3 | 4 | 5;
