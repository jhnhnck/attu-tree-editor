import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { wikitext } from "$lib/lang-wikitext";

type TokenSpan = { name: string; text: string };

function tokenize(input: string): TokenSpan[] {
    const state = EditorState.create({ doc: input, extensions: [wikitext()] });
    const tree = ensureSyntaxTree(state, input.length, 500);
    const spans: TokenSpan[] = [];
    tree?.cursor().iterate((node) => {
        // skip root Document node and error nodes; collect named leaf tokens
        if (node.name !== "Document" && node.name !== "⚠") {
            spans.push({ name: node.name, text: input.slice(node.from, node.to) });
        }
    });
    return spans;
}

function hasToken(spans: TokenSpan[], name: string, text?: string): boolean {
    return spans.some((s) => s.name === name && (text === undefined || s.text === text));
}

describe("lang-wikitext — inline tokens", () => {
    describe("bold / italic", () => {
        it("tokenizes bold", () => {
            const spans = tokenize("'''bold'''");
            expect(hasToken(spans, "bold", "'''bold'''")).toBe(true);
        });

        it("tokenizes italic", () => {
            const spans = tokenize("''italic''");
            expect(hasToken(spans, "italic", "''italic''")).toBe(true);
        });

        it("detection order: bold-italic wins over bold and italic when '''''..", () => {
            const spans = tokenize("'''''both'''''");
            expect(hasToken(spans, "boldItalic")).toBe(true);
            expect(spans.every((s) => s.name !== "bold" && s.name !== "italic")).toBe(true);
        });

        it("unterminated bold does not throw — consumes rest of line", () => {
            expect(() => tokenize("'''no close")).not.toThrow();
        });

        it("unterminated italic does not throw", () => {
            expect(() => tokenize("''no close")).not.toThrow();
        });
    });

    describe("wikilinks", () => {
        it("tokenizes simple wikilink brackets and target", () => {
            const spans = tokenize("[[Sandbox]]");
            expect(hasToken(spans, "wikiLinkBracket", "[[")).toBe(true);
            expect(hasToken(spans, "wikiLinkTarget", "Sandbox")).toBe(true);
            expect(hasToken(spans, "wikiLinkBracket", "]]")).toBe(true);
        });

        it("pipe produces separator + label tokens", () => {
            const spans = tokenize("[[Sandbox|display text]]");
            expect(hasToken(spans, "wikiLinkTarget", "Sandbox")).toBe(true);
            expect(hasToken(spans, "wikiLinkSep", "|")).toBe(true);
            expect(hasToken(spans, "wikiLinkLabel", "display text")).toBe(true);
        });

        it("unclosed wikilink does not throw", () => {
            expect(() => tokenize("[[unclosed")).not.toThrow();
        });
    });

    describe("external links", () => {
        it("tokenizes bare external link url", () => {
            const spans = tokenize("[https://example.com]");
            expect(hasToken(spans, "extLinkUrl")).toBe(true);
        });

        it("tokenizes external link with label", () => {
            const spans = tokenize("[https://example.com click here]");
            expect(hasToken(spans, "extLinkUrl")).toBe(true);
            expect(hasToken(spans, "extLinkLabel", " click here")).toBe(true);
            expect(hasToken(spans, "extLinkBracket", "]")).toBe(true);
        });

        it("http:// link also tokenizes", () => {
            const spans = tokenize("[http://example.com]");
            expect(hasToken(spans, "extLinkUrl")).toBe(true);
        });
    });

    describe("HTML comments", () => {
        it("tokenizes inline comment", () => {
            const spans = tokenize("<!-- comment -->");
            expect(hasToken(spans, "comment")).toBe(true);
        });

        it("inline comment does not fall into bold/italic — unrelated apostrophes inside are not tokenized as such", () => {
            const spans = tokenize("<!-- '''not bold''' -->");
            expect(spans.every((s) => s.name !== "bold")).toBe(true);
        });
    });

    describe("nowiki", () => {
        it("nowiki span suppresses inner markup", () => {
            const spans = tokenize("<nowiki>'''not bold'''</nowiki>");
            expect(spans.every((s) => s.name !== "bold")).toBe(true);
            expect(hasToken(spans, "nowiki")).toBe(true);
        });
    });

    describe("inline code", () => {
        it("tokenizes <code>...</code> as code", () => {
            const spans = tokenize("<code>inline</code>");
            expect(hasToken(spans, "code", "<code>inline</code>")).toBe(true);
        });
    });

    describe("malformed / edge cases", () => {
        it("empty string does not throw", () => {
            expect(() => tokenize("")).not.toThrow();
        });

        it("plain text produces no named tokens", () => {
            const spans = tokenize("just plain text here");
            expect(spans.length).toBe(0);
        });

        it("mixed malformed markup does not throw", () => {
            expect(() => tokenize("[[unclosed '''unterminated <!-- no end")).not.toThrow();
        });
    });
});
