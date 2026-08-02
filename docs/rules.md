# Formatting rules

Rules run only when both their option and the selected cumulative reliability
level allow them. The default level is `normal`.

## Matrix

| Rule | Level | Default | Option / CLI | Syntax | Major preservation boundary |
| --- | --- | --- | --- | --- | --- |
| `headings` | safe | on | `formatHeadings`; `--no-format-headings` | Standalone level 2–6 headings | Empty or ambiguous marker content is unchanged |
| `blankLines` | safe | on | `normalizeBlankLines`; `--no-normalize-blank-lines` | Runs of blank lines | Does not otherwise trim lines |
| `templates` | normal | on | `formatTemplates`; `--no-format-templates` | Parser-confirmed templates | Argument order/state/values and structural fingerprint |
| `categories` | normal | on | `formatCategories`; `--no-format-categories` | Standalone categories and defaultsort | Titles, sort keys, order, and nested metadata |
| `lists` | normal | on | `formatLists`; `--no-format-lists` | Parser-confirmed single-line list prefixes | Marker sequence, hierarchy, content nodes, and non-ASCII whitespace |
| `fileLinks` | normal | on | `formatFileLinks`; `--no-format-file-links` | One whole-line file/image link | Target, caption, values, and option order |
| `wikilinks` | normal | on | `formatWikilinks`; `--no-format-wikilinks` | Parser-confirmed ordinary internal links and redirect targets | Labels, fragments, file options, category sort keys, and remote targets |
| `externalLinks` | normal | off | `formatExternalLinks`; positive/negative flags | Whole-line labelled external links | URL and label text |
| `references` | normal | off | `formatReferences`; positive/negative flags | Whole-line self-closing ref tags | Attributes, order, quoting, and values |
| `interlanguageLinks` | experimental | off | `formatInterlanguageLinks`; positive/negative flags | Configured whole-line language links | Target, prefix spelling, and relative order |
| `sectionSpacing` | normal | off | `formatSectionSpacing`; positive/negative flags | Level 2–6 headings beside content blocks | Consecutive headings and existing blank lines |
| `redirects` | normal | on | `formatRedirects`; `--no-format-redirects` | First non-empty redirect line | Target and unsupported trailing syntax |
| `behaviorSwitches` | normal | on | `formatBehaviorSwitches`; `--no-format-behavior-switches` | Standalone recognized switches | Unknown/embedded switches and relative order |
| `htmlVoidTags` | safe | style `html5` | `htmlVoidTagStyle`; value flag | Attribute-free `br`, `hr`, `wbr` | Attributes and extension tags |
| `tables` | normal | on | `formatTables`; positive/negative flags | Parser-confirmed wiki tables | Rows, cells, attributes, contents, and fingerprints |

“Default on” still means no change for already canonical or ineligible input.
Parser-assisted rules receive parser context for the current source snapshot;
once text changes, later rules use a fresh context rather than stale ranges.

## Headings

Eligibility:

- one complete line;
- matching 2–6 opening and closing `=` markers;
- non-empty title that does not itself begin or end with `=`.

Transformation:

```wikitext
==Title==
```

becomes:

```wikitext
== Title ==
```

The rule removes only ASCII spaces and tabs between the markers and title, then
inserts one marker-adjacent ASCII space. Non-breaking, narrow no-break,
ideographic, and other non-ASCII whitespace remains title content. The rule has
no dedicated parser context or diagnostic object. It does not repair mismatched
markers, format inline heading-like text, change heading level, or rewrite title
content. Protected blocks are hidden before it runs.

## Blank lines

Three or more consecutive blank lines become two:

```text
one



two
```

becomes one empty-line pair between the text. The rule does not remove ordinary
single blank lines, normalize other whitespace, or expose diagnostics.
Protected content is restored unchanged.

## Templates

The unified template engine operates on parser template and supported
magic-word argument nodes, deepest first, with at most 64 passes.

`formatTemplates` is its only enablement switch. `inlineTemplateSpacing`,
`templateParameterLayout`, and `lineWidth` select its supported layout behavior.

It can normalize named-parameter spacing and choose inline or multiline
layout. It also replaces every ASCII underscore in a parser-confirmed ordinary
template invocation title with one ASCII space:

```wikitext
{{a_b_c|x=1}}  →  {{a b c|x=1}}
```

The actual parameter spacing still follows the existing inline or multiline
layout policy. Consecutive underscores remain consecutive spaces. Recognized
`subst:` and `safesubst:` modifiers retain their exact spelling, casing, and
colon while only the title after the modifier is normalized.

