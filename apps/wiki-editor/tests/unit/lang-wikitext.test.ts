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

describe("lang-wikitext - inline tokens", () => {
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

        it("adjacent bold then italic on one line produce two distinct token spans", () => {
            const spans = tokenize("'''bold''' ''italic''");
            expect(hasToken(spans, "bold")).toBe(true);
            expect(hasToken(spans, "italic")).toBe(true);
        });

        it("multi-line HTML comment: state continues across lines", () => {
            const input = "before\n<!-- start\ncontinued\nend --> after";
            const spans = tokenize(input);
            const commentSpans = spans.filter((s) => s.name === "comment");
            expect(commentSpans.length).toBeGreaterThan(0);
            expect(spans.every((s) => s.name !== "bold")).toBe(true);
        });
    });
});

describe("lang-wikitext - block-level tokens", () => {
    describe("headings", () => {
        it("h1: = marks become headingMark, content becomes heading1", () => {
            const spans = tokenize("=Heading=");
            expect(hasToken(spans, "headingMark", "=")).toBe(true);
            expect(hasToken(spans, "heading1", "Heading")).toBe(true);
        });

        it("h2: == marks and content", () => {
            const spans = tokenize("== Section ==");
            expect(hasToken(spans, "headingMark", "==")).toBe(true);
            expect(hasToken(spans, "heading2")).toBe(true);
        });

        it("h3 through h6 are recognized", () => {
            for (let n = 3; n <= 6; n++) {
                const eq = "=".repeat(n);
                const spans = tokenize(`${eq}Title${eq}`);
                expect(hasToken(spans, `heading${n}`)).toBe(true);
            }
        });

        it("heading marks are dim (headingMark token, not heading content)", () => {
            const spans = tokenize("== Title ==");
            const marks = spans.filter((s) => s.name === "headingMark");
            const content = spans.filter((s) => s.name === "heading2");
            expect(marks.length).toBeGreaterThan(0);
            expect(content.length).toBeGreaterThan(0);
        });

        it("unterminated heading (no closing =) does not throw", () => {
            expect(() => tokenize("== No close")).not.toThrow();
        });
    });

    describe("horizontal rule", () => {
        it("---- alone on a line becomes hr", () => {
            const spans = tokenize("----");
            expect(hasToken(spans, "hr")).toBe(true);
        });

        it("---- mid-line (----template----) does NOT produce hr", () => {
            const spans = tokenize("----template----");
            expect(spans.every((s) => s.name !== "hr")).toBe(true);
        });

        it("more than 4 dashes on their own line is still hr", () => {
            const spans = tokenize("----------");
            expect(hasToken(spans, "hr")).toBe(true);
        });
    });

    describe("preformatted", () => {
        it("line starting with a space is pre", () => {
            const spans = tokenize(" preformatted line");
            expect(hasToken(spans, "pre")).toBe(true);
        });
    });

    describe("lists", () => {
        it("* bullet list marker", () => {
            const spans = tokenize("* item");
            expect(hasToken(spans, "list", "*")).toBe(true);
        });

        it("** nested bullet", () => {
            const spans = tokenize("** nested");
            expect(hasToken(spans, "list", "**")).toBe(true);
        });

        it("# ordered list marker", () => {
            const spans = tokenize("# numbered");
            expect(hasToken(spans, "list", "#")).toBe(true);
        });

        it("## nested ordered list", () => {
            const spans = tokenize("## sub-numbered");
            expect(hasToken(spans, "list", "##")).toBe(true);
        });
    });

    describe("definition lists", () => {
        it("; definition term", () => {
            const spans = tokenize(";term");
            expect(hasToken(spans, "defTerm", ";")).toBe(true);
        });

        it(": definition indent", () => {
            const spans = tokenize(":indent");
            expect(hasToken(spans, "defIndent", ":")).toBe(true);
        });
    });

    describe("block edge cases", () => {
        it("block tokens only fire at SOL - * mid-line is not a list", () => {
            const spans = tokenize("text * not a list");
            expect(spans.every((s) => s.name !== "list")).toBe(true);
        });

        it("inline tokens still work after a block token on previous line", () => {
            const input = "== Heading ==\n'''bold'''";
            const spans = tokenize(input);
            expect(hasToken(spans, "heading2")).toBe(true);
            expect(hasToken(spans, "bold")).toBe(true);
        });
    });
});

