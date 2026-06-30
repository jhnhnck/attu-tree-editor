// SPDX-License-Identifier: MIT

import {
    EditorSelection,
    type ChangeSpec,
    type EditorState,
    type SelectionRange,
    type Text,
} from "@codemirror/state";
import type { Command } from "@codemirror/view";

// expand an empty range to the word under the cursor; stays empty if the
// cursor isn't on a word
function selectionOrWord(state: EditorState, range: SelectionRange): { from: number; to: number } {
    if (!range.empty) return range;
    return state.wordAt(range.from) ?? range;
}

function quoteRunBefore(doc: Text, pos: number): number {
    let n = 0;
    while (pos - n > 0 && doc.sliceString(pos - n - 1, pos - n) === "'") n++;
    return n;
}

function quoteRunAfter(doc: Text, pos: number): number {
    let n = 0;
    while (doc.sliceString(pos + n, pos + n + 1) === "'") n++;
    return n;
}

// '' = italic (2), ''' = bold (3), ''''' = bold+italic (5 = 2+3)
// weight 5 is the combined bold+italic toggle, not a sum of the other two
function nextQuoteCount(current: number, weight: 2 | 3 | 5): number {
    if (current === weight || current === 5) return current - weight;
    if (current === 0) return weight;
    if ((weight === 3 && current === 2) || (weight === 2 && current === 3)) return 5;
    // unrecognized run length (1, 4, 6+) - treat as no markup rather than guess
    return weight;
}

function toggleQuotes(weight: 2 | 3 | 5): Command {
    return (view) => {
        const { state } = view;
        const tr = state.changeByRange((range: SelectionRange) => {
            const { from, to } = selectionOrWord(state, range);
            if (from === to) return { range };

            const before = quoteRunBefore(state.doc, from);
            const after = quoteRunAfter(state.doc, to);
            const n = before === after ? before : 0;
            const newN = nextQuoteCount(n, weight);
            const quotes = "'".repeat(newN);

            const changes: ChangeSpec[] = [
                { from: from - n, to: from, insert: quotes },
                { from: to, to: to + n, insert: quotes },
            ];
            const delta = newN - n;
            return {
                changes,
                range: EditorSelection.range(from - n + newN, to + delta),
            };
        });
        view.dispatch(state.update(tr));
        return true;
    };
}

function toggleTag(open: string, close: string): Command {
    return (view) => {
        const { state } = view;
        const tr = state.changeByRange((range: SelectionRange) => {
            const { from, to } = selectionOrWord(state, range);
            if (from === to) return { range };

            const before = state.doc.sliceString(Math.max(0, from - open.length), from);
            const after = state.doc.sliceString(to, to + close.length);

            if (before === open && after === close) {
                const changes: ChangeSpec[] = [
                    { from: from - open.length, to: from },
                    { from: to, to: to + close.length },
                ];
                return {
                    changes,
                    range: EditorSelection.range(from - open.length, to - open.length),
                };
            }

            const changes: ChangeSpec[] = [
                { from, insert: open },
                { from: to, insert: close },
            ];
            return {
                changes,
                range: EditorSelection.range(from + open.length, to + open.length),
            };
        });
        view.dispatch(state.update(tr));
        return true;
    };
}

export const toggleBold = toggleQuotes(3);
export const toggleItalic = toggleQuotes(2);
export const toggleBoldItalic = toggleQuotes(5);
export const toggleStrikethrough = toggleTag("<s>", "</s>");
export const toggleSuperscript = toggleTag("<sup>", "</sup>");
export const toggleSubscript = toggleTag("<sub>", "</sub>");
export const toggleInlineCode = toggleTag("<code>", "</code>");
export const toggleNowiki = toggleTag("<nowiki>", "</nowiki>");
