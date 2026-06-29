import {
    HighlightStyle,
    LanguageSupport,
    StreamLanguage,
    syntaxHighlighting,
    type StringStream,
} from "@codemirror/language";
import { Tag, tags } from "@lezer/highlight";

// bold+italic needs its own tag: StreamParser.token() returns one string per call,
// and tokenTable maps each string to a single lezer tag, so combined bold+italic
// cannot share tags.strong + tags.emphasis simultaneously
const boldItalicTag = Tag.define();

// all fields across all four phases are defined here to prevent incompatible state
// reshapes that would invalidate CodeMirror's incremental parse checkpoints
interface WikitextState {
    inComment: boolean; // inside <!-- -->
    inNowiki: boolean; // inside <nowiki>
    inWikilink: boolean; // inside [[...]]
    wikilinkSeenPipe: boolean; // inside wikilink, past the | separator
    inExtLink: boolean; // inside [url label], positioned after url, before ]
    headingLevel: number; // 0 = not in heading; 1-6 = current level (phase 1)
    templateDepth: number; // {{ }} nesting count (phase 2)
    inTemplateName: boolean; // just after {{, before first | or }} (phase 2)
    inTable: boolean; // inside {| |} table (phase 2)
}

function startState(): WikitextState {
    return {
        inComment: false,
        inNowiki: false,
        inWikilink: false,
        wikilinkSeenPipe: false,
        inExtLink: false,
        headingLevel: 0,
        templateDepth: 0,
        inTemplateName: false,
        inTable: false,
    };
}

