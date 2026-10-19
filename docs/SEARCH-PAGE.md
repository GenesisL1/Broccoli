<!-- SPDX-License-Identifier: MIT · Copyright (c) 2026 Decentralized Science Labs LLC -->
# The search page

The search page (`index.html`) is Broccoli, GenesisL1's search results
clustering engine, with a face: pick a source, search it the way you would
there, and read the results as a map of their topics. It runs at
[genesisl1.com/broccoli/search/](https://genesisl1.com/broccoli/search/),
and in any folder you open or publish. Everything happens in your browser: the page
asks each source's API directly and clusters the records on your device. It
asks for no account and no API key.

- [Searching](#searching)
- [Reading the map](#reading-the-map)
- [Zooming in](#zooming-in)
- [Topics and records](#topics-and-records)
- [Exporting](#exporting)
- [Settings](#settings)
- [Links that open a search](#links-that-open-a-search)
- [Keyboard and accessibility](#keyboard-and-accessibility)
- [Troubleshooting](#troubleshooting)

## Searching

**Pick a source.** The tabs above the search box are the sources, grouped by
kind: PubMed, Europe PMC and Trials for biomedicine; Preprints and arXiv;
OpenAlex, Crossref and DOAJ for every field; DataCite for data and code;
INSPIRE for physics; Wikipedia for everything else. Every tab is always in
sight: where the row is too narrow, the tabs wrap onto a second or third
line instead of scrolling. Below the box, a card describes the source you are on, with
a note on its query syntax and links to its site and documentation. With a
query on the page, another tab runs the same query on its source, so you can
compare what different indexes hold. Each source keeps its own filters.

**Type a query** in the source's own syntax: PubMed's field tags (`[ti]`,
`[mh]`), Europe PMC's `TITLE:`, DOAJ's and DataCite's Elasticsearch fields,
INSPIRE's `t` and `a`, Wikipedia's quoted phrases and `intitle:`.
[SOURCES.md](SOURCES.md) describes each one. Or start from an example: the
landing page draws the source's example searches as florets; click one, or
pick it from the list beside them.

**Choose how much and in what order**, next to the box:

- **Records**: how many records to fetch and cluster: 100, 200, 300, 500,
  1,000 (the default) or 2,000, up to the source's most (1,000 for arXiv,
  OpenAlex and DOAJ). More records give finer topics and take longer to
  fetch.
- **Order**: the source's own orders: best match, most recent, most cited,
  latest start (Trials), recently added (DOAJ). The order decides *which*
  records come back when a query matches more than you fetch.
- **Algorithm**: Lingo (the default: one descriptive phrase per topic, and a
  record can sit in several topics), STC (topics from shared phrases, up to
  three phrases per label) or k-means (bisecting k-means: every record in
  exactly one topic). Changing it re-clusters the same records at once.

While records arrive, a progress bar and a status line show how far the
search has got. When the records are in, they are clustered in a background
worker, so the page stays responsive.

## Reading the map

The map shows the topics of the level you are on, each sized by its number
of records and named in the records' own words. Four styles show the same
topics; switch at any time with the buttons above the map, and the place you
are in stays.

- **Treemap** (the default): an organic treemap. Each topic is a cell whose
  area is its share of the records, relaxed towards a rounded shape.
  Subtopics already computed show as cells inside their topic's cell, and a
  topic too small to split shows its records as a honeycomb.
- **Bubbles**: topics as circles packed to fill the map. Beads along the
  bottom of a bubble are its subtopics.
- **Radial**: a sunburst. Topics share the inner ring by size; their
  subtopics and sub-subtopics fill up to two rings outside, each within its
  parent's angle.
- **Florets**: a head of broccoli seen from above. Each topic is a floret on
  a stem from the centre, and each of its records a bud on Vogel's sunflower
  spiral.

Every shape carries its name and size, so colour is never the only cue. The
colours are eight matte hues in a fixed order, with quieter variants for
subtopics. **Other topics** gathers the records that no topic took, and is
drawn hatched. The full-screen button shows the map on the whole screen;
Escape returns.

## Zooming in

Click a topic, on the map or in the topic list, and the map zooms into it
while Broccoli clusters that topic's records into subtopics. Shapes morph
from one level to the next, and each subtopic grows from its place. The
words of the labels on the way down are set aside, so a subtopic is never
just its parent's name again. It goes as deep as the records allow, up to
six levels; a group too small to split shows its records one by one.

To zoom out, click a level in the path above the map, press **Zoom out**,
click between the bubbles or on the centre of the radial map, press Escape,
or use the browser's back button: each level you open is a step in the
browser's history. A second background worker clusters the topics you are
likely to open next, so most zooms are instant.

## Topics and records

Beside the map, the **topic list** names the topics of the current level
with their sizes; click one to zoom into it.

Below, the **records** of the level you are in, 50 at a time (Show more adds
the next 50). Each record has:

- a citation: authors, the journal, preprint server, repository or sponsor,
  and the date;
- the title and abstract, with the words of the topic's label highlighted
  where they occur, and structured abstracts in their sections (Background,
  Methods, Results…);
- subject terms: MeSH headings, keywords, subjects, or a trial's conditions
  and interventions;
- links to the record at its source and to PubMed, PMC, arXiv or the DOI;
- flags for retractions, preprints, reviews, trial phases and statuses, and
  the like.

**Copy** copies the identifiers of the records you are looking at, one per
line: PMIDs, DOIs, arXiv IDs, NCT numbers or Wikipedia links, whichever the
records have. **Open in PubMed** opens the ones with a PMID in PubMed (up to
200 at a time).

**About this result**, at the end, tells what was run: the source and the
query as the source read it (PubMed's query translation), how many records
matched and how many were clustered, the requests made, the algorithm and
how long it took, the size of the term-document matrix, and any notes from
the source or about the parameters.

## Exporting

The Export menu saves the records of the topic you are in:

| Format | For | What it holds |
|---|---|---|
| RIS | Zotero, EndNote, Mendeley | one entry per record, typed as article, preprint, dataset, software, trial or web page |
| BibTeX | LaTeX reference lists | the same; keys are `pmid…` for PubMed records, otherwise made from the source and id |
| CSV | spreadsheets | source, id, title, authors, venue, year, DOI, PMID, PMCID, the record's topics, address |
| JSON | programs, archives | the whole result: the source, the query, every record, and every level of topics explored so far |

Exports are made in your browser; nothing is uploaded.

## Settings

The Settings button opens a panel. Settings are kept in this browser only.

- **Search filters** of the source you are on: a range of years and the
  source's switches, such as abstracts only, open access, peer-reviewed only,
  English only, humans only, free full text, reviews or trials only (PubMed),
  interventional, recruiting or with results (Trials), datasets, software or
  every kind of output (DataCite), and the Wikipedia language.
  [SOURCES.md](SOURCES.md) lists each source's filters and what they do.
- **Text**:
  - *Use subject terms too* adds the records' MeSH headings, keywords,
    subjects or conditions and interventions to the text that is clustered.
  - *Ignore scientific boilerplate* keeps words like "results suggest" and
    labels like "Control Group" or "95% CI" out of the labels.
  - *Extra stop words*, one per line (`*` as a wildcard: `covid*`): words a
    label never starts or ends with.
  - *Extra stop labels*, one per line (`*` for any words: `* cohort`): labels
    never used.
  - *Label style*: Title Case, Sentence case or as written.
- **Parameters** of the algorithm in use, every one of them, with a button
  to reset them. [PARAMETERS.md](PARAMETERS.md) describes each.
- **Access**, all optional: a contact e-mail for PubMed (NCBI asks tools to
  name one) and an E-utilities address, to use a proxy such as
  [`server/eutils-proxy.php`](SELF-HOSTING.md#the-e-utilities-proxy); a
  contact e-mail for Crossref, which serves such requests from its more
  reliable pool. No source asks for a key or an account, and each setting is
  sent only to the service it belongs to.
- **Appearance**: light, dark or the system's theme. The switch at the top
  right of the page flips between light and dark, and is remembered the same
  way.

Changes to the text options and parameters re-cluster the records on the
page at once; changes to the filters and years apply to your next search.

## Links that open a search

The address bar always holds the search on the page, so a view can be
bookmarked or sent, and finds the same records anywhere:

```
index.html#s=arxiv&q=graph+neural+networks&sort=date&n=500&v=bubbles
```

| Parameter | Meaning | Values |
|---|---|---|
| `s` | the source | a source id, such as `pubmed` (the default), `europepmc`, `clinicaltrials`, `preprints`, `arxiv`, `openalex`, `crossref`, `doaj`, `datacite`, `inspire`, `wikipedia` |
| `q` | the query | text |
| `n` | records to fetch | up to 2,000 and the source's most; 1,000 by default |
| `sort` | the order | `relevance` (the default), `date`, `cited`, or `added` for DOAJ |
| `a` | the algorithm | `lingo` (the default), `stc`, `bkm` |
| `from`, `to` | years | four-digit years |
| `f` | the filters that are on | filter ids separated by commas, or `none`; without `f`, the source's defaults |
| `lang` | the Wikipedia edition | `de`, `fr`, `es`, `it`, `pt`, `nl`, `ru`; `en` by default |
| `v` | the map | `treemap` (the default), `bubbles`, `radial`, `florets` |
| `p` | the topic zoomed into | the labels from the top level down, separated by `\|` |

A link with a query carries its whole search: anything it leaves out is the
default, not the reader's own settings, so it finds the same records for
everyone. A link with only a source, such as `#s=datacite`, opens that
source ready for a search. The filter ids are:

| Source | Filters (`f`) |
|---|---|
| `pubmed` | `abstracts` (on by default), `english`, `humans`, `free`, `reviews`, `trials` |
| `europepmc` | `abstracts` (on), `open`, `peer`, `reviews` |
| `clinicaltrials` | `interventional`, `recruiting`, `results` |
| `preprints`, `arxiv`, `doaj` | `abstracts` (on) |
| `openalex` | `abstracts` (on), `open`, `articles` |
| `crossref` | `abstracts` (on), `articles` |
| `datacite` | `datasets` (on), `software` (on), `other` |
| `inspire`, `wikipedia` | none |

[EMBEDDING.md](EMBEDDING.md) shows how to put such links, or the page itself,
on your own site.

## Keyboard and accessibility

- `/` jumps to the search box.
- On the source tabs, the left and right arrow keys move between sources;
  Home and End go to the first and last.
- On the map, the arrow keys move between topics, Enter (or Space) zooms in,
  and Escape (or Backspace) zooms out. A screen reader hears each topic's
  name and size.
- Escape closes the settings panel and leaves the full-screen map.
- With reduced motion set in the system, zooms, fades and blooms are off.
- Names are drawn on every fill at a contrast of 4.5:1 or better, neighbouring
  colours are checked for colour-blind separation, and light and dark themes
  come from the same palette.
- On a phone the map runs edge to edge, and the page never scrolls sideways,
  down to 320 pixels.

## Troubleshooting

| What you see | What it means, and what to do |
|---|---|
| Could not reach PubMed | The browser could not connect to NCBI. Check your connection. If a firewall blocks NCBI, set a proxy address under Settings, Access. |
| Could not reach (another source) | The same for that source. Try again in a moment, or another source. |
| … did not answer in time | The source did not answer within 30 seconds (45 for PubMed). Try again, or ask for fewer records. |
| NCBI is limiting requests from this address | Too many requests reached NCBI from your network, which can happen on a shared connection. Wait a minute and try again. |
| OpenAlex (or arXiv) has reached its daily allowance | OpenAlex gives every address a daily allowance of searches, about ten of 1,000 records (the page's default) or fifty of 200, and the arXiv tab shares it. It renews the next day; the other sources keep working. For arXiv papers, try Preprints or INSPIRE in the meantime. |
| … turned this search down (HTTP 401 or 403) | The source refused the request. Try again with fewer records, or search another source. |
| … could not run this search | The source could not read the query; its message and its syntax note follow. Check quotes, brackets and field names. |
| Nothing found | Loosen the filters (abstracts only, years) or the query. PubMed and Wikipedia offer a spelling suggestion when they have one. |
| Few topics, or a large Other topics | Fetch more records, turn on subject terms, or try another algorithm; STC and Lingo find different kinds of topics. |
| A label made of filler words | Add the words to Extra stop words, or the label to Extra stop labels. |
| Plain fonts on a page opened from disk | Chrome blocks web fonts on `file://` pages; served from a web server, the page uses its own fonts. |