Single-line named and explicitly numbered templates use
`inlineTemplateSpacing`. The canonical forms are:

```wikitext
{{a|b=1|c=2}}
{{ a | b = 1 | c = 2 }}
```

`compact` removes syntax whitespace at the braces, pipes, and equals signs.
`spaced` uses one space at every one of those positions. The default `auto`
mode safely generates both candidates, rejects any candidate that does not
round-trip or preserve the template structural fingerprint, and first filters
them by `lineWidth`. If both fit, it chooses the candidate with the lower
syntax-whitespace edit cost. If only one fits, that candidate wins even when the
other would require fewer whitespace edits; if neither fits, the template
becomes multiline. Parameter-internal positions around pipes and equals signs
have weight 2; outer brace positions have weight 1. A total-cost tie prefers the
lower parameter-internal cost, then `compact`. Whitespace inside values is not a
style signal.

Only parser-confirmed ASCII layout whitespace is normalized. Template names,
named keys, and named values retain non-breaking spaces (`U+00A0`), narrow
no-break spaces (`U+202F`), ideographic spaces (`U+3000`), and other non-ASCII
whitespace. For multiline values, the delimiter-adjacent line break is handled
explicitly so line-sensitive content and its indentation remain intact.

For example:

```wikitext
{{a| b = 1}}  →  {{ a | b = 1 }}
{{ a|b=1 }}   →  {{a|b=1}}
```

An originally multiline named or explicitly numbered template remains
multiline. For an originally single-line template, the formatter first builds
the parser-safe candidate requested by `inlineTemplateSpacing` (or both
candidates for `auto`) and verifies its structure. A candidate with a final
length at or below `lineWidth` remains inline; if no safe candidate fits, the
formatter attempts a multiline layout.

Parameter count, raw source length, and the mere presence of a nested template
or other structure are not independent multiline triggers. Short, structurally
equivalent nested templates can therefore remain inline. Actual newlines and
line-sensitive list or table content still keep a template multiline.

Once a named-parameter template must remain or become multiline,
`templateParameterLayout` chooses its layout. The default `flush` layout is:

```wikitext
{{Infobox|name=Example|value=42}}
```

may become:

```wikitext
{{Infobox
| name = Example
| value = 42
}}
```

The other multiline modes are `compact`, which emits `|name=value`, and
`indented`, which emits a leading space before each parameter pipe. Multiline
templates never gain spaces after `{{` or before `}}`.

Anonymous parameters are whitespace-sensitive in MediaWiki. For templates
containing any anonymous parameter, `lineWidth` is therefore a soft constraint:

- a simple template with at most three arguments may collapse to one line only
  when the resulting candidate has no newline and exact structural equivalence
  is proven;
- line width never causes anonymous parameters to gain indentation or trailing
  newlines;
- existing multiline anonymous values are preserved byte-for-byte unless an
  exactly equivalent compact candidate exists;
- nested structures, comments, and embedded tables prevent compact collapse.
- mixed named/anonymous templates never use the spaced inline style; safe
  compact candidates preserve anonymous bytes and compact only named syntax,
  otherwise the original boundary spelling is retained.

For example, `{{Lang` followed by `|ja|シエラ}}` on the next line becomes
`{{Lang|ja|シエラ}}`, while a long positional template stays inline even when
it exceeds `lineWidth`. The formatter does not convert anonymous parameters to
explicit numeric parameters.

Eligibility and safety:

- balanced parser-confirmed delimiters and a non-empty stable ordinary
  `template-name` range containing only plain title text;
- parser argument ranges for order and named/anonymous state;
- exact anonymous argument bytes, including empty, whitespace-only, leading,
  trailing, tab, and newline values;
- exact structural fingerprint and parseable, idempotent candidate;
- bounded candidate layouts, falling back to a less aggressive boundary-safe
  layout when needed;
- parser-confirmed tables inside arguments are treated as opaque after table
  formatting.

Parser functions use an explicit policy. Whitespace-sensitive core functions
such as `#if`, `#ifeq`, `#switch`, `#expr`, `#tag`, and `#invoke` are
opaque-preserve; unknown `#` functions are unsupported-ambiguous unless a
specific policy says otherwise. Magic words, triple-brace parameters, and
magic-word-like configured variables are also preserved. Dynamic or composed
template names are skipped because a stable title boundary cannot be proven;
nested ordinary templates may still be formatted independently. Title
normalization never touches parameter keys, parameter values, anonymous
arguments, parser-function arguments, links, comments, HTML, extensions, or
ordinary prose.

