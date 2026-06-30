import { describe, it, expect } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
    toggleBold,
    toggleItalic,
    toggleBoldItalic,
    toggleStrikethrough,
    toggleSuperscript,
    toggleSubscript,
    toggleInlineCode,
    toggleNowiki,
} from "$lib/commands";

// headless EditorView - no `parent`, so no DOM attach is needed for dispatch to work
function viewWithSelection(doc: string, from: number, to: number): EditorView {
    return new EditorView({
        state: EditorState.create({ doc, selection: EditorSelection.range(from, to) }),
    });
}

function selectedText(view: EditorView): string {
    const sel = view.state.selection.main;
    return view.state.doc.sliceString(sel.from, sel.to);
}

describe("toggleBold / toggleItalic overlap detection", () => {
    // the four cases the pre-mortem flagged as load-bearing
    it("toggleBold on '''''text''''' leaves ''text''", () => {
        const view = viewWithSelection("'''''text'''''", 5, 9);
        toggleBold(view);
        expect(view.state.doc.toString()).toBe("''text''");
        expect(selectedText(view)).toBe("text");
    });

    it("toggleItalic on '''''text''''' leaves '''text'''", () => {
        const view = viewWithSelection("'''''text'''''", 5, 9);
        toggleItalic(view);
        expect(view.state.doc.toString()).toBe("'''text'''");
        expect(selectedText(view)).toBe("text");
    });

    it("toggleBold on ''text'' wraps to '''''text'''''", () => {
        const view = viewWithSelection("''text''", 2, 6);
        toggleBold(view);
        expect(view.state.doc.toString()).toBe("'''''text'''''");
        expect(selectedText(view)).toBe("text");
    });

    it("toggleItalic on '''text''' wraps to '''''text'''''", () => {
        const view = viewWithSelection("'''text'''", 3, 7);
        toggleItalic(view);
        expect(view.state.doc.toString()).toBe("'''''text'''''");
        expect(selectedText(view)).toBe("text");
    });

    // natural cases beyond the four overlap probes
    it("toggleBold on plain text wraps in '''", () => {
        const view = viewWithSelection("text", 0, 4);
        toggleBold(view);
        expect(view.state.doc.toString()).toBe("'''text'''");
    });

    it("toggleItalic on plain text wraps in ''", () => {
        const view = viewWithSelection("text", 0, 4);
        toggleItalic(view);
        expect(view.state.doc.toString()).toBe("''text''");
    });

    it("toggleBold on '''text''' unwraps to text", () => {
        const view = viewWithSelection("'''text'''", 3, 7);
        toggleBold(view);
        expect(view.state.doc.toString()).toBe("text");
    });

    it("toggleItalic on ''text'' unwraps to text", () => {
        const view = viewWithSelection("''text''", 2, 6);
        toggleItalic(view);
        expect(view.state.doc.toString()).toBe("text");
    });

    it("toggleBoldItalic toggles the full ''''' wrap on and off", () => {
        const wrapped = viewWithSelection("text", 0, 4);
        toggleBoldItalic(wrapped);
        expect(wrapped.state.doc.toString()).toBe("'''''text'''''");

        const unwrapped = viewWithSelection("'''''text'''''", 5, 9);
        toggleBoldItalic(unwrapped);
        expect(unwrapped.state.doc.toString()).toBe("text");
    });

    it("wraps the word under the cursor when nothing is selected", () => {
        const view = viewWithSelection("hello world", 7, 7); // cursor inside "world"
        toggleBold(view);
        expect(view.state.doc.toString()).toBe("hello '''world'''");
    });

    it("mismatched quote runs on either side are treated as unwrapped", () => {
        // 3 quotes before, 2 after - not a real wrap, so toggleBold adds a fresh '''
        // on each side without touching the existing (mismatched) quotes
        const view = viewWithSelection("'''text''", 3, 7);
        toggleBold(view);
        expect(view.state.doc.toString()).toBe("''''''text'''''");
        expect(selectedText(view)).toBe("text");
    });
});

describe("tag-based toggles", () => {
    it("toggleStrikethrough wraps and unwraps <s>...</s>", () => {
        const view = viewWithSelection("text", 0, 4);
        toggleStrikethrough(view);
        expect(view.state.doc.toString()).toBe("<s>text</s>");
        toggleStrikethrough(view);
        expect(view.state.doc.toString()).toBe("text");
    });

    it("toggleSuperscript wraps and unwraps <sup>...</sup>", () => {
        const view = viewWithSelection("text", 0, 4);
        toggleSuperscript(view);
        expect(view.state.doc.toString()).toBe("<sup>text</sup>");
        toggleSuperscript(view);
        expect(view.state.doc.toString()).toBe("text");
    });

    it("toggleSubscript wraps and unwraps <sub>...</sub>", () => {
        const view = viewWithSelection("text", 0, 4);
        toggleSubscript(view);
        expect(view.state.doc.toString()).toBe("<sub>text</sub>");
        toggleSubscript(view);
        expect(view.state.doc.toString()).toBe("text");
    });

    it("toggleInlineCode wraps and unwraps <code>...</code>", () => {
        const view = viewWithSelection("text", 0, 4);
        toggleInlineCode(view);
        expect(view.state.doc.toString()).toBe("<code>text</code>");
        toggleInlineCode(view);
        expect(view.state.doc.toString()).toBe("text");
    });

    it("toggleNowiki wraps and unwraps <nowiki>...</nowiki>", () => {
        const view = viewWithSelection("text", 0, 4);
        toggleNowiki(view);
        expect(view.state.doc.toString()).toBe("<nowiki>text</nowiki>");
        toggleNowiki(view);
        expect(view.state.doc.toString()).toBe("text");
    });

    it("wraps the word under the cursor when nothing is selected", () => {
        const view = viewWithSelection("hello world", 7, 7);
        toggleInlineCode(view);
        expect(view.state.doc.toString()).toBe("hello <code>world</code>");
    });
});
