# Changes

## 1.5.1

The search page now wears GenesisL1's look, the colours and type of
genesisl1.com.

- **GenesisL1's colours.** White and near-black with GenesisL1's blue, in
  place of the warm paper and green: the page, the panels, the map's stage,
  tooltips and controls, in the light and dark themes. Corners are square,
  as on genesisl1.com.
- **GenesisL1's type.** Inter for text and the maps' labels, IBM Plex Sans
  for headings and topic names, and DM Mono for small labels, served with the
  page from `app/fonts/`. They replace Atkinson Hyperlegible and Newsreader;
  `NOTICE.md` credits them.
- **New pictures.** The README's pictures show the new look.
- **genesisl1.com/broccoli/search/.** genesisl1.com's copy of the search
  page moved there, and the Broccoli page opens it in a new tab; the
  documentation links to it.
- The examples and the test page use the same colours.

## 1.5.0

Broccoli now says what it is, a GenesisL1 in-house open-source search
results clustering engine; no source asks for an API key any more; and the
repository comes with full documentation.

Sources:

- **OpenAlex and arXiv page by number.** Both now ask for numbered pages of
  100 records (`page=1`, `2`, `3`…) instead of a cursor. OpenAlex answers the
  second page of a cursor only for callers with an API key (HTTP 401, "API
  key required for cursor paging"), while numbered pages work for everyone,
  up to 10,000 results. Searches of more than 100 records on the OpenAlex
  and arXiv tabs work again, with no key.
- **No API key fields.** The search page no longer asks for an NCBI or an
  OpenAlex key, and forgets any key an earlier version kept. Settings,
  Access holds only optional contact e-mails and a proxy address. Code can
  still pass a free key as `settings.apiKey` to the PubMed and OpenAlex
  sources.
- **Clearer messages.** When OpenAlex's daily allowance for an address is
  spent, the page says so, and that it renews the next day while the other
  sources keep working. An HTTP 401 or 403 from a source no longer suggests
  getting a key, and NCBI's rate limiting asks for a minute's wait.

GenesisL1:

- The README, the documentation, the search page, the library's banner,
  every file's header and `CITATION.cff` present Broccoli as GenesisL1's
  in-house search results clustering engine, with links to
  genesisl1.com/broccoli.html, the GenesisL1 ecosystem and GL1X. The search
  page's landing names the GenesisL1 ecosystem, the Broccoli page and the
  source code, and its settings name the version as a GenesisL1 project.

Documentation:

- New pages: `docs/README.md` (where to start), `docs/SEARCH-PAGE.md` (the
  search page, links that open a search, troubleshooting),
  `docs/SOURCES.md` (every source in detail, and writing your own),
  `docs/EMBEDDING.md` (links, frames, the library and the maps on your
  pages), `docs/SELF-HOSTING.md` (static hosts, an nginx configuration,
  caching, a Content Security Policy, the E-utilities proxy),
  `docs/GENESISL1.md` (Broccoli in the GenesisL1 ecosystem) and
  `docs/FAQ.md`, plus `CONTRIBUTING.md` and `SECURITY.md`.
- New example: `examples/map.html` draws the maps on a page of your own,
  with zooming.

## 1.4.1

- **The 🥦 mark.** Broccoli's mark is now the Unicode broccoli, drawn by the
  reader's own emoji font: in the search page's header, as its icon, and in
  the README.
- **Theme from an embedding page.** A page that shows the search page in a
  frame can set its theme for the visit, with `?theme=light`, `dark` or
  `system` in the frame's address, or a `{ type: 'broccoli:theme', theme }`
  message. The reader's saved setting is not touched, and a theme picked in
  the settings takes over again. The page also declares both colour schemes
  and a theme colour for each.
- The README's main picture follows GitHub's light or dark mode.

## 1.4.0

Broccoli becomes a general topic-map engine for search results, with
search sources that bring records in from any search API.

Library:

- **Search sources.** A source describes itself (name, sorts, filters,
  settings, examples) and fetches one page of records (`fetchPage`) or a whole
  search (`search`). `searchSource(source, query, options)` runs a search on
  any source, pages through the API, keeps to its rate limit, retries HTTP 429
  and 5xx, follows an `AbortSignal` and returns complete records.
  `registerSource`, `getSource`, `listSources`, `unregisterSource` and
  `defineSource` manage them; `jsonSource` makes a source of any JSON search
  API from an address template and field paths.
- **Built-in sources**, all callable from web pages: PubMed, Europe PMC,
  ClinicalTrials.gov, Preprints (bioRxiv, medRxiv, Research Square, SSRN and
  more, through Europe PMC), arXiv (through the OpenAlex index), OpenAlex,
  Crossref, DOAJ, DataCite (datasets and software), INSPIRE-HEP and Wikipedia
  in eight languages, plus arXiv's own API for servers and proxies.
- **One record shape** for every source, a superset of the PubMed article:
  type (article, preprint, trial, dataset, software, page…), venue, links to
  the record in its source and to PubMed, PMC, arXiv or the DOI, subject
  terms, tags such as preprint, trial phase or retraction. `toDocuments()`
  and the exports take records from any source.
- Helpers for writing sources: `createRequester()`, `buildUrl()`,
  `makeRecord()`, markup readers that turn HTML and JATS abstracts into plain
  text, safe HTML and labelled sections, name and date parsers.
- Exports: RIS and BibTeX types follow the record (preprints, datasets,
  software, trials, web pages); BibTeX keys stay `pmid…` for PubMed records
  and are made from the source and id for the others. The CSV gains `source`
  and `id` columns and calls the journal column `venue`; JSON clusters list
  record `ids` (and `pmids` when every record has one).
- `MESH_CHECK_TAGS`, `uninvertMesh`, `formatAuthors` and `toDocuments` moved
  to the sources' records module; they are exported as before.

Search page:

- **A tab for each source** above the search box, grouped by kind. With a
  query on the page, a tab runs the same query on the new source. Each
  source has its own sorts, filters, record limit, example searches and
  query syntax note; sources registered before `app/app.js` loads get tabs
  too.
- Records from any source: citations with the journal, preprint server,
  repository or sponsor; tags for preprints, reviews, retractions, trial
  phases and statuses; the source's links; subject terms (MeSH, keywords,
  conditions and interventions, subjects).
