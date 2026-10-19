# 🥦 Broccoli

**Broccoli is a GenesisL1 in-house open-source search results clustering
engine.** It takes the records a search returns, whatever searched for them,
groups them into labelled topics in the browser with Lingo, Suffix Tree
Clustering (STC) or bisecting k-means, and draws the topics as zoomable maps.
Click a topic and Broccoli zooms in and clusters that topic's records again,
so you can go down level by level, up to six levels deep.

It comes with eleven search sources built in, ten for science and one
general (PubMed, Europe PMC, ClinicalTrials.gov, preprints, arXiv, OpenAlex,
Crossref, DOAJ, DataCite, INSPIRE-HEP and Wikipedia), and a search page with a
tab for each. None of them needs an API key or an account. Any other search
API plugs in with a few lines of code, or none: give it an address template
and the names of the fields.

There is no server, no build step and nothing to install. Open `index.html`,
or put the folder on any static host; visitors' browsers call the search
APIs directly. The library is one file with no dependencies.

Broccoli is made by Decentralized Science Labs as a native part of the
[GenesisL1](https://genesisl1.com) ecosystem, the public Layer 1 for
verifiable data, models, applications and open infrastructure. Its search
page runs at [genesisl1.com/broccoli/search/](https://genesisl1.com/broccoli/search/)
(about Broccoli: [genesisl1.com/broccoli.html](https://genesisl1.com/broccoli.html)),
and [GL1X](https://gl1x.com), the GenesisL1 explorer, uses it to map the
literature of the molecular structures on the chain. MIT License, © 2026
Decentralized Science Labs LLC.

**[Try Broccoli](https://genesisl1.com/broccoli/search/)** ·
[About](https://genesisl1.com/broccoli.html) ·
[Documentation](docs/README.md) · [Sources](docs/SOURCES.md) ·
[Changelog](CHANGELOG.md) ·
[GenesisL1 ecosystem](https://genesisl1.com/ecosystem.html)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/broccoli-treemap-dark.webp">
  <img src="docs/images/broccoli-treemap.webp" width="1600" height="957" alt="The organic treemap of a PubMed search for longevity and ageing: 200 records in 28 topics">
</picture>

A head of broccoli is a cluster of florets, and every floret is a cluster of
smaller ones; in Romanesco the same spiral repeats at every scale. Broccoli
reads a result set the same way: topics that open into subtopics, which open
again.

| Organic treemap | Bubbles | Radial | Florets |
|---|---|---|---|
| ![Treemap](docs/images/broccoli-treemap-small.webp) | ![Bubbles](docs/images/broccoli-bubbles-small.webp) | ![Radial](docs/images/broccoli-radial-small.webp) | ![Florets](docs/images/broccoli-florets-small.webp) |
| cells of a weighted power diagram, relaxed into organic shapes | circles packed to fill the map | a sunburst of up to three rings | a head of broccoli seen from above, one bud per record |

## Documentation

This README introduces Broccoli and is the reference for its API. The
[docs](docs/README.md) go further:

| Document | What it covers |
|---|---|
| [The search page](docs/SEARCH-PAGE.md) | using the page: sources and query syntax, records and filters, the maps, zooming, records, exports, links, keyboard, troubleshooting |
| [Search sources](docs/SOURCES.md) | each built-in source in detail (what it searches, syntax, sorts, filters, paging, limits, records) and how to write your own |
| [How it works](docs/GUIDE.md) | how Broccoli reads text, finds and names topics, and lays out and colours its maps |
| [Parameters](docs/PARAMETERS.md) | every algorithm parameter, with defaults and ranges |
| [Embedding](docs/EMBEDDING.md) | the search page in a frame on your site, links that open a search, the library and the maps on your own pages |
| [Self-hosting](docs/SELF-HOSTING.md) | publishing the page: static hosts, nginx, caching, Content Security Policy, the E-utilities proxy, versions |
| [Broccoli and GenesisL1](docs/GENESISL1.md) | Broccoli's place in the GenesisL1 ecosystem: genesisl1.com, GL1X and its PubMed search, AI agents |
| [Questions](docs/FAQ.md) | short answers to what people ask first |
| [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) | working on Broccoli; reporting a vulnerability |

## Contents

```
index.html               the search page, with a tab for each source
app/                     its script, styles, colours, the maps and bundled fonts
dist/broccoli.js         the library as one classic script (window.Broccoli, or CommonJS)
dist/broccoli.mjs        the same library as an ES module
src/                     the library as ES modules, which dist/ is built from
src/sources/             the search sources and the interface they share
examples/                small pages: your own documents, any source, the PubMed API, ES modules, the maps
server/eutils-proxy.php  optional proxy that gives every visitor NCBI's higher rate limit
tests/                   browser test suite
tools/                   build.py, serve.py, run_tests.py (Python 3)
docs/                    the documentation: see docs/README.md
CHANGELOG.md             what changed in each version
CONTRIBUTING.md          how to work on Broccoli
SECURITY.md              how to report a vulnerability
NOTICE.md                credits: the papers, JAMA, Snowball, the fonts, the data sources
CITATION.cff             how to cite Broccoli
```

## Quick start

1. Open `index.html` in a browser, from disk or from a web server.
2. Pick a source and search it, for example `senolytics` on PubMed,
   `graph neural networks` on arXiv or `psilocybin depression` on
   ClinicalTrials.gov.

Or use the copy that runs at
[genesisl1.com/broccoli/search/](https://genesisl1.com/broccoli/search/).

To serve the folder locally, run `python3 tools/serve.py` and open
http://localhost:8000/. `php -S localhost:8000` and other static servers work
too. To publish the page, copy `index.html`, `app/`, `dist/` and `LICENSE` to
any static host, such as GitHub Pages, Netlify, S3 or IPFS. With GitHub Pages turned on
for this repository (Settings → Pages → deploy from the `main` branch, root
folder), the page is served at `https://<owner>.github.io/Broccoli/`.
[docs/SELF-HOSTING.md](docs/SELF-HOSTING.md) has the details, with an nginx
configuration and a Content Security Policy.

Opened from disk, everything works. Chrome blocks web fonts on `file://`
pages, so the page uses system fonts there.

## Sources

Every built-in source answers requests from web pages (CORS), so the search
page needs no server, and none needs an API key or an account. Each one
turns its API's records into the same record shape, described under
[Search sources](#search-sources) below; [docs/SOURCES.md](docs/SOURCES.md)
describes each source in full.

| Tab | Source | What it searches | Notes |
|---|---|---|---|
| PubMed | [PubMed](https://pubmed.ncbi.nlm.nih.gov/) through NCBI E-utilities | MEDLINE, PubMed Central and NCBI Bookshelf | PubMed syntax and filters, MeSH, spelling suggestions; up to 10,000 records in code; an optional proxy of your own |
| Europe PMC | [Europe PMC](https://europepmc.org/) | PubMed, PubMed Central, Agricola, patents, theses, preprints | its own fielded syntax; abstracts, MeSH, citation counts |
| Trials | [ClinicalTrials.gov](https://clinicaltrials.gov/) API v2 | registered clinical studies | summaries as abstracts; conditions, keywords and interventions as subject terms; phase and status |
| Preprints | Europe PMC's preprint index | bioRxiv, medRxiv, Research Square, SSRN, Preprints.org and more | the preprint server is the venue |
| arXiv | arXiv papers in the [OpenAlex](https://openalex.org/) index | physics, mathematics, computer science, quantitative biology and finance, statistics, electrical engineering, economics | arXiv's own API refuses web pages, so this tab reads OpenAlex; up to 1,000 papers; `arxiv-api` is arXiv's API for servers and proxies |
| OpenAlex | [OpenAlex](https://openalex.org/) | scholarly works in every field | abstracts from inverted indexes; up to 1,000 works, in numbered pages of 100, which need no key |
| Crossref | [Crossref](https://www.crossref.org/) REST API | works with Crossref DOIs, from every publisher | JATS abstracts; ranks every work that matches any word, best first; an optional contact e-mail |
| DOAJ | [DOAJ](https://doaj.org/) | articles in vetted open access journals | the first 1,000 results of a search |
| DataCite | [DataCite](https://datacite.org/) REST API | datasets, software and other research outputs (Zenodo, Dryad, Figshare, data centres) | choose datasets, software or every kind of output |
| INSPIRE | [INSPIRE-HEP](https://inspirehep.net/) | high-energy physics, astrophysics, cosmology, gravitation, nuclear physics | arXiv links, collaborations, citation counts |
| Wikipedia | [Wikipedia](https://www.wikipedia.org/), any of eight languages | a general search: page titles and the text around each match | topics labelled in the edition's language |

Google's Custom Search JSON API, the usual way to put Google results in a
program, is closed to new customers and due to shut down on 1 January 2027,
so Wikipedia is the open general search here. A web search API that needs a
secret key belongs behind a small proxy of your own, which a source can then
call; see [Plug in your own search](#plug-in-your-own-search).

## The search page

- **Sources**: a tab for each source above the search box. Switching tabs
  with a query on the page runs the same query on the new source, so you can
  compare what different indexes hold. Each source keeps its own filters.
- **Search** takes the source's own syntax: PubMed's field tags, Europe
  PMC's `TITLE:`, DOAJ's and DataCite's Elasticsearch syntax, INSPIRE's
  `t` and `a`, Wikipedia's CirrusSearch. You choose how many records to
  cluster (100 to 2,000, or the source's maximum), the order (the source's
  own: best match, newest, most cited) and the algorithm.
- **Fetching**: records come in pages within each API's rate limit, with a
  progress bar. When a PubMed or Wikipedia query finds nothing, the page
  offers their spelling suggestion.
- **Clustering** uses titles and abstracts (a trial's summary, a Wikipedia
  snippet), plus subject terms if you turn them on: MeSH headings, keywords,
  Crossref and DataCite subjects, a trial's conditions and interventions. It
  runs in a Web Worker, so the page stays responsive. Wikipedia searches in
  German, French, Spanish, Italian, Portuguese, Dutch or Russian are
  clustered and labelled in that language.
- **Maps**: four ways to see the topics, all drawn in your browser and
  switchable at any time. The map spans the full width of the page and is as
  tall as the screen allows; a button shows it on the whole screen.
  - *Treemap* (the default): an organic treemap. Each topic is a cell of a
    weighted power diagram whose area is its share of the records, relaxed
    towards round shapes; subtopics are cells inside their topic's cell, and
    a topic too small to split shows its records as a honeycomb.
  - *Bubbles*: topics as circles packed to fill the map, sized by their
    records. Beads along the bottom of a bubble are its subtopics.
  - *Radial*: topics in a ring around the current group, with subtopics in
    the rings outside.
  - *Florets*: a head of broccoli seen from above. Each topic is a floret on
    a stem from the centre, and each of its records a bud on Vogel's
    sunflower spiral.

  The colours are eight matte hues in a fixed order, computed in OKLCH and
  checked for contrast and colour-blind separation in light and dark mode.
  Subtopics wear quiet variants of their topic's colour, and every shape
  carries its name, so colour is never the only cue. On phones the map runs
  edge to edge.
- **Zoom and cluster again**: click any topic, on the map or in the list, and
  the map zooms into it while Broccoli clusters its records into subtopics.
  Shapes morph from one level to the next. It keeps going as deep as the
  records allow, up to six levels; a group too small to split shows its
  records one by one. Zoom out with the path above the map, the Zoom out
  button, a click between the bubbles or on the centre of the radial map, the
  Escape key or the browser's back button. A second background worker
  clusters the topics you are likely to open next, so most zooms are instant.
- **Results**: the records of the topic you are in, each with a citation
  (authors, journal, server, repository or sponsor, date), the words of the
  topic's label highlighted in context, structured abstract sections,
  subject terms, links to the record in its source and to PubMed, PMC, arXiv
  or the DOI, and flags for retractions, preprints, reviews, trial phases and
  statuses.
- **Export** the records of the topic you are in as RIS (Zotero, EndNote,
  Mendeley), BibTeX or CSV. The CSV lists each record's subtopics. JSON
  saves the whole result: the source, the query, the records and every level
  of topics explored so far. You can also copy the records' identifiers
  (PMIDs, DOIs, arXiv IDs, NCT numbers), or open the records that have PMIDs
  in PubMed.
- **Settings**:
  - search filters of the source you are on: years, abstracts only, open
    access, peer-reviewed only, study type and status, resource types,
    PubMed's language, species, free full text, reviews and trials, the
    Wikipedia language
  - text options: subject terms, a filter for scientific boilerplate, your
    own stop words and stop labels (with `*` wildcards), label style
  - every algorithm parameter
  - access, all optional: a contact e-mail and a proxy address for PubMed, a
    contact e-mail for Crossref. No source asks for a key or an account.
  - theme: light, dark or system

  Settings are kept in this browser only, and each is sent only to the
  service it belongs to.
- **Embedding**: a page that shows the search page in a frame can set its
  theme without touching the reader's settings, with `?theme=light`, `dark`
  or `system` in the frame's address, or by sending it a message:
  `frame.contentWindow.postMessage({ type: 'broccoli:theme', theme: 'dark' }, '*')`.
  A theme the reader picks in the settings wins until the page sends another.
  See [docs/EMBEDDING.md](docs/EMBEDDING.md).
- **Sharing**: the address bar holds the source, the query, its options and
  filters, the map style and the topic you zoomed into
  (`#s=…&q=…&a=…&v=…&p=…`), so a view can be bookmarked or sent to someone,
  and finds the same records anywhere. `#s=arxiv` alone opens a source,
  ready for a search. [docs/SEARCH-PAGE.md](docs/SEARCH-PAGE.md#links-that-open-a-search)
  lists every parameter.
- **Keyboard**: `/` jumps to the search box; the arrow keys move along the
  source tabs. On the map, the arrow keys move between topics, Enter zooms
  in and Escape zooms out; a screen reader hears each topic's name and size.

## What it is for

Anything that returns more records than anyone can read in order:

- **Literature reviews and scoping**: what a field is made of before you
  read it, and the corners a query reaches that you did not mean.
- **Preprint watch**: the newest preprints on a subject, grouped, on the
  Preprints or arXiv tab sorted by date.
- **Trial landscapes**: what is being tested for a condition, by whom and how
  far along, on the Trials tab.
- **Dataset and software discovery**: the data and code deposited on a
  subject, on the DataCite tab.
- **Physics literature** on INSPIRE, and everything else on OpenAlex,
  Crossref and DOAJ.
- **General knowledge**: the meanings and neighbours of a term, on
  Wikipedia.

The engine itself knows nothing about science. Give `cluster()` any text
records and it finds their topics: support tickets, survey answers,
interview notes, patents, news, product reviews, internal documents, the
results of any search engine you can call.

## Part of GenesisL1

Broccoli is GenesisL1's own search results clustering engine, developed in
house by Decentralized Science Labs, the publisher of genesisl1.com, for the
GenesisL1 ecosystem.

- **[genesisl1.com/broccoli.html](https://genesisl1.com/broccoli.html)**
  presents Broccoli, and the search page from this repository runs at
  [genesisl1.com/broccoli/search/](https://genesisl1.com/broccoli/search/),
  with a tab for every source.
- **[GL1X](https://gl1x.com)**, the GenesisL1 explorer, uses Broccoli for its
  [PubMed search](https://gl1x.com/bio/pubmed): every molecular structure on
  the chain links to its literature, by its PDB ID and by the important words
  of its title, and the papers open as a map of topics. AI agents connected
  to GL1X's MCP server reach the same records with its `pubmed_search` tool.
- **Reproducible by design**, like the rest of GenesisL1: every random step
  draws from a seeded generator, so the same records with the same settings
  always give the same topics and the same map, and every label is made of
  words from the records.

[docs/GENESISL1.md](docs/GENESISL1.md) tells the whole story.

## Using the library

### Cluster your own records

```html
<script src="dist/broccoli.js"></script>
<script>
  const docs = [
    { title: 'Jaguar unveils an electric grand tourer', snippet: 'A 700 km range…' },
    { title: 'Camera traps count jaguars in the Amazon', snippet: '…' },
    // …
  ];
  const result = Broccoli.cluster(docs, { algorithm: 'lingo', queryHint: 'jaguar' });
  for (const c of result.clusters) console.log(c.label, c.size, c.documents);
</script>
```

From a CDN, straight from this repository's tags:

```html
<script src="https://cdn.jsdelivr.net/gh/GenesisL1/Broccoli@v1.5.2/dist/broccoli.js"></script>
```

jsDelivr also serves a minified copy if you ask for `broccoli.min.js`.

### Search a source, then cluster

```js
const res = await Broccoli.searchSource('europepmc', 'tau propagation', {
  limit: 300,                       // records to fetch
  sort: 'relevance',                // the source's own: see Broccoli.getSource('europepmc').sorts
  from: 2018, to: 2026,             // years, where the source has them
  filters: { open: true },          // the source's filters: see .filters
  onProgress: (done, total) => console.log(done, '/', total),
});
const docs = Broccoli.toDocuments(res.records, { includeMesh: true, includeKeywords: true });
const topics = Broccoli.cluster(docs, {
  preset: 'abstracts', queryHint: res.query, fields: ['title', 'abstract', 'terms'],
});
```

`Broccoli.listSources()` lists the sources with everything a search form
needs: names, descriptions, sorts, filters, settings and example queries.
A source's settings go in `settings`, for example a contact e-mail for
Crossref: `searchSource('crossref', q, { settings: { email: 'you@example.org' } })`.
No built-in source needs a key. For heavy use from code, PubMed and OpenAlex
also take a free key of your own as `settings.apiKey`; the search page never
asks for one.

### Plug in your own search

A source is an object with an id, a name and a function that fetches one
page of results. Records can be partial: Broccoli fills in the rest.

```js
Broccoli.registerSource({
  id: 'my-index',
  name: 'My index',
  pageSize: 100,                                   // the most the API returns at once
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'date', label: 'Newest' }],
  filters: [{ id: 'reviewed', label: 'Reviewed only', default: false }],
  async fetchPage(req, page) {                     // page = { page, size, offset, cursor }
    const url = Broccoli.buildUrl('https://search.example.org/api', {
      q: req.query, size: page.size, from: page.offset,
      sort: req.sort === 'date' ? 'newest' : undefined,
      reviewed: req.filters.reviewed ? 1 : undefined,
    });
    const json = await req.request.json(url, { signal: req.signal });   // rate-limited, retried
    return {
      total: json.total,
      records: json.items.map((it) => ({
        id: it.id, title: it.title, abstract: it.summary, url: it.link,
        authors: it.authors,                       // ['Ada Lovelace', …] or { lastName, foreName }
        year: it.year, doi: it.doi, journal: { title: it.venue }, keywords: it.tags,
      })),
      // cursor: json.next   ← for cursor paging; null when there are no more pages
    };
  },
});
```

Registered before `app/app.js` loads, a source gets its own tab on the
search page. For an API with nothing unusual about it, `jsonSource` writes
`fetchPage` for you:

```js
Broccoli.registerSource(Broccoli.jsonSource({
  id: 'my-index', name: 'My index',
  url: 'https://search.example.org/api?q={query}&size={size}&from={offset}&key={settings.apiKey}',
  results: 'items', total: 'total',            // dotted paths into the answer
  fields: { id: 'id', title: 'title', abstract: 'summary', url: 'link', year: 'year', authors: 'authors', venue: 'journal' },
}));
```

For APIs that need several steps, write `search(req)` in place of
`fetchPage` and return all the records at once (the PubMed source does this:
ESearch, then EFetch). [docs/SOURCES.md](docs/SOURCES.md#writing-a-source)
walks through writing a source: paging by offset, page number or cursor,
errors, settings and tests.

### In a Web Worker

```js
const clusterer = Broccoli.createClusterer();   // a worker when possible, else the same thread
const result = await clusterer.cluster(docs, {
  algorithm: 'stc',
  onProgress: (stage, fraction) => console.log(stage, fraction),
});
clusterer.mode;   // 'worker' or 'inline'
```

The single-file builds start their worker from their own source, so no extra
file is needed and it works on `file://` pages. With the modules in `src/`,
pass `{ workerUrl: 'src/worker-entry.js', workerType: 'module' }`.

### As an ES module

```js
import * as Broccoli from './dist/broccoli.mjs';   // or './src/index.js', the unbundled modules
const { cluster, searchSource } = Broccoli;
```

### The maps on your own page

The maps are plain scripts too: `app/colors.js` (`BroccoliColors`),
`app/views.js` (`BroccoliViews`, the canvas maps) and `app/florets.js`
(`BroccoliFlorets`, the SVG florets map). `BroccoliViews.create(stage,
options)` draws a tree of topics into an element and takes `setData(root,
focus)`, `setFocus(node)`, `update()`, `setView(view)` and `refresh()`; set
`window.BroccoliFont` before loading it to choose the labels' font.
`app/app.js` shows how the search page builds the tree and wires them up;
[docs/GUIDE.md](docs/GUIDE.md) describes the layouts.

## API

### `cluster(documents, options) → result`

`documents` is an array of strings or of objects. Unless `fields` names the
fields to use, these are clustered when present: `title`, `snippet`,
`abstract`, `content`, `summary`, `description`, `body`, `text`, `terms` and
`keywords`. Documents with none of them contribute all their other text
fields, except identifiers such as `id`, `url` or `doi`. Field values may be
strings or arrays of strings.

| Option | Default | Meaning |
|---|---|---|
| `algorithm` | `'lingo'` | `'lingo'`, `'stc'` or `'bkm'` (also accepted: `'kmeans'`, `'bisecting-kmeans'`) |
| `preset` | `'default'` | `'default'` or `'abstracts'` (see Presets below) |
| `parameters` | `{}` | algorithm parameters, nested or dotted: `{ 'matrixBuilder.titleWordsBoost': 3 }`, listed in [docs/PARAMETERS.md](docs/PARAMETERS.md) |
| `language` | `'en'` | `'en'`, `'de'`, `'fr'`, `'es'`, `'it'`, `'pt'`, `'nl'`, `'ru'`, `'none'`, or one you register |
| `fields` | see above | field names to cluster, such as `['title', 'abstract']` |
| `titleField` | `'title'` | words in this field weigh more |
| `queryHint` | `''` | the query; its words are never a label on their own |
| `extras` | from the preset | language extras, such as `['biomedical']` |
| `dictionaries` | none | extra stop words and stop labels, described below |
| `labelFormat` | the language's | `'title'` (Title Case, English default), `'sentence'` (default elsewhere) or `'original'` |
| `otherTopics` | `true` | add a cluster with the documents no other cluster took |
| `otherTopicsLabel` | the language's | the name of that cluster, "Other topics" in English |
| `onProgress` | none | `(stage, fraction) => {}` |

Dictionaries add stop words and stop labels for one request:

```js
dictionaries: {
  wordFilters:  ['covid', { glob: ['sars*'] }, { regexp: ['^\\d+mg$'] }],          // stop words
  labelFilters: ['data mining', { glob: ['* cohort', 'case *'] }, { regexp: ['^about '] }],  // stop labels
}
```

In label globs, a lone `*` stands for any number of words. Matching ignores
case.

The result is plain JSON, so it can go through `postMessage` or be saved
as is:

```js
{
  algorithm: 'lingo', language: 'en', documentCount: 200,
  clusters: [
    { id: 0, label: 'Smoking Cessation', labels: ['Smoking Cessation'], size: 21, score: 0.83,
      documents: [3, 17, …], merged: ['Quit Rates'] },        // merged: labels folded into this one
    …,
    { id: 14, label: 'Other topics', labels: ['Other topics'], size: 31, score: 0, documents: […], other: true },
  ],
  unclustered: [ … ],              // documents in no real cluster
  stats: { … }, timings: { preprocessing: { … }, factorization: 41, total: 380 },
  parameters: { … },               // the parameters that were used
  warnings: [ … ],                 // unknown parameters, clamped values
  version: '1.5.2',
}
```

Lingo and STC clusters may overlap, so a document can belong to several.
Bisecting k-means puts each document in exactly one cluster. Randomised steps
draw from a seeded generator, so the same documents with the same options
always give the same clusters.

### Search sources

- `searchSource(source, query, options)` runs a search on a source (its id,
  or a definition) and returns `{ source, name, query, total, records,
  queryTranslation, suggestion, warnings, language, requests, urls }`.
  Options: `limit`, `sort`, `filters`, `from`, `to`, `settings`, `signal`,
  `onProgress(done, total)`, `fetch`, `timeout`, `maxRetries`, and
  `requestsPerSecond` to replace the source's own limit (behind a proxy with
  limits of its own).
- `registerSource(definition)`, `unregisterSource(id)`, `getSource(id)`,
  `listSources()`, and `defineSource(definition)`, which checks a definition
  and fills in its defaults without listing it.
- `jsonSource(config)`: a source from an address template and field paths.
- `BUILTIN_SOURCES` and each source on its own: `pubmedSource`,
  `europePmcSource`, `clinicalTrialsSource`, `preprintsSource`,
  `arxivSource`, `openAlexSource`, `crossrefSource`, `doajSource`,
  `dataciteSource`, `inspireSource`, `wikipediaSource`, `arxivApiSource`,
  with the functions that read their records (`europePmcRecord`,
  `openAlexRecord`, `crossrefRecord`, `trialRecord`, …) for use elsewhere.
- Helpers for writing sources: `createRequester()` (rate limit, retries,
  timeout, cancellation), `buildUrl()`, `makeRecord()`, `markupToText()`,
  `markupToSafeHtml()`, `markupSections()` (HTML and JATS abstracts into
  labelled sections), `decodeHtmlEntities()`, `parseDisplayName()`,
  `parseInvertedName()`, `nameFromParts()`, `parseIsoDate()`, `makeDate()`,
  `normalizeDoi()`, `standardLinks()`.

A source definition holds:

| Field | Meaning |
|---|---|
| `id`, `name` | required: lower-case letters, digits and hyphens; a display name |
| `fetchPage(req, page)` or `search(req)` | required: one page of records, or the whole search |
| `shortName`, `description`, `group`, `homepage`, `docs`, `terms` | for search forms |
| `sorts`, `filters`, `settings` | `[{ id, label }]`; filters take `default`, settings a `type` (`secret`, `email`, `url`, `text`, `select`) |
| `years` | `true` when `from` and `to` mean something to it |
| `pageSize`, `maxLimit`, `defaultLimit` | the most records a request, a search, and the default |
| `rateLimit` | requests a second (or a function of the settings); `service` shares one limit between sources that call the same API |
| `examples`, `placeholder`, `syntax`, `idLabel`, `keywordsLabel` | for the search page |
| `browser` | `false` when the API refuses requests from web pages |

`req` holds `query`, `limit`, `sort`, `filters`, `from`, `to`, `settings`,
`signal`, `progress(done, total)` and `request`, whose `json(url)` and
`text(url)` share the source's rate limit and retry on HTTP 429 and 5xx.
Errors are `SourceError`s with a `kind`: `network` (unreachable, or an API
that refuses web pages), `timeout`, `rate-limit`, `http`, `parse`, `query`,
`quota` or `config`.

Every source returns the same record:

```js
{
  source, id, type,                 // type: article, review, preprint, book, thesis, report,
                                    //       dataset, software, trial, page or other
  title, titleHtml, abstract, abstractSections: [{ label, text, html }],
  authors: [{ lastName, foreName, initials, collective, orcid }], authorString,
  journal: { title, isoAbbreviation, issn, volume, issue, pages }, publisher,
  year, pubDate: { year, month, day, text },
  doi, pmid, pmcid, arxiv, url, links: [{ label, text, url }],
  keywords, mesh: [{ descriptor, major, qualifiers }], publicationTypes, tags,
  languages, openAccess, citedBy, extra,
}
```

`toDocuments(records, { includeMesh, includeKeywords })` turns records into
documents for `cluster()`, and the exports take them as they are.

### Everything else

- **Engine**: `listAlgorithms()` (names, defaults and parameter descriptors,
  enough to build a settings form), `getAlgorithm()`, `resolveParameters()`,
  `PRESETS`, `VERSION`, `createClusterer()`.
- **PubMed**: `PubMedClient`, `searchPubMed()`, `EutilsError`,
  `parsePubmedXml()`, `parseSearchXml()`, `parseSpellXml()`,
  `formatAuthors()`, `uninvertMesh()` ("Diabetes Mellitus, Type 2" becomes
  "Type 2 Diabetes Mellitus"), `parseXml()`, `pubmedTerm()`,
  `notableTypes()`.
- **Export**: `toRis(records)`, `toBibtex(records)`,
  `toCsv(records, clusters)`, `toJson(result, records)`, for records from any
  source.
- **Text**: `tokenize()`, `tokenizeToArray()`, `highlightHtml(text, labels, language)`,
  `highlightSpans()`, `escapeHtml()`, `registerLanguage()`, `getLanguage()`,
  `listLanguages()`, `isBuiltInLanguage()`, `wordStemmer()`, and the stemmers `stemEnglish`,
  `stemGerman`, `stemFrench`, `stemSpanish`, `stemItalian`, `stemPortuguese`,
  `stemDutch` and `stemRussian`.
- **Building blocks**: `preprocess()`, `lingo()`, `stc()`, `bisectingKMeans()`,
  `DenseMatrix`, `SparseMatrix`, `partialSvd()`, `factorize()`,
  `nmfEuclidean()`, `nmfKullbackLeibler()`, `localNmf()`, `sphericalKMeans()`,
  `lanczos()`, `symmetricEigen()`, `suffixArray()`, `lcpArray()`, `BitSet`,
  `createRandom()`.

### `PubMedClient`

The PubMed source is built on it; use it directly for PubMed's own options.

```js
new PubMedClient({
  apiKey, email, tool = 'broccoli',
  baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/',   // or your proxy
  requestsPerSecond,            // 3; 10 with an API key or a proxy baseUrl (the proxy enforces the limit)
  maxRetries = 4, timeout = 45000, fetch,
})
```

- `search(term, { retmax, retstart, sort, datetype, mindate, maxdate, reldate, field, useHistory, signal })`
  returns `{ count, ids, queryTranslation, translations, warnings, errors, phrasesNotFound, webEnv, queryKey }`.
- `fetchArticles(ids, { batchSize = 200, signal, onProgress })` returns
  articles in the order of `ids`.
- `spell(term)` returns NCBI's suggested spelling, or `null`.
- `searchAndFetch(term, options)` returns `{ search, articles }`.

All of these queue requests to stay within the rate limit, which is shared by
every call on the same client. They retry on HTTP 429 and 5xx with backoff,
and stop when the `AbortSignal` you pass is aborted.

An article has the record fields above (without `source` and `id`, which the
PubMed source adds) plus `articleDate`, `entryDate`, `chemicals`, `status`
and `pii`. Book chapters from PubMed have the same fields.

## Algorithms

| | Lingo | STC | Bisecting k-means |
|---|---|---|---|
| Idea | find abstract concepts first, then the phrase that names each one | group documents that share frequent phrases | split the largest cluster in two, again and again |
| Labels | one phrase per cluster, usually very descriptive | up to three phrases | the top terms of the cluster |
| Clusters | overlapping | overlapping | a partition |
| Best for | 100 to 2,000 abstracts or snippets | fast runs, phrase-heavy text | when every document must land somewhere |

- **Lingo** (Osiński, Stefanowski and Weiss, 2004) builds a term-document
  matrix (log tf-idf, with title words boosted) and factorizes it into
  concepts. The factorization is a partial SVD, as in the original algorithm,
  or one of the NMF variants (Osiński, 2006) or k-means. Each concept is
  named by the best of the documents' frequent phrases and words. A cluster
  gets every document that contains its label, and clusters that share most
  of their documents are merged.
- **STC** (Zamir and Etzioni, 1998) finds the phrases that documents share,
  using a suffix array in place of the suffix tree; the result is the same.
  Phrases become base clusters, scored by phrase length and document count,
  and base clusters that overlap strongly are merged.
- **Bisecting k-means** (Steinbach, Karypis and Kumar, 2000) runs spherical
  k-means on tf-idf vectors, optionally reduced by SVD first. For each split
  it tries several bisections and keeps the best one.

### Presets

- `default`: the algorithms' own defaults, with a generous allowance for the
  term-document matrix (2.5 million cells), since browsers handle that
  easily.
- `abstracts`: tuned for scientific abstracts, and used by the search page.
  Lingo uses NMF with fewer concepts and label generalization (below); STC
  ignores very common words and allows longer labels. The biomedical stop
  words and stop labels are on, so labels like "Control Group",
  "Patients with …" or "95% CI" are filtered out.

**Label generalization** is Broccoli's own addition to Lingo. When the phrase
chosen for a concept barely beats a shorter phrase inside it that covers at
least twice as many records, the concept takes the shorter one: "Breast
Cancer" (59 records) rather than "Breast Cancer Screening" (4). On a test set
of 422 trial abstracts it raised cluster purity from 0.82 to 0.86 and stopped
small changes to the stop lists from losing the largest topics. It is off in
the `default` preset.

### Design notes

- Text processing is Broccoli's own. The tokenizer is tuned for scientific
  text and keeps terms like `IL-6`, `COVID-19`, `CD4+`, `TNF-α` and
  `1.2–3.4` whole. The stop lists are its own too, and the stemmers were
  written from the Snowball descriptions.
- Lingo's SVD uses the Lanczos method with full reorthogonalization, which is
  exact to a relative residual of 1e-8.
- Bisecting k-means keeps the best of five trial bisections, skips splits that
  would leave a part smaller than `minClusterSize` (2 by default), and labels
  clusters with terms that are common inside the cluster and rare outside
  it.
- The clustering is lexical: topics come from shared words and phrases. There
  are no embeddings and no language model, so every label is made of words
  from the records, and synonyms that share no word stay apart.

## Languages

| Code | Language | Stemmer | Stop words |
|---|---|---|---|
| `en` | English | Porter2, Snowball 3 rules | yes, plus the `biomedical` extras |
| `de` `fr` `es` `it` `pt` `ru` | German, French, Spanish, Italian, Portuguese, Russian | Snowball | yes |
| `nl` | Dutch | Snowball, Porter's variant | yes |
| `none` | any other language that puts spaces between words | none | none |

Every stemmer was checked word for word against the Snowball reference
vocabularies (21,000 to 50,000 words each), and all of them match exactly.
Languages written without spaces, such as Chinese, Japanese and Thai, would
need a word segmenter, and Broccoli does not have one. To add a language:

```js
Broccoli.registerLanguage({
  code: 'sv', name: 'Swedish',
  stem: Broccoli.wordStemmer((w) => mySwedishStemmer(w)),
  stopwords: ['och', 'att', 'det', /* … */],
  stoplabels: ['^(?:ny|nya|olika)$'],
  labelFormat: 'sentence', otherTopics: 'Övriga ämnen',
});
```

A language you register exists only on the page that registered it, so
`createClusterer()` runs jobs in that language on the page's own thread
instead of in its worker.

## Limits and good manners

No source needs an API key or an account. Each source keeps to its API's
published limits on its own, and searches from one page share them.

- **PubMed**: NCBI asks for no more than 3 requests a second without a key,
  which Broccoli keeps to, and for a `tool` name and a contact `email`. See
  NCBI's [usage guidelines](https://www.ncbi.nlm.nih.gov/books/NBK25497/).
  A site can give every visitor NCBI's higher limit with the proxy below.
- **OpenAlex** (and the arXiv tab, which reads OpenAlex) serves numbered
  pages to everyone, which is how Broccoli asks for them, 100 works a page.
  It gives every address a daily allowance of searches without a key, about
  a hundred requests: some fifty searches of 200 works, or ten of 1,000. When
  it runs out the page says so, and it renews the next day; the other
  sources keep working.
- **Crossref** serves requests that give a contact e-mail (`mailto`) from a
  more reliable pool, and asks for one request a second from the public
  pool, which Broccoli keeps to.
- **INSPIRE** allows 15 requests in 5 seconds; Broccoli makes 2 a second.
- **DOAJ** serves the first 1,000 results of a search.
- **arXiv's API** asks for one request every three seconds and does not
  answer web pages; the `arxiv-api` source keeps to the first and needs a
  proxy (`settings.baseUrl`) for the second.

To give every visitor NCBI's higher limit, deploy `server/eutils-proxy.php`
(PHP 7.4 or newer) with your site's NCBI key in it, then set the page's
"E-utilities address" setting, or `baseUrl` in code, to
`https://your.server/eutils-proxy.php?u=`. Visitors never see or need a key.
The proxy:

- forwards only the E-utilities and databases on its allow list.
- replaces any key the browser sends with yours, and removes your key from
  NCBI's error messages.
- spaces requests from all visitors to stay within the limit. A request that
  would wait more than 10 seconds gets HTTP 429, which the client retries.
- by default serves only pages from its own site. Set
  `BROCCOLI_ALLOWED_ORIGINS` if the search page lives elsewhere.

Setup notes are at the top of the file, and
[docs/SELF-HOSTING.md](docs/SELF-HOSTING.md#the-e-utilities-proxy) walks
through it.

## Development

The project needs no Node.js or npm. Python 3 is used only for tooling.

- `python3 tools/build.py` rebuilds `dist/` from `src/`. Add `--check` to
  verify that `dist/` is current.
- `python3 tools/serve.py` serves the folder on http://localhost:8000/.
- `python3 tools/run_tests.py --system` runs the tests in the browser you
  already have and prints the results in the terminal. It needs nothing but
  Python. You can also open http://localhost:8000/tests/ (for `src/`) and
  `tests/dist.html` (for the single-file build) yourself.
- For headless runs, as in CI, `python3 tools/run_tests.py` uses Playwright
  for Python if it is installed. Playwright starts a driver of its own, which
  bundles a Node.js runtime; nothing comes from npm. To install it:

  ```
  python3 -m venv .venv && . .venv/bin/activate
  pip install playwright && python -m playwright install chromium
  ```
- The tests use a fake `fetch` and hand-written answers in each API's format,
  so they never touch the network.
- GitHub Actions runs the build check and the tests on every push
  (`.github/workflows/tests.yml`).

The page itself is `app/app.js` (sources, search, topic tree, panels),
`app/views.js` (the canvas maps: the organic treemap, circle packing, the
radial partition, morphing and smooth zoom), `app/florets.js` (the florets
map, SVG) and `app/colors.js` (the palette).

Code layout of the library: `src/text` (tokenizer, stemmers, stop lists,
highlighting), `src/preprocessing` (words, stems, phrases, label
candidates), `src/matrix` (dense and sparse matrices, eigensolver, SVD, NMF,
k-means), `src/algorithms`, `src/engine` (parameters, presets, worker),
`src/sources` (the source interface, requests, records, markup and the
built-in sources) and `src/pubmed` (E-utilities client, XML parser, PubMed
records, exports).

[CONTRIBUTING.md](CONTRIBUTING.md) describes how to propose a change, add a
source or a language, and what the tests expect.

## Browser support

Current Chrome, Edge, Firefox and Safari: anything from 2020 on with ES2019,
Unicode regular expressions and the canvas. The test suite and the page were
run in Chromium, at phone, tablet and desktop sizes from 320 pixels wide.

## Privacy

Clustering happens on your own device. The search page in this repository
sends nothing anywhere except your queries, which go to the source you
search (or to your proxy, if you set one). It has no analytics and sets no
cookies. Settings are kept in this browser's local storage, and each goes
only to the service it belongs to.

A site that hosts the page may add services of its own. On genesisl1.com,
for example, Google Analytics runs on every page once a visitor accepts the
site's cookie notice, as its [privacy policy](https://genesisl1.com/privacy.html)
describes; the searches themselves still go from the browser straight to the
source.

## License

MIT, © 2026 Decentralized Science Labs LLC. See [LICENSE](LICENSE), and
[NOTICE.md](NOTICE.md) for credits to the papers the algorithms come from,
JAMA, Snowball, the fonts and the data sources.

Broccoli is part of the GenesisL1 ecosystem. "GenesisL1", "GL1X" and
"Broccoli" name projects of that ecosystem; the license covers the code and
grants no rights to names or marks.