Diagnostics count inspected, eligible, changed, canonical, ambiguous, fallback,
and convergence outcomes with precise skip reasons. A convergence or
equivalence failure returns the original document.

Non-goals: parameters are never reordered, renamed, renumbered, converted
between named/anonymous state, or semantically rewritten. Anonymous-to-numbered
conversion is not enabled implicitly by multiline layout. No site-specific
template layout policy or page-wide style learner is inferred.

## Categories and defaultsort

The footer engine recognizes:

- standalone category links whose namespace matches configured aliases;
- standalone defaultsort templates whose magic word matches configured aliases.

It uses parser category nodes where available and conservative whole-line
matching for selected localization aliases. It excludes metadata inside
templates and other parser ranges.

Eligible metadata is grouped at the footer while preserving category order,
titles, sort keys, and source spelling in `preserve` localization mode:

```wikitext
Body

{{DEFAULTSORT:Example}}
[[Category:A]]
[[Category:B|Sort]]
```

Certainly recognized namespace or magic-word keywords may become canonical
English only when `localizedSyntaxStyle` requests it. Category-talk or unknown
category-like namespaces are not moved. Categories are never sorted or
deduplicated by title.

Footer diagnostics report moved/formatted/canonicalized counts.

## Lists

The list rule handles a physical line only when the parser confirms its complete
leading sequence of `*`, `#`, `:`, and `;` as a list prefix. For a non-empty
item, it replaces ASCII spaces or tabs between that exact marker sequence and
the first content node with one ASCII space. It may also remove trailing ASCII
horizontal whitespace that lies outside structured content:

```wikitext
**Item
```

becomes:

```wikitext
** Item
```

Marker-only empty items receive no trailing space, and existing horizontal
whitespace after their markers is removed. Non-ASCII whitespace is not treated
as a layout separator and is preserved.

Valid mixed and nested sequences such as `:*`, `:#`, `*#`, `#*`, `::*`, `:*#`,
`;:`, and `:;` retain their exact marker bytes and hierarchy. Definition-list
colons inside term/definition content are not marker-prefix targets.

Parser-confirmed templates, wikilinks, references, inline HTML, and ordinary
comments may be the item content. Their source, order, and internal whitespace
remain byte-for-byte unchanged; the rule edits only ranges before the first
content node or after the last content byte. It never enters those structures.

Ignore-controlled lines, opaque blocks, multiline structured content, unclosed
comments, protected placeholders, table delimiters, Unicode separators, and
ambiguous parser boundaries remain unchanged. Each skip category is reported by
`ListDiagnostics`, together with inspected, eligible, changed, canonical,
mixed-marker, comment-bearing, and structured-content line counts. Candidate
output is reparsed and its marker hierarchy, content bytes, structured children,
and exact round trip are checked before edits are accepted; final document
equivalence still runs afterward.

Before requesting parser data, the rule scans physical lines for a potential
line-start `*`, `#`, `:`, or `;`. A document without candidates returns
immediately with zero list diagnostics; this fast path proves only absence and
does not make eligibility decisions. With candidates, the rule reuses the
formatter's parser context, confirms list nodes, and maps structural ranges to
candidate lines without rescanning every structure for every line. These are
performance changes only and do not broaden list syntax eligibility.

Pure CRLF documents are normalized by the formatter-wide line-ending envelope,
so this and every other rule still sees LF internally. Accepted output is
restored entirely to CRLF.

## File and image links

The rule recognizes one complete file/image link occupying a line, using parser
file nodes when possible and a conservative alias-aware fallback:

```wikitext
[[File:Example.png|thumb|right|300px|alt=Example]]
```

It validates the target and pipe parts and preserves file name, option order,
widths, captions, alt text, page/class/lang values, and normal text. In
`preserve` mode it keeps namespace/option spelling and only performs safe
horizontal cleanup. In `canonical-english` mode, certainly recognized namespace
and image-option keywords may become canonical English.

Inline or multiple file links, nested links, templates, parser-like syntax,
HTML/extensions, multiline links, gallery contents, and table lines are
skipped. Diagnostics count formatted, canonicalized, and unsafe-skipped lines.

## Ordinary internal links

The normal-level `wikilinks` rule is enabled by default. It uses parser
`link-target` ranges for ordinary internal links and redirect targets, replacing
each ASCII underscore in the page-title component with exactly one ASCII space:

```wikitext
[[Page_Name/sub_page|display_text]]
[[Page_Name#Section_Name|label]]
```

becomes:

```wikitext
[[Page Name/sub page|display_text]]
[[Page Name#Section_Name|label]]
```

