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
    headingLevel: number; // 0 = not in heading; 2–6 = current level (phase 1)
    templateDepth: number; // {{ }} nesting count (phase 2)
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
        inTable: false,
    };
}

const wikitextLanguage = StreamLanguage.define<WikitextState>({
    name: "wikitext",
    tokenTable: {
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
    },
    token(stream: StringStream, state: WikitextState): string | null {
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

        // <code>...</code> (treated as single-line for phase 0)
        if (stream.match("<code>")) {
            while (!stream.eol()) {
                if (stream.match("</code>")) break;
                stream.next();
            }
            return "code";
        }

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
]);

export function wikitext(): LanguageSupport {
    return new LanguageSupport(wikitextLanguage, syntaxHighlighting(wikitextHighlight));
}