- Settings show the filters of the source you are on, and keys and access
  for every source that takes them (NCBI, OpenAlex, Crossref). Filters and
  NCBI settings saved by earlier versions carry over.
- The address holds the source (`s=`, left out for PubMed) and, for
  Wikipedia, the language (`lang=`); links made by earlier versions open the
  same PubMed search. `#s=arxiv` alone opens a source.
- Wikipedia searches in other languages are clustered and labelled in their
  language.
- New records replace the ones on show only once they are grouped, so the map
  and the list always match, and a new search can start while one is
  running.
- Errors say what the source said: a refused key, OpenAlex's daily
  allowance, a query the API could not read.

## 1.3.0

Search page:

- **An organic treemap**, now the default map. Each topic is a convex cell of
  a weighted power diagram whose area is its share of the records, the
  weights solved by Newton's method and the sites relaxed towards their
  cells' centroids, which rounds the cells into organic shapes (Voronoi
  treemaps, after Balzer and Deussen). Subtopics, once known, are cells
  inside their topic's cell; a topic without subtopics shows one dot per
  record, and a group too small to split shows its records as a honeycomb.
  Shapes morph from one zoom level to the next, each subtopic growing from
  the place it had inside its topic. Should a power diagram not resolve, the
  map falls back on squarified rectangles.
- **Florets**: the fourth map shows a head of broccoli from above. Each topic
  is a floret on a stem from the centre and each record a bud on Vogel's
  sunflower spiral. Links and saved settings that name the map's old id
  (`umbel`) open it.