Only text before the first parser-confirmed `#` is eligible. The target title is
normalized; an explicit display label and section fragment are preserved
byte-for-byte. Empty pipe-trick labels, leading colons, namespace spelling,
capitalization, slashes, link trails, and surrounding prose are preserved.
Consecutive underscores become consecutive ASCII spaces and are not collapsed
or trimmed.

Embedded file/image nodes and category assignments remain owned by their
specialized rules. Configured interlanguage prefixes and links classified as
interwiki by the active parser configuration are excluded. Fragment-only links,
complex targets containing nested parser structure, stale or unstable target
ranges, and links inside protected or unsafe parent nodes are left unchanged.
Links in table cells, refs, comments, and opaque extension blocks follow the
existing protection policy.

Diagnostics count inspected, eligible, formatted, fragment-containing, skipped
links and replaced underscores, with skip reasons for files, categories, remote
targets, pure fragments, unstable targets, and unsafe parents. Final document
equivalence treats underscores and ASCII spaces as identical only for an
eligible parser-confirmed page-title component; labels, fragments, category
sort keys, file options, external links, and ordinary text remain strict.

## External links

This parser-assisted normal rule handles one labelled external link on a
whole line:

```wikitext
[https://example.test  Label]
```

becomes:

```wikitext
[https://example.test Label]
```

Only horizontal separation between URL and label changes. URL and label bytes
are otherwise preserved. Bare/inline/multiple/malformed links and lines with
templates, wikilinks, HTML, refs, lists, tables, or placeholders are skipped.
Diagnostics report formatted and unsafe-skipped lines. Missing or stale parser
context makes the rule a no-op.

## References

The normal reference rule normalizes one whole-line self-closing `ref` or
`references` extension:

```wikitext
<ref name="source"/>
```

becomes:

```wikitext
<ref name="source" />
```

Parser extension nodes identify whole-line candidates, followed by exact source
checks. Tag casing and the space before `/>` are normalized; attribute order,
quotes, names, and values are preserved.

Content-bearing, inline, multiline, multiple, indented, unbalanced, or
structured lines are skipped. Diagnostics distinguish formatted refs,
references groups, and unsafe skips. The rule does not format citation content
or merge references.

## Interlanguage links

The footer engine recognizes only a standalone unlabelled link whose prefix is
in `interlanguagePrefixes`, excluding leading-colon, category, and file links:

```wikitext
[[ja:Target]]
```

`interlanguagePlacement: preserve` retains location. `footer` moves recognized
links after categories while preserving relative order, target, and prefix
spelling. The aggressive profile enables this rule with `footer` placement;
the production and default profiles leave it disabled.

Labelled, embedded, multiple, template/table-contained, unknown-prefix, or
leading-colon links are not moved. Diagnostics report moved and formatted
counts. The rule never sorts language codes.

## Section spacing

This parser-assisted rule identifies complete level 2–6 heading lines. When a
heading directly touches non-empty content, it inserts one missing blank line:

```wikitext
Text
== Heading ==
More
```

becomes:

```wikitext
Text

== Heading ==

More
```

Adjacent content may be prose, lists, templates, tables, categories,
DEFAULTSORT or interlanguage links, file links, behavior switches, comments,
HTML/extensions, redirects, or protected block placeholders. Consecutive
level 2–6 headings stay together. Existing blank lines are not removed; larger
runs remain the responsibility of `blankLines`. Heading marker normalization
belongs to `headings`. Diagnostics count insertions before and after headings.

## Redirects

The redirect rule handles only the first non-empty page line when parser
structure or a conservative localized whole-line check confirms it:

```wikitext
#REDIRECT[[Target]]
```

becomes:

```wikitext
#REDIRECT [[Target]]
```

Alias spelling is preserved by default; certainly recognized localized
keywords may become `#REDIRECT` in canonical-English mode. The separate
default-on `wikilinks` rule may normalize underscores in the redirect's
parser-confirmed page-title component; its fragment remains unchanged.

Redirect-like later lines, unbalanced/multiple links, templates in targets,
pipe/trailing text, comments, HTML, or unsafe target characters are skipped.
Diagnostics count formatted and canonicalized redirects. The rule does not
resolve targets or detect redirect loops.

## Behavior switches

The shared footer engine recognizes standalone aliases for supported MediaWiki
behavior-switch IDs.

`behaviorSwitchPlacement: preserve` keeps location and removes only eligible
trailing horizontal whitespace. `footer` moves switches as an ordered footer
group and removes exact duplicate emitted values. Canonical-English mode may
emit the canonical `__ID__` for a certainly recognized alias.

