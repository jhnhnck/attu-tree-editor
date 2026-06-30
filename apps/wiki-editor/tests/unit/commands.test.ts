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
    setHeading,
    insertListItem,
    indent,
    outdent,
    insertBlockquote,
    insertHorizontalRule,
    insertPreformatted,
    clearBlockMarkup,
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

describe("setHeading", () => {
    it("wraps a plain line in the given heading level", () => {
        const view = viewWithSelection("Title", 2, 2);
        setHeading(2)(view);
        expect(view.state.doc.toString()).toBe("== Title ==");
    });

    it("strips the heading when the line already has that level", () => {
        const view = viewWithSelection("== Title ==", 5, 5);
        setHeading(2)(view);
        expect(view.state.doc.toString()).toBe("Title");
    });

    it("replaces the level when the line has a different heading level", () => {
        const view = viewWithSelection("== Title ==", 5, 5);
        setHeading(3)(view);
        expect(view.state.doc.toString()).toBe("=== Title ===");
    });
});

describe("insertListItem", () => {
    it("prepends the bullet marker", () => {
        const view = viewWithSelection("item", 0, 0);
        insertListItem("*")(view);
        expect(view.state.doc.toString()).toBe("* item");
    });

    it("prepends the numbered marker", () => {
        const view = viewWithSelection("item", 0, 0);
        insertListItem("#")(view);
        expect(view.state.doc.toString()).toBe("# item");
    });

    it("removes the marker when already present (toggle)", () => {
        const view = viewWithSelection("* item", 3, 3);
        insertListItem("*")(view);
        expect(view.state.doc.toString()).toBe("item");
    });
});

describe("indent / outdent", () => {
    it("indent adds a ':' marker to a plain line", () => {
        const view = viewWithSelection("item", 0, 0);
        indent(view);
        expect(view.state.doc.toString()).toBe(":item");
    });

    it("indent extends an existing bullet marker by one level", () => {
        const view = viewWithSelection("* item", 3, 3);
        indent(view);
        expect(view.state.doc.toString()).toBe("** item");
    });

    it("indent extends an existing numbered marker by one level", () => {
        const view = viewWithSelection("# item", 3, 3);
        indent(view);
        expect(view.state.doc.toString()).toBe("## item");
    });

    it("indent shifts the cursor to stay on the same character, not just clamp", () => {
        // cursor sits between 'i' and 't' in "* i|tem"
        const view = viewWithSelection("* item", 3, 3);
        indent(view);
        // after indent the same boundary is one position further right: "** i|tem"
        expect(view.state.selection.main.head).toBe(4);
    });

    it("outdent removes one level from a nested marker", () => {
        const view = viewWithSelection("** item", 4, 4);
        outdent(view);
        expect(view.state.doc.toString()).toBe("* item");
    });

    it("outdent fully removes a single-level marker, dropping the orphan space", () => {
        const view = viewWithSelection("* item", 3, 3);
        outdent(view);
        expect(view.state.doc.toString()).toBe("item");
    });

    it("outdent on a plain line is a no-op", () => {
        const view = viewWithSelection("item", 0, 0);
        outdent(view);
        expect(view.state.doc.toString()).toBe("item");
    });
});

describe("insertBlockquote", () => {
    it("prefixes the current line when nothing is selected", () => {
        const view = viewWithSelection("item", 0, 0);
        insertBlockquote(view);
        expect(view.state.doc.toString()).toBe(": item");
    });

    it("prefixes every line spanned by a multi-line selection", () => {
        const doc = "line1\nline2";
        const view = viewWithSelection(doc, 0, doc.length);
        insertBlockquote(view);
        expect(view.state.doc.toString()).toBe(": line1\n: line2");
    });
});

describe("insertHorizontalRule", () => {
    it("inserts a horizontal rule at the cursor", () => {
        const view = viewWithSelection("before after", 6, 6);
        insertHorizontalRule(view);
        expect(view.state.doc.toString()).toBe("before\n----\n after");
    });
});

describe("insertPreformatted", () => {
    it("prefixes the current line with a space for a single-line selection", () => {
        const view = viewWithSelection("item", 0, 0);
        insertPreformatted(view);
        expect(view.state.doc.toString()).toBe(" item");
    });

    it("wraps a multi-line selection in <pre>...</pre>", () => {
        const doc = "line1\nline2";
        const view = viewWithSelection(doc, 0, doc.length);
        insertPreformatted(view);
        expect(view.state.doc.toString()).toBe("<pre>line1\nline2</pre>");
    });
});

describe("clearBlockMarkup", () => {
    it("strips heading markup", () => {
        const view = viewWithSelection("== Title ==", 5, 5);
        clearBlockMarkup(view);
        expect(view.state.doc.toString()).toBe("Title");
    });

    it("strips a list marker", () => {
        const view = viewWithSelection("* item", 3, 3);
        clearBlockMarkup(view);
        expect(view.state.doc.toString()).toBe("item");
    });

    it("strips a nested list marker run in one pass", () => {
        const view = viewWithSelection("**# item", 5, 5);
        clearBlockMarkup(view);
        expect(view.state.doc.toString()).toBe("item");
    });

    it("leaves a plain line unchanged", () => {
        const view = viewWithSelection("plain text", 3, 3);
        clearBlockMarkup(view);
        expect(view.state.doc.toString()).toBe("plain text");
    });
});