- **New colours**: eight matte hues in a fixed order (blue, apricot, teal,
  lavender, sage, rose, sky, sand), made for a white surface and a
  near-black one. Each hue has tiers computed in OKLCH: a soft fill, a
  lighter top for its gradient, an edge for outlines, a dark ink of the same
  hue for the names on it (at least 6.9:1 on the eight fills) and a stronger
  mark for small marks such as beads, buds and the swatches beside topic
  names. Beyond eight topics the hues return a step darker, then a step
  lighter.
- The filters are part of a shared link (`f=`, when they differ from the
  defaults), so a link finds the same records anywhere, and changing them
  through the address fetches again.
- A new look for the page itself, in Broccoli's greens.

Library:

- The presets are `default` and `abstracts`.
- The maps' font can be set with `window.BroccoliFont`, and
  `BroccoliViews.voronoiTreemap()` lays out cells in any convex polygon.
- Comments and parameter descriptions were rewritten to describe what the
  code does, and the notices credit the papers each part is built on.

## 1.2.0

Search page:

- The map spans the full width of the results and is as tall as the screen
  allows. The topic list and the records moved below it. A new button shows
  the map on the whole screen; Escape or the button brings the page back.
- **Bubbles**, rebuilt: topics are packed to fill the whole map instead of
  one big circle, so they are much larger, with softly lit colours and
  shadows. Beads along the bottom of a bubble show its subtopics in their own
  colours. Zooming into a bubble turns it into the background while its
  subtopics spread out of it over the map; zooming out reverses it. A topic
  too small to split shows its records as bubbles titled with the articles.
  Click between the bubbles to zoom out.
- The map style switch slides between its buttons, and one canvas map
  dissolves into the next.
- Phones: the map runs edge to edge, the style switch fills the width (icons
  only below 345 pixels), the path above the map scrolls sideways, and
  nothing scrolls the page sideways down to 320 pixels. The map keeps its
  size while the address bar slides in and out.
- The florets map: larger florets and labels on large maps; a label that has
  no room beside its floret moves under or over it.
- Hatching on groups outside any topic is drawn as a pattern, which makes
  zooming smoother.

## 1.1.0

Search page:

- Three new maps next to the florets: **Bubbles** (topics as packed circles),
  **Treemap** (squarified tiles) and **Radial** (rings around the current
  group). They are drawn on a canvas and every change is animated: zooms
  follow a smooth path, and shapes grow, shrink and fade into place. The
  buttons above the map switch between them, and the choice is kept in the
  address.
- **Zoom and cluster again**: click a topic, on the map or in the list, and
  the map zooms into it while its records are clustered into subtopics. This
  works at every level, as deep as the records allow, and a group too small
  to split shows its records one by one. A second Web Worker clusters the
  topics you are likely to open next, so most zooms are instant. Zoom out
  with the path above the map, the Zoom out button, Escape or the browser's
  back button.
- New colours, checked for colour-blind separation and contrast in light and
  dark mode. Subtopics wear tints of their topic's hue, and groups outside
  any topic are grey and hatched.
- Keyboard on the map: the arrow keys move between topics, Enter zooms in,
  Escape zooms out. A screen reader hears each topic's name and size.
- The record list, the exports and the copied PMIDs follow the topic you
  zoomed into, at any level. The JSON export also saves every level of topics
  explored so far.
- The record list fills in while the browser is idle, so it never holds up an
  animation. "Show more" adds records below the list instead of redrawing it.

Library:

- Lingo has a new parameter, `clusterBuilder.labelGeneralization` (Broccoli's
  own addition, off by default). When a shorter phrase inside a cluster's
  label scores almost as well and covers at least twice the documents, the
  cluster takes the shorter label, so "Breast Cancer" is no longer lost to
  "Breast Cancer Screening". The `abstracts` preset turns it on at 0.85.
- The biomedical word list no longer lets generic study verbs ("treated",
  "randomized", "administered", "evaluated" and similar) become labels on
  their own.

## 1.0.0

First release: Lingo, STC and bisecting k-means in JavaScript, eight Snowball
stemmers, the PubMed E-utilities client, the Web Worker clusterer and the
search page with its map of florets.