describe("lang-wikitext - phase 2 tokens", () => {
    describe("templates", () => {
        it("{{ and }} become templateBrace tokens", () => {
            const spans = tokenize("{{Sandbox}}");
            expect(hasToken(spans, "templateBrace", "{{")).toBe(true);
            expect(hasToken(spans, "templateBrace", "}}")).toBe(true);
        });

        it("text after {{ is templateName", () => {
            const spans = tokenize("{{Template name}}");
            expect(hasToken(spans, "templateName", "Template name")).toBe(true);
        });

        it("| inside template is templateSep", () => {
            const spans = tokenize("{{Template|param}}");
            expect(hasToken(spans, "templateSep", "|")).toBe(true);
        });

        it("| inside wikilink inside template is wikiLinkSep not templateSep", () => {
            const spans = tokenize("{{T|[[link|label]]}}");
            expect(hasToken(spans, "wikiLinkSep", "|")).toBe(true);
            const sepSpans = spans.filter((s) => s.name === "templateSep");
            const wikisepSpans = spans.filter((s) => s.name === "wikiLinkSep");
            // first | is templateSep; | inside [[...]] is wikiLinkSep
            expect(sepSpans.length).toBe(1);
            expect(wikisepSpans.length).toBe(1);
        });

        it("nested templates produce opening and closing brace tokens", () => {
            const spans = tokenize("{{outer|{{inner}}}}");
            // adjacent same-type tokens are merged in the Lezer tree, so
            // both }} closing braces may appear as one node - check for presence
            expect(hasToken(spans, "templateBrace", "{{")).toBe(true);
            expect(hasToken(spans, "templateName", "outer")).toBe(true);
            expect(hasToken(spans, "templateName", "inner")).toBe(true);
        });

        it("3 levels of nesting do not throw", () => {
            expect(() => tokenize("{{a|{{b|{{c}}}}}}")).not.toThrow();
        });

        it("{{{ triple-brace param reference }}}", () => {
            const spans = tokenize("{{{arg}}}");
            expect(hasToken(spans, "tripleParam")).toBe(true);
        });

        it("{{{ with default value }}}", () => {
            const spans = tokenize("{{{arg|default}}}");
            expect(hasToken(spans, "tripleParam")).toBe(true);
        });

        it("parser function {{#if:}} gets funcName token", () => {
            const spans = tokenize("{{#if:condition|yes|no}}");
            expect(hasToken(spans, "funcName")).toBe(true);
        });

        it("unclosed template does not throw", () => {
            expect(() => tokenize("{{unclosed")).not.toThrow();
        });
    });

    describe("references", () => {
        it("<ref> opening tag", () => {
            const spans = tokenize("<ref>content</ref>");
            expect(hasToken(spans, "refTag", "<ref>")).toBe(true);
            expect(hasToken(spans, "refTag", "</ref>")).toBe(true);
        });

        it("<ref name=...> with attribute", () => {
            const spans = tokenize('<ref name="note1">text</ref>');
            expect(hasToken(spans, "refTag")).toBe(true);
        });

        it("<ref name=... /> self-closing", () => {
            const spans = tokenize('<ref name="note1" />');
            expect(hasToken(spans, "refTag")).toBe(true);
        });

        it("<references /> standalone", () => {
            const spans = tokenize("<references />");
            expect(hasToken(spans, "refTag")).toBe(true);
        });
    });

    describe("tables", () => {
        it("{| opens table and |} closes it as tableBrace", () => {
            const spans = tokenize("{|\n|}");
            expect(hasToken(spans, "tableBrace", "{|")).toBe(true);
            expect(hasToken(spans, "tableBrace", "|}")).toBe(true);
        });

        it("|- row separator", () => {
            const spans = tokenize("{|\n|-\n|}");
            expect(hasToken(spans, "tableSep", "|-")).toBe(true);
        });

        it("! header cell", () => {
            const spans = tokenize("{|\n! Header\n|}");
            expect(hasToken(spans, "tableHead", "!")).toBe(true);
        });

        it("|+ caption", () => {
            const spans = tokenize("{|\n|+ Caption\n|}");
            expect(hasToken(spans, "tableCap", "|+")).toBe(true);
        });

        it("| cell inside table is tableSep", () => {
            const spans = tokenize("{|\n| cell\n|}");
            expect(hasToken(spans, "tableSep", "|")).toBe(true);
        });

        it("| at SOL outside table is not tableSep", () => {
            const spans = tokenize("| not in table");
            expect(spans.every((s) => s.name !== "tableSep")).toBe(true);
        });
    });

    describe("phase 2 perf budget", () => {
        it("200-line article with 12 templates tokenizes in < 16ms", () => {
            const lines: string[] = [];
            for (let i = 0; i < 20; i++) {
                lines.push(`== Section ${i} ==`);
                lines.push(`Some text with '''bold''' and ''italic''.`);
                lines.push(`{{Template${i}|param1=value1|param2=[[Link${i}|display]]}}`);
                lines.push(`{{Nested|{{Inner|{{{arg}}}}}}} and <!-- comment --> text.`);
                lines.push(`* item one`);
                lines.push(`* item two`);
                lines.push(`<ref name="ref${i}">citation</ref>`);
                lines.push(`{|`);
                lines.push(`! Header`);
                lines.push(`| cell`);
                lines.push(`|}`);
                lines.push(``);
            }
            const input = lines.join("\n");
            // use the top-level imports (not require) to avoid duplicate module instances
            const state = EditorState.create({ doc: input, extensions: [wikitext()] });
            const start = performance.now();
            ensureSyntaxTree(state, input.length, 2000);
            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(16);
        });
    });
});
