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

// --- phase 1: block structure commands ---

type RangeResult = { changes: ChangeSpec; range: SelectionRange } | { range: SelectionRange };

// replace the whole line containing range.head. if the cursor sits inside the
// unchanged tail shared by old and new text (true for every prefix add/remove
// transform below), shift it by the length delta so it stays on the same
// character; otherwise clamp into the new line (e.g. setHeading's rewrap, where
// both ends change and "same character" isn't well defined)
function transformLine(
    state: EditorState,
    range: SelectionRange,
    transform: (text: string) => string,
): RangeResult {
    const line = state.doc.lineAt(range.head);
    const oldText = line.text;
    const newText = transform(oldText);
    if (newText === oldText) return { range };

    const headInLine = range.head - line.from;
    let suffixLen = 0;
    while (
        suffixLen < oldText.length &&
        suffixLen < newText.length &&
        oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
    ) {
        suffixLen++;
    }
    const unchangedSuffixStart = oldText.length - suffixLen;
    const delta = newText.length - oldText.length;
    const newHeadInLine =
        headInLine >= unchangedSuffixStart
            ? headInLine + delta
            : Math.min(headInLine, newText.length);

    return {
        changes: { from: line.from, to: line.to, insert: newText },
        range: EditorSelection.cursor(line.from + Math.max(0, newHeadInLine)),
    };
}

// apply a prefix-only transform to every line spanned by [range.from, range.to]
function transformLines(
    state: EditorState,
    range: SelectionRange,
    transform: (text: string) => string,
): RangeResult {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);
    const changes: ChangeSpec[] = [];
    let deltaAtFrom = 0;
    let deltaAtTo = 0;
    for (let n = fromLine.number; n <= toLine.number; n++) {
        const line = state.doc.line(n);
        const newText = transform(line.text);
        const lineDelta = newText.length - line.text.length;
        if (lineDelta === 0) continue;
        changes.push({ from: line.from, to: line.to, insert: newText });
        if (line.from <= range.from) deltaAtFrom += lineDelta;
        if (line.from <= range.to) deltaAtTo += lineDelta;
    }
    if (changes.length === 0) return { range };
    return {
        changes,
        range: EditorSelection.range(range.from + deltaAtFrom, range.to + deltaAtTo),
    };
}

const HEADING_RE = /^(={2,6}) (.*) \1$/;
const MARKER_RE = /^([*#:;]+)/;

export function setHeading(level: 2 | 3 | 4 | 5 | 6): Command {
    const wrap = "=".repeat(level);
    return (view) => {
        const { state } = view;
        const tr = state.changeByRange((range) =>
            transformLine(state, range, (text) => {
                const match = HEADING_RE.exec(text);
                const marks = match?.[1] ?? "";
                const content = match?.[2] ?? "";
                if (match && marks.length === level) return content;
                if (match) return `${wrap} ${content} ${wrap}`;
                return `${wrap} ${text} ${wrap}`;
            }),
        );
        view.dispatch(state.update(tr));
        return true;
    };
}

export function insertListItem(marker: "*" | "#"): Command {
    const prefix = `${marker} `;
    return (view) => {
        const { state } = view;
        const tr = state.changeByRange((range) =>
            transformLine(state, range, (text) =>
                text.startsWith(prefix) ? text.slice(prefix.length) : prefix + text,
            ),
        );
        view.dispatch(state.update(tr));
        return true;
    };
}

export const indent: Command = (view) => {
    const { state } = view;
    const tr = state.changeByRange((range) =>
        transformLine(state, range, (text) => {
            const match = MARKER_RE.exec(text);
            if (!match) return ":" + text;
            const markerRun = match[1] ?? "";
            return markerRun.slice(-1) + text;
        }),
    );
    view.dispatch(state.update(tr));
    return true;
};

export const outdent: Command = (view) => {
    const { state } = view;
    const tr = state.changeByRange((range) =>
        transformLine(state, range, (text) => {
            const match = MARKER_RE.exec(text);
            if (!match) return text;
            const markerRun = match[1] ?? "";
            const newMarker = markerRun.slice(0, -1);
            const rest = text.slice(markerRun.length);
            return newMarker + (newMarker === "" && rest.startsWith(" ") ? rest.slice(1) : rest);
        }),
    );
    view.dispatch(state.update(tr));
    return true;
};

export const insertBlockquote: Command = (view) => {
    const { state } = view;
    const tr = state.changeByRange((range) => transformLines(state, range, (text) => `: ${text}`));
    view.dispatch(state.update(tr));
    return true;
};

export const insertHorizontalRule: Command = (view) => {
    const { state } = view;
    const tr = state.changeByRange((range) => {
        const changes: ChangeSpec = { from: range.from, to: range.to, insert: "\n----\n" };
        return { changes, range: EditorSelection.cursor(range.from + "\n----\n".length) };
    });
    view.dispatch(state.update(tr));
    return true;
};

export const insertPreformatted: Command = (view) => {
    const { state } = view;
    const tr = state.changeByRange((range) => {
        const fromLine = state.doc.lineAt(range.from);
        const toLine = state.doc.lineAt(range.to);
        if (fromLine.number === toLine.number) {
            return transformLine(state, range, (text) => " " + text);
        }
        const changes: ChangeSpec[] = [
            { from: range.from, insert: "<pre>" },
            { from: range.to, insert: "</pre>" },
        ];
        return {
            changes,
            range: EditorSelection.range(range.from + "<pre>".length, range.to + "<pre>".length),
        };
    });
    view.dispatch(state.update(tr));
    return true;
};

export const clearBlockMarkup: Command = (view) => {
    const { state } = view;
    const tr = state.changeByRange((range) =>
        transformLine(state, range, (text) => {
            const heading = HEADING_RE.exec(text);
            if (heading) return heading[2] ?? "";
            const marker = MARKER_RE.exec(text);
            if (marker) {
                const rest = text.slice((marker[1] ?? "").length);
                return rest.startsWith(" ") ? rest.slice(1) : rest;
            }
            return text;
        }),
    );
    view.dispatch(state.update(tr));
    return true;
};

// --- phase 2: link commands ---

// wikilink-with-display first, then plain wikilink, then the remaining inline
// tokens - order matters: the 5-quote run must go before 3/2-quote so a
// bold+italic span doesn't leave a stray '' or ''' behind
const REMOVE_MARKUP_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
    [/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2"],
    [/\[\[([^\]]+)\]\]/g, "$1"],
    [/'''''/g, ""],
    [/'''/g, ""],
    [/''/g, ""],
    [/\{\{/g, ""],
    [/\}\}/g, ""],
    [/<ref[^>]*>/g, ""],
    [/<\/ref>/g, ""],
];

function stripMarkup(text: string): string {
    return REMOVE_MARKUP_PATTERNS.reduce(
        (acc, [re, replacement]) => acc.replace(re, replacement),
        text,
    );
}

export const removeMarkup: Command = (view) => {
    const { state } = view;
    const tr = state.changeByRange((range) => {
        if (range.empty) return { range };
        const text = state.sliceDoc(range.from, range.to);
        const newText = stripMarkup(text);
        if (newText === text) return { range };
        return {
            changes: { from: range.from, to: range.to, insert: newText },
            range: EditorSelection.range(range.from, range.from + newText.length),
        };
    });
    view.dispatch(state.update(tr));
    return true;
};

export function buildWikilinkText(target: string, display: string): string {
    return display && display !== target ? `[[${target}|${display}]]` : `[[${target}]]`;
}

export function buildExternalLinkText(url: string, label: string): string {
    return label ? `[${url} ${label}]` : url;
}