const wikitextLanguage = StreamLanguage.define<WikitextState>({
    name: "wikitext",
    tokenTable: {
        // phase 0 - inline
        bold: tags.strong,
        italic: tags.emphasis,
        boldItalic: boldItalicTag,
        code: tags.monospace,
        wikiLinkBracket: tags.bracket,
        wikiLinkTarget: tags.link,
        wikiLinkLabel: tags.labelName,
        wikiLinkSep: tags.separator,
        extLinkBracket: tags.bracket,
        extLinkUrl: tags.url,
        extLinkLabel: tags.labelName,
        comment: tags.blockComment,
        nowiki: tags.escape,
        // phase 1 - block level
        headingMark: tags.punctuation,
        heading1: tags.heading1,
        heading2: tags.heading2,
        heading3: tags.heading3,
        heading4: tags.heading4,
        heading5: tags.heading5,
        heading6: tags.heading6,
        hr: tags.contentSeparator,
        pre: tags.meta,
        list: tags.list,
        defTerm: tags.definitionKeyword,
        defIndent: tags.content,
        // phase 2 - templates, refs, tables
        templateBrace: tags.brace,
        tripleParam: tags.variableName,
        templateName: tags.typeName,
        funcName: tags.keyword,
        templateSep: tags.separator,
        refTag: tags.tagName,
        tableBrace: tags.brace,
        tableSep: tags.separator,
        tableCap: tags.meta,
        tableHead: tags.heading,
    },
    startState,
    copyState(state: WikitextState): WikitextState {
        return { ...state };
    },
    blankLine(state: WikitextState): void {
        // inline constructs cannot cross blank lines
        state.inWikilink = false;
        state.wikilinkSeenPipe = false;
        state.inExtLink = false;
        state.headingLevel = 0;
        // templates CAN span blank lines in MediaWiki; do not reset templateDepth
    },
    token(stream: StringStream, state: WikitextState): string | null {
        // reset heading at start of new (non-blank) line
        if (stream.sol() && state.headingLevel > 0) {
            state.headingLevel = 0;
        }

        // multi-line comment continuation
        if (state.inComment) {
            if (stream.match("-->")) {
                state.inComment = false;
                return "comment";
            }
            if (!stream.skipTo("-->")) stream.skipToEnd();
            return "comment";
        }

        // nowiki span continuation
        if (state.inNowiki) {
            if (stream.match("</nowiki>")) {
                state.inNowiki = false;
                return "nowiki";
            }
            if (!stream.skipTo("</nowiki>")) stream.skipToEnd();
            return "nowiki";
        }

        // wikilink interior: closing bracket, pipe separator, or target/label text
        if (state.inWikilink) {
            if (stream.match("]]")) {
                state.inWikilink = false;
                state.wikilinkSeenPipe = false;
                return "wikiLinkBracket";
            }
            if (stream.eat("|")) {
                state.wikilinkSeenPipe = true;
                return "wikiLinkSep";
            }
            // consume target or label text up to | or ]]
            while (!stream.eol() && stream.peek() !== "|" && !stream.match("]]", false)) {
                stream.next();
            }
            return state.wikilinkSeenPipe ? "wikiLinkLabel" : "wikiLinkTarget";
        }

        // external link label and closing bracket
        if (state.inExtLink) {
            if (stream.eat("]")) {
                state.inExtLink = false;
                return "extLinkBracket";
            }
            while (!stream.eol() && stream.peek() !== "]") stream.next();
            return "extLinkLabel";
        }

        // --- block-level tokens (start of line only) ---
        if (stream.sol()) {
            // hr: 4+ dashes occupying the entire line - must not fire mid-line
            if (/^-{4,}\s*$/.test(stream.string)) {
                stream.skipToEnd();
                return "hr";
            }

            // heading: = at start of line
            const eqMatch = stream.match(/^(={1,6})/) as RegExpMatchArray | null;
            if (eqMatch) {
                state.headingLevel = eqMatch[0].length;
                return "headingMark";
            }

            // preformatted: line starts with a space
            if (stream.peek() === " ") {
                stream.skipToEnd();
                return "pre";
            }

            // unordered / ordered list markers
            if (stream.match(/^[*#]+/)) return "list";

            // definition term
            if (stream.eat(";")) return "defTerm";

            // definition indent / blockquote
            if (stream.eat(":")) return "defIndent";

            // table open/close and row/cell markers
            if (stream.match("{|")) {
                state.inTable = true;
                return "tableBrace";
            }
            if (stream.match("|}")) {
                state.inTable = false;
                return "tableBrace";
            }
            if (stream.match("|-")) return "tableSep";
            // |+ caption before | cell (longer match first)
            if (stream.match("|+")) return "tableCap";
            if (stream.eat("!")) return "tableHead";
            // bare | cell separator (only inside a table)
            if (state.inTable && stream.eat("|")) return "tableSep";
        }

        // heading content and closing marks (when inside a heading)
        if (state.headingLevel > 0) {
            const level = state.headingLevel;
            // closing delimiters: exactly `level` = signs, rest of line is whitespace
            const closingRe = new RegExp(`^={${level}}\\s*$`);
            if (stream.match(closingRe)) {
                state.headingLevel = 0;
                return "headingMark";
            }
            // consume heading content until the closing = sequence (or EOL)
            while (!stream.eol()) {
                if (closingRe.test(stream.string.slice(stream.pos))) break;
                stream.next();
            }
            if (stream.eol()) state.headingLevel = 0;
            return `heading${level}`;
        }

        // --- inline tokens ---

        // <nowiki> opening tag
        if (stream.match("<nowiki>")) {
            state.inNowiki = true;
            return "nowiki";
        }

        // HTML comment <!-- ... --> (may span multiple lines)
        if (stream.match("<!--")) {
            if (stream.skipTo("-->")) {
                stream.match("-->");
            } else {
                stream.skipToEnd();
                state.inComment = true;
            }
            return "comment";
        }

        // <code>...</code> (treated as single-line)
        if (stream.match("<code>")) {
            while (!stream.eol()) {
                if (stream.match("</code>")) break;
                stream.next();
            }
            return "code";
        }

        // --- phase 2: templates and references ---

        // {{{ template parameter reference }}} - must check before {{ }}
        if (stream.match("{{{")) {
            while (!stream.eol() && !stream.match("}}}", false)) stream.next();
            if (!stream.eol()) stream.match("}}}");
            return "tripleParam";
        }

        // {{ template open
        if (stream.match("{{")) {
            state.templateDepth++;
            state.inTemplateName = true;
            return "templateBrace";
        }

        // }} template close
        if (stream.match("}}")) {
            state.templateDepth = Math.max(0, state.templateDepth - 1);
            return "templateBrace";
        }

        // template name: text immediately after {{, before first | or }}
        if (state.inTemplateName && state.templateDepth > 0) {
            state.inTemplateName = false;
            const ch = stream.peek();
            if (ch !== undefined && ch !== "|" && !stream.match("}}", false) && !stream.eol()) {
                // parser function: name starts with #
                const isFunc = ch === "#";
                while (
                    !stream.eol() &&
                    stream.peek() !== "|" &&
                    !stream.match("}}", false) &&
                    !stream.match("[[", false)
                ) {
                    // stop parser function name at the colon
                    if (isFunc && stream.peek() === ":") {
                        stream.next();
                        break;
                    }
                    stream.next();
                }
                return isFunc ? "funcName" : "templateName";
            }
            // nothing to consume as name (edge case: {{ followed by | or }})
        }

        // | separator inside a template (not a wikilink - wikilink | is caught above)
        if (state.templateDepth > 0 && stream.eat("|")) {
            return "templateSep";
        }

        // reference tags (order matters: </ref> before <ref; <references/> before <ref/>)
        if (stream.match("</ref>")) return "refTag";
        if (stream.match(/^<references\s*\/>/)) return "refTag";
        if (stream.match(/^<ref(\s[^>]*)?\s*\/>/)) return "refTag";
        if (stream.match(/^<ref(\s[^>]*)?>/)) return "refTag";

        // --- phase 0 inline tokens (detection order is load-bearing) ---

        // detection order is load-bearing: bold-italic before bold before italic
        if (stream.match("'''''")) {
            while (!stream.eol() && !stream.match("'''''")) stream.next();
            return "boldItalic";
        }
        if (stream.match("'''")) {
            while (!stream.eol() && !stream.match("'''")) stream.next();
            return "bold";
        }
        if (stream.match("''")) {
            while (!stream.eol() && !stream.match("''")) stream.next();
            return "italic";
        }

        // wikilink [[target|label]]
        if (stream.match("[[")) {
            state.inWikilink = true;
            return "wikiLinkBracket";
        }

        // external link [https://url optional label]
        if (stream.match("[http://", false) || stream.match("[https://", false)) {
            stream.next(); // consume [
            while (!stream.eol() && stream.peek() !== " " && stream.peek() !== "]") {
                stream.next();
            }
            if (!stream.eol() && stream.peek() === " ") {
                state.inExtLink = true; // label follows; ] handled by inExtLink branch
            } else if (!stream.eol() && stream.peek() === "]") {
                stream.next(); // no label; consume closing ]
            }
            return "extLinkUrl";
        }

        stream.next();
        return null;
    },
});

const wikitextHighlight = HighlightStyle.define([
    // phase 0 - inline
    { tag: tags.strong, fontWeight: "700" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: boldItalicTag, fontWeight: "700", fontStyle: "italic" },
    {
        tag: tags.monospace,
        fontFamily: "var(--font-mono)",
        fontSize: "0.875em",
        backgroundColor: "color-mix(in srgb, var(--color-fg) 6%, transparent)",
    },
    { tag: [tags.bracket, tags.separator], color: "var(--color-fg-muted)", opacity: "0.6" },
    { tag: tags.link, color: "var(--color-accent)" },
    { tag: tags.labelName, color: "var(--color-accent-strong)" },
    { tag: tags.url, color: "var(--color-accent)", textDecoration: "underline" },
    { tag: tags.blockComment, color: "var(--color-fg-muted)", fontStyle: "italic" },
    { tag: tags.escape, color: "var(--color-fg-muted)" },
    // phase 1 - block level
    { tag: tags.punctuation, color: "var(--color-fg-muted)", opacity: "0.5" },
    { tag: tags.heading1, fontWeight: "700", color: "var(--color-fg)" },
    { tag: tags.heading2, fontWeight: "700", color: "var(--color-fg)" },
    { tag: tags.heading3, fontWeight: "600", color: "var(--color-fg)" },
    { tag: tags.heading4, fontWeight: "600", color: "var(--color-fg)" },
    { tag: tags.heading5, fontWeight: "500", color: "var(--color-fg)" },
    { tag: tags.heading6, fontWeight: "500", color: "var(--color-fg)" },
    { tag: tags.contentSeparator, color: "var(--color-fg-muted)", opacity: "0.4" },
    { tag: tags.list, color: "var(--color-accent)", fontWeight: "600" },
    { tag: tags.definitionKeyword, color: "var(--color-accent)", fontWeight: "600" },
    { tag: tags.content, color: "var(--color-fg-muted)" },
    { tag: tags.meta, color: "var(--color-fg-muted)", fontFamily: "var(--font-mono)" },
    // phase 2 - templates, refs, tables
    // tags.brace inherits from tags.bracket (dim/muted) - no new rule needed
    { tag: tags.variableName, color: "var(--color-accent-strong)" },
    { tag: tags.typeName, color: "var(--color-accent)" },
    { tag: tags.keyword, color: "var(--color-accent)", fontStyle: "italic" },
    { tag: tags.tagName, color: "var(--color-accent-strong)", fontWeight: "600" },
    { tag: tags.heading, fontWeight: "600", color: "var(--color-fg)" },
]);

export function wikitext(): LanguageSupport {
    return new LanguageSupport(wikitextLanguage, syntaxHighlighting(wikitextHighlight));
}
