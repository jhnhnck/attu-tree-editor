# wikitext extended reference

Full syntax tables for less common features. Loaded on demand from SKILL.md.

## Contents
1. Parser functions — conditional, string, date/time, URL
2. Magic word variables
3. HTML entities (selection)
4. Image display options
5. Table attribute examples

---

## 1. Parser functions

Parser functions use the `{{#name:args}}` or `{{name:args}}` form. Available functions depend on the wiki's installed extensions.

### Conditional

```
{{#if: condition | value if true | value if false }}
{{#ifeq: string1 | string2 | equal | not equal }}
{{#switch: value
 | case1 = result1
 | case2 = result2
 | #default = fallback
}}
{{#ifexist: Page name | exists | does not exist }}
```

### String manipulation

```
{{lc: TEXT }}           — lowercase
{{uc: text }}           — uppercase
{{lcfirst: Text }}      — lowercase first letter only
{{ucfirst: text }}      — uppercase first letter only
{{#len: string }}       — character count
{{#sub: string | start | length }}   — substring (zero-indexed)
{{#pos: string | search | offset }}  — position of substring
{{#replace: string | search | replace }}
{{padleft: text | width | padding-char }}
{{padright: text | width | padding-char }}
```

### Date and time

```
{{#time: format }}               — current date/time
{{#time: format | timestamp }}   — specific timestamp
```

Common format codes: `Y` (4-digit year), `m` (01-12 month), `d` (01-31 day), `H` (00-23 hour), `i` (00-59 minute).

### Number formatting

```
{{formatnum: 1000000 }}          — formats with locale separators (1,000,000)
{{formatnum: 1,000,000 | R }}    — removes formatting (returns 1000000)
```

### URL functions

```
{{localurl: Page name }}
{{localurl: Page name | query=string }}
{{fullurl: Page name }}
{{canonicalurl: Page name }}
{{urlencode: string }}
{{urldecode: string }}
```

### Plural and gender

```
{{plural: count | singular | plural }}
{{gender: username | masculine | feminine | unspecified }}
```

---

## 2. Magic word variables

These return information about the page or wiki at render time.

### Page variables

| Variable | Returns |
|----------|---------|
| `{{PAGENAME}}` | Page name without namespace |
| `{{FULLPAGENAME}}` | Page name with namespace |
| `{{NAMESPACE}}` | Current namespace |
| `{{SUBPAGENAME}}` | Last component after `/` |
| `{{BASEPAGENAME}}` | Everything before the last `/` |
| `{{TALKPAGENAME}}` | Corresponding talk page |
| `{{REVISIONID}}` | Current revision ID |
| `{{REVISIONDAY}}` | Day of last edit |
| `{{REVISIONMONTH}}` | Month of last edit |
| `{{REVISIONYEAR}}` | Year of last edit |

### Site variables

| Variable | Returns |
|----------|---------|
| `{{SITENAME}}` | Wiki name |
| `{{SERVER}}` | Server URL (no trailing slash) |
| `{{SERVERNAME}}` | Domain name only |
| `{{SCRIPTPATH}}` | Script path |

### Date variables (server time)

| Variable | Returns |
|----------|---------|
| `{{CURRENTYEAR}}` | Four-digit year |
| `{{CURRENTMONTH}}` | Two-digit month (01-12) |
| `{{CURRENTDAY}}` | Day without leading zero |
| `{{CURRENTDAY2}}` | Day with leading zero |
| `{{CURRENTDOW}}` | Day of week (0=Sunday) |
| `{{CURRENTTIME}}` | HH:MM format |
| `{{CURRENTTIMESTAMP}}` | YYYYMMDDHHmmss |

---

## 3. HTML entities (selection)

Standard HTML character references work inside wikitext.

| Display | Entity |
|---------|--------|
| non-breaking space | `&nbsp;` |
| en dash | `&ndash;` |
| em dash | `&mdash;` |
| ellipsis | `&hellip;` |
| copyright | `&copy;` |
| registered | `&reg;` |
| trademark | `&trade;` |
| euro | `&euro;` |
| left double quote | `&ldquo;` |
| right double quote | `&rdquo;` |
| left single quote | `&lsquo;` |
| right single quote | `&rsquo;` |
| section sign | `&sect;` |
| pilcrow | `&para;` |
| alpha | `&alpha;` |
| beta | `&beta;` |
| delta | `&delta;` |
| pi | `&pi;` |

---

## 4. Image display options

Options are pipe-separated inside `[[File:...]]`. Order is flexible except that the caption (if any) must be last.

| Option | Effect |
|--------|--------|
| `thumb` or `thumbnail` | Thumbnail with caption box |
| `frame` | Full-size with border and caption |
| `frameless` | No border, scaled to thumbnail size |
| `border` | Thin border, no caption box |
| `right` | Float right (default for thumb) |
| `left` | Float left |
| `center` | Center, no float |
| `none` | No float, no alignment |
| `upright` | Scale relative to user preference |
| `Npx` | Fixed width (e.g. `200px`) |
| `NxMpx` | Max width × height (e.g. `200x150px`) |
| `alt=text` | Alt text for accessibility |
| `link=Page` | Link target overrides default file page |
| `link=` | Disables the link entirely |

Example:
```
[[File:Parumo_harbor.jpg|thumb|right|200px|alt=Harbor view|The harbor district at low tide.]]
```

---

## 5. Table attribute examples

Attributes use standard HTML attribute syntax and go on the same line as the token they modify.

```
{| class="wikitable sortable" style="width:100%;"
|- style="background:#f0f0f0;"
! style="width:20%;" | Column A
! Column B
|-
| colspan="2" | Spans two columns
|-
| rowspan="2" | Spans two rows
| Row 1, Col 2
|-
| Row 2, Col 2
|}
```

Common `class` values on attuproject.org — check existing articles for the site's conventions; `wikitable` is safe for most data tables.
