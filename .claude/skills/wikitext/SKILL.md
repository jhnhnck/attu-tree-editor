---
name: wikitext
description: >
  Reference for MediaWiki wikitext syntax: headings, links, templates,
  infoboxes, tables, categories, references, and magic words. Use when
  writing or editing wikitext for the Attu Project wiki, when asking how to
  format a table, link, infobox, ref tag, or template in MediaWiki markup,
  or when checking correct wikitext syntax for any element. Also called wiki
  markup or wikicode.
when_to_use: >
  Use when the user asks how to format something in wikitext, what the syntax
  for a link or table is, how to write a template call or parser function, or
  how to use any MediaWiki markup element. See reference.md for full syntax
  tables.
---

# wikitext

MediaWiki's markup language is officially called **wikitext** (also: wiki markup, wikicode). It is processed by MediaWiki's PHP parser and Parsoid. The canonical reference is https://www.mediawiki.org/wiki/Help:Wikitext.

For extended syntax tables (parser functions, magic word variables, HTML entities), see [reference.md](reference.md).

---

## Text formatting

| Effect | Markup |
|--------|--------|
| Bold | `'''text'''` |
| Italic | `''text''` |
| Bold + italic | `'''''text'''''` |
| Monospace | `<code>text</code>` |
| Preformatted | Start line with a space, or use `<pre>` |
| Suppress markup | `<nowiki>text</nowiki>` |

A single line break in the source is ignored. A blank line starts a new paragraph. Use `<br />` to break a line within a paragraph.

---

## Headings

Headings must start at the beginning of the line. Level 1 (`= Heading =`) is reserved for the article title; begin sections at level 2.

```
== Section ==
=== Subsection ===
==== Sub-subsection ====
```

---

## Links

### Internal (wikilinks)

```
[[Page name]]                 — link, displays page name
[[Page name|Display text]]    — link with custom label
[[Page name#Section]]         — link to a section
[[:Category:Name]]            — link to a category page without categorizing
[[:File:Example.jpg]]         — link to a file page without displaying it
```

**Pipe trick:** `[[Help:Templates|]]` auto-strips the namespace and parenthetical, displaying just "Templates".

**Link capitalization:** The first letter of a page name is case-insensitive; all subsequent letters must match exactly.

**Lowercase display of proper nouns in prose** (Attu Project convention): use a pipe — `[[Grand Calming|Grand calming]]` — so the link target is correct while the display follows the prose case convention.

### External links

```
[https://example.com Display text]   — numbered if no text is given
https://example.com                  — auto-linked bare URL
[mailto:address@example.com text]    — email link
```

### File / image embedding

```
[[File:Example.jpg]]
[[File:Example.jpg|thumb|Caption text]]
[[File:Example.jpg|right|200px|Caption]]
```

Use `[[:File:Example.jpg]]` to link to the file description page without embedding the image.

---

## Lists

```
* Bullet item
** Nested bullet
# Numbered item
## Nested number
; Term
: Definition
```

Do not mix list markup with blank lines inside the list; a blank line ends the list and restarts numbering.

---

## Tables

Tables are the most syntax-sensitive element. Every component must be on its own line unless using the same-line shorthand.

```
{| class="wikitable"
|+ Caption (optional; must precede first row)
|-
! Header 1 !! Header 2
|-
| Cell A || Cell B
|-
| Cell C || Cell D
|}
```

| Token | Meaning |
|-------|---------|
| `{|` | Open table (attributes go on this line) |
| `|}` | Close table |
| `|-` | New row (attributes go on this line) |
| `!` | Header cell |
| `!!` | Next header cell on same line |
| `|` | Data cell |
| `\|\|` | Next data cell on same line |
| `|+` | Table caption |

**Cell attributes:** place before the cell content, separated by `|`:
```
| style="color:red;" | Red text
```

**Content that itself contains block markup** (nested lists, headings, another table) must start on its own new line within the cell:

```
|-
|
* list item one
* list item two
```

---

## Templates

```
{{Template name}}
{{Template name|param1|param2}}
{{Template name|key=value|key2=value2}}
```

**Parameter access inside a template definition:**
- `{{{1}}}` — first unnamed parameter
- `{{{key}}}` — named parameter
- `{{{key|default}}}` — named parameter with fallback

**Special invocation forms:**
- `{{subst:Name}}` — substitutes the template content at save time (static expansion)
- `{{msgnw:Name}}` — displays raw source without processing

**Transclusion scope tags** (used inside template definitions):
- `<noinclude>` — visible only when viewing the template directly, not when transcluded
- `<includeonly>` — visible only when transcluded, not when viewing directly
- `<onlyinclude>` — only this portion is transcluded

**Escaping inside template calls:**
- `{{!}}` → literal `|`
- `{{=}}` → literal `=`

---

## Infoboxes

Infoboxes are templates with named parameters. Call them at the top of the article, before the lede paragraph. Field names are case-sensitive and wiki-specific; check the template's documentation or a neighboring article for the exact field list.

```
{{Infobox settlement
| name        = Parumo
| image       = Parumo_harbor.jpg
| caption     = The harbor district
| population  = 84,000
| founded     = 3 TT
}}
```

Use `attu-wiki` to fetch the current template definition and field list before drafting an infobox.

---

## Categories

```
[[Category:Category name]]
[[Category:Category name|Sort key]]
```

- Multiple category tags per page are allowed.
- The sort key controls alphabetical placement within the category listing. To file a page under a different letter, use a pipe: `[[Category:Cities|Parumo]]`.
- To link to a category page without categorizing the current page, prefix with a colon: `[[:Category:Cities]]`.
- Category hierarchy: add category tags to a category page itself to nest it under a parent category.

Place all category tags at the bottom of the article, after the references section.

---

## References (Cite extension)

```
Text requiring citation.<ref>Citation text here.</ref>

Reusing the same source:<ref name="smith2020" />

First use with a name:
<ref name="smith2020">Smith, J. (2020). ''Example Book''. p. 12.</ref>

==References==
<references />
```

- Named references (`name="id"`) can be reused with a self-closing tag: `<ref name="id" />`.
- The `<references />` tag (or `{{Reflist}}`) must appear in the References section.
- Grouped references: `<ref group="notes">` with `<references group="notes" />`.

---

## Magic words — behavior switches

Place at the top of the article. These suppress or force automatic features:

| Switch | Effect |
|--------|--------|
| `__NOTOC__` | Hide the table of contents |
| `__FORCETOC__` | Force the table of contents even with fewer than four headings |
| `__NOEDITSECTION__` | Hide the edit links next to section headings |
| `__NOGALLERY__` | Render files in a category as links, not thumbnails |

---

## Common pitfalls

- **Table cells with block content:** if a cell contains a list, heading, or nested table, the content must start on a new line after the `|` cell marker. Putting `* item` on the same line as `|` will render the asterisk literally.
- **Blank lines inside lists:** a blank line ends the list. Numbered lists restart from 1 after any blank line.
- **Category vs. category link:** `[[Category:X]]` categorizes the page. `[[:Category:X]]` creates a visible link without categorizing.
- **Template pipe escaping:** a literal `|` inside a template parameter value breaks the parameter boundary. Use `{{!}}` instead.
- **Heading spacing:** `== Heading ==` and `==Heading==` both work, but the surrounding spaces are conventional.
- **External link format:** `[URL text]` with a space between the URL and the display text. No space produces a numbered link `[1]`.
- **Named refs:** the closing use must be self-closing (`<ref name="id" />`), not `<ref name="id"></ref>`.