Embedded, unknown, template/table/ref/comment-contained switches remain
unchanged. Diagnostics count moved, formatted, and canonicalized switches. The
rule does not infer site-specific switch semantics.

## HTML void tags

This rule controls only attribute-free `br`, `hr`, and `wbr`:

```wikitext
<br />
```

becomes `<br>` in `html5` mode or remains/becomes `<br />` in `xhtml` mode.
`preserve` is a no-op.

Tags with attributes and MediaWiki extensions such as `<ref />` or
`<references />` are outside scope. Opaque regions are protected before the
global spelling replacement. There is no dedicated diagnostic object.

## Tables

The table engine uses parser-owned table, row, caption, and cell source ranges,
deepest first, with a maximum of 64 passes. A narrow balanced fallback handles
parser-confirmed tables hidden by template-stage order or parser disagreement
around separators inside link labels. If a required range or separator boundary
is unstable, that table remains original rather than receiving a partial rewrite.

The audited syntax surfaces are:

| Surface | Parser representation | Canonical layout |
| --- | --- | --- |
| opener | `table-syntax` `{|` + `table-attrs` | `{|` or `{| attrs` |
| explicit row | `tr` `table-syntax` `|-` + `table-attrs` | `|-` or `|- attrs` |
| caption | `td` subtype `caption` | `|+ Caption`, or `|+ attrs | Caption` |
| standalone data/header cell | `td` subtype `td`/`th` | `| Cell` / `! Header` |
| inline separator | parser-confirmed `||` / `!!` | split in `auto`/`split`; retained in `preserve` |
| closer and continuation lines | table syntax / ordinary content | unchanged |

The engine does not invent closer or continuation-line formatting, and it skips
an outer cell or caption whose content contains a nested table.

Table and row attributes use one ASCII space after the marker when a parser
confirmed attribute node is present:

```wikitext
{|class="wikitable"
|-class="row"
```

becomes:

```wikitext
{| class="wikitable"
|- class="row"
```

Attribute spelling, quoting, order, values, and any additional whitespace are
preserved byte-for-byte. Attribute-free or whitespace-only marker regions do
not gain a space.

Captions use the same parser-confirmed layout model as cells:

```wikitext
|+Caption
|+style="text-align:center"|Caption
```

becomes:

```wikitext
|+ Caption
|+ style="text-align:center" | Caption
```

An empty caption remains `|+`; a lone layout space after it is removed. Caption
comments, links, templates, HTML, and multiline content are retained exactly
apart from the one marker-adjacent ASCII space. Non-ASCII whitespace is content
and is never normalized.

`auto` and `split` split parser-confirmed multi-cell `||`/`!!` rows:

```wikitext
| A || B
```

becomes:

```wikitext
| A
| B
```

One ASCII space immediately before a confirmed inline separator is separator
layout and is included in the replacement, so splitting does not create a
trailing space. One space immediately after the separator becomes the normal
space after the new marker. Additional whitespace remains content; in the
following illustration, `·` denotes a literal ASCII space:

```wikitext
|··A··||··B··
```

becomes:

```wikitext
|··A·
|··B··
```

In one-cell-per-line layout, non-empty data and header cells use one layout
space after the parser-confirmed marker:

```wikitext
| Cell
! Header
```

Empty cells remain `|` or `!` with no trailing whitespace. Parser-confirmed
cell attributes use one layout space after the marker and on both sides of the
attribute/content separator:

```wikitext
| style="text-align:center" | Cell
! scope="col" | Header
```

Quoting, attribute order and values, and cell content are otherwise preserved.
Only the first parser-confirmed ASCII layout space is syntax; additional
leading, trailing, and attribute-boundary whitespace remains structurally
significant.

`preserve` preserves whether `||` and `!!` are inline; it does not disable safe
opener, row, caption, or standalone-cell marker layout normalization. Nested
tables, tables in template text, comments, links, HTML, extensions, refs,
templates, parser functions, and multiline cell contents are handled as
parser-confirmed or protected opaque content.

The structural fingerprint ignores only parser-confirmed canonical layout space
for table/row/caption/cell attribute boundaries, caption/cell marker content,
and confirmed separator-adjacent space. Semantic content, extra or non-ASCII
whitespace, row/cell type, attributes, order, and nesting remain fingerprinted.
Rows, cells, and columns are never reordered or padded for alignment.

Diagnostics provide per-table line, nesting, separator policy and reason,
changed/ambiguous state, parser fallback, line outcomes, skip reason, and
aggregate eligible/changed/canonical/ambiguous counts. Convergence or
equivalence failure fails closed for the document.
