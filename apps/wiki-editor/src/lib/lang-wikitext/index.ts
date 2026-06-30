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
    inWikilinkNs: boolean; // scanning namespace prefix (Category:, File:, Image:)
    inNsLink: boolean; // in a category/file link; target after nsPrefix is nsName
    inExtLink: boolean; // inside [url label], positioned after url, before ]
    headingLevel: number; // 0 = not in heading; 1-6 = current level (phase 1)
    templateDepth: number; // {{ }} nesting count (phase 2)
    inTemplateName: boolean; // just after {{, before first | or }} (phase 2)
    inTable: boolean; // inside {| |} table (phase 2)
    inMath: boolean; // inside <math>...</math> opaque block (phase 3)
    inPre: boolean; // inside <pre>...</pre> opaque block (phase 3)
}

function startState(): WikitextState {
    return {
        inComment: false,
        inNowiki: false,
        inWikilink: false,
        wikilinkSeenPipe: false,
        inWikilinkNs: false,
        inNsLink: false,
        inExtLink: false,
        headingLevel: 0,
        templateDepth: 0,
        inTemplateName: false,
        inTable: false,
        inMath: false,
        inPre: false,
    };
}

// wikilink prefixes that get namespace treatment
const NS_PREFIX_RE = /^(Category|File|Image)\s*:/i;

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
        // phase 3 - categories, files, magic words, misc html
        nsPrefix: tags.namespace,
        nsName: tags.tagName,
        magicWord: tags.processingInstruction,
        mathContent: tags.string,
        preBlock: tags.blockComment,
        htmlTag: tags.tagName,
        signature: tags.meta,
        bareExtBracket: tags.invalid,
    },
    startState,
    copyState(state: WikitextState): WikitextState {
        return { ...state };
    },
    blankLine(state: WikitextState): void {
        // inline constructs cannot cross blank lines
        state.inWikilink = false;
        state.wikilinkSeenPipe = false;
        state.inWikilinkNs = false;
        state.inNsLink = false;
        state.inExtLink = false;
        state.headingLevel = 0;
        // templates CAN span blank lines in MediaWiki; do not reset templateDepth
        // math/pre blocks can also span blank lines
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

        // math block continuation - opaque: inner content not parsed as wikitext
        if (state.inMath) {
            if (stream.match("</math>")) {
                state.inMath = false;
                return "mathContent";
            }
            if (!stream.skipTo("</math>")) stream.skipToEnd();
            return "mathContent";
        }

        // pre block continuation - opaque
        if (state.inPre) {
            if (stream.match("</pre>")) {
                state.inPre = false;
                return "preBlock";
            }
            if (!stream.skipTo("</pre>")) stream.skipToEnd();
            return "preBlock";
        }

        // wikilink interior: namespace prefix, closing bracket, pipe, target, or label
        if (state.inWikilink) {
            if (stream.match("]]")) {
                state.inWikilink = false;
                state.wikilinkSeenPipe = false;
                state.inWikilinkNs = false;
                state.inNsLink = false;
                return "wikiLinkBracket";
            }
            if (stream.eat("|")) {
                state.wikilinkSeenPipe = true;
                state.inWikilinkNs = false;
                return "wikiLinkSep";
            }
            // emit namespace prefix (Category:, File:, Image: including the colon)
            if (state.inWikilinkNs) {
                while (
                    !stream.eol() &&
                    stream.peek() !== ":" &&
                    stream.peek() !== "|" &&
                    !stream.match("]]", false)
                ) {
                    stream.next();
                }
                if (!stream.eol() && stream.peek() === ":") stream.next();
                state.inWikilinkNs = false;
                return "nsPrefix";
            }
            // scan remaining target or label text up to | or ]]
            while (!stream.eol() && stream.peek() !== "|" && !stream.match("]]", false)) {
                stream.next();
            }
            if (state.wikilinkSeenPipe) return "wikiLinkLabel";
            if (state.inNsLink) return "nsName"; // name after Category:/File: prefix
            return "wikiLinkTarget"; // regular wikilink target
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

        // --- phase 3: opaque html blocks ---

        // <math>...</math> opaque: content not parsed as wikitext
        if (stream.match("<math>")) {
            if (stream.skipTo("</math>")) {
                stream.match("</math>");
            } else {
                stream.skipToEnd();
                state.inMath = true;
            }
            return "mathContent";
        }

        // <pre>...</pre> opaque block
        if (stream.match("<pre>")) {
            if (stream.skipTo("</pre>")) {
                stream.match("</pre>");
            } else {
                stream.skipToEnd();
                state.inPre = true;
            }
            return "preBlock";
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

        // --- phase 3: magic words, misc html, signatures ---

        // behavior switches and magic words __WORD__
        if (stream.match(/^__[A-Z]+__/)) return "magicWord";

        // misc html inline tags: <s>, <u>, <sup>, <sub>, <br />, <hr />
        if (stream.match(/^<\/?(s|u|sup|sub|br|hr)(\s[^>]*)?\s*\/?>/)) return "htmlTag";

        // signature/timestamp: ~~~~~ before ~~~~ before ~~~ (longer match first)
        if (stream.match("~~~~~")) return "signature";
        if (stream.match("~~~~")) return "signature";
        if (stream.match("~~~")) return "signature";

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

        // wikilink [[target|label]] - detect namespace prefix for Category/File/Image
        if (stream.match("[[")) {
            state.inWikilink = true;
            state.inNsLink = false;
            state.inWikilinkNs = false;
            // peek at the remaining content to detect namespace prefix
            const rest = stream.string.slice(stream.pos);
            if (NS_PREFIX_RE.test(rest)) {
                state.inWikilinkNs = true;
                state.inNsLink = true;
            }
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

        // bare [ or ] not part of wikilink or ext link - common editing mistake
        // known false positive: fires on parser function args like {{#if: [val] | yes | no }}
        if (stream.eat("[") || stream.eat("]")) return "bareExtBracket";

        stream.next();
        return null;
    },
});

const wikitextHighlight = HighlightStyle.define([
    // user text formatting
    { tag: tags.strong, fontWeight: "900", color: "var(--color-syn-type)" },
    { tag: tags.emphasis, fontStyle: "italic", color: "var(--color-syn-label)" },
    { tag: boldItalicTag, fontWeight: "900", fontStyle: "italic", color: "var(--color-syn-string)" },
    // inline code - monospace + subtle bg tint
    {
        tag: tags.monospace,
        fontFamily: "var(--font-mono)",
        fontSize: "0.875em",
        backgroundColor: "color-mix(in srgb, var(--color-fg) 6%, transparent)",
    },
    // structural punctuation - dim, recede into background
    { tag: [tags.bracket, tags.separator], color: "var(--color-syn-struct)" },
    { tag: tags.punctuation, color: "var(--color-syn-struct)" },
    { tag: tags.contentSeparator, color: "var(--color-syn-struct)" },
    { tag: tags.brace, color: "var(--color-syn-struct)" },
    // links
    { tag: tags.link, color: "var(--color-syn-link)" },
    { tag: tags.labelName, color: "var(--color-syn-label)" },
    { tag: tags.url, color: "var(--color-syn-tag)", textDecoration: "underline" },
    // comments and suppressed content - italic only on HTML comments
    { tag: tags.blockComment, color: "var(--color-syn-comment)", fontStyle: "italic" },
    { tag: tags.escape, color: "var(--color-syn-comment)" },
    // headings - distinct color per level + weight
    { tag: tags.heading1, color: "var(--color-syn-invalid)", fontWeight: "800" },
    { tag: tags.heading2, color: "var(--color-syn-string)", fontWeight: "700" },
    { tag: tags.heading3, color: "var(--color-syn-type)", fontWeight: "700" },
    { tag: tags.heading4, color: "var(--color-syn-tag)", fontWeight: "600" },
    { tag: tags.heading5, color: "var(--color-syn-label)", fontWeight: "600" },
    { tag: tags.heading6, color: "var(--color-syn-link)", fontWeight: "600" },
    // list and definition markers
    { tag: tags.list, color: "var(--color-syn-type)" },
    { tag: tags.definitionKeyword, color: "var(--color-syn-type)" },
    { tag: tags.content, color: "var(--color-syn-comment)" },
    // preformatted, signature, table caption share monospace gray
    { tag: tags.meta, color: "var(--color-syn-comment)", fontFamily: "var(--font-mono)" },
    // templates
    { tag: tags.typeName, color: "var(--color-syn-type)" },
    { tag: tags.variableName, color: "var(--color-syn-variable)" },
    { tag: tags.keyword, color: "var(--color-syn-keyword)" },
    // ref and html tags
    { tag: tags.tagName, color: "var(--color-syn-tag)", fontWeight: "600" },
    // table header row - orange like list markers
    { tag: tags.heading, color: "var(--color-syn-type)", fontWeight: "600" },
    // namespace prefix (Category:, File:)
    { tag: tags.namespace, color: "var(--color-syn-tag)", fontWeight: "600" },
    // magic words (__NOTOC__ etc)
    { tag: tags.processingInstruction, color: "var(--color-syn-keyword)" },
    // math opaque block content
    { tag: tags.string, color: "var(--color-syn-string)" },
    // bare bracket errors
    { tag: tags.invalid, color: "var(--color-syn-invalid)", textDecoration: "underline wavy" },
]);

export function wikitext(): LanguageSupport {
    return new LanguageSupport(wikitextLanguage, syntaxHighlighting(wikitextHighlight));
}
