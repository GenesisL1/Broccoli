<!-- SPDX-License-Identifier: MIT · Copyright (c) 2026 Decentralized Science Labs LLC -->
# Broccoli documentation

Broccoli is a GenesisL1 in-house open-source search results clustering
engine: it groups the records a search returns into labelled topics in the
browser, and draws them as zoomable maps. These pages document version
1.5.1. The [README](../README.md) introduces Broccoli and is the reference
for its API.

## By what you want to do

| I want to… | Read |
|---|---|
| search and read results as a map | [The search page](SEARCH-PAGE.md) |
| know what each source searches, and its syntax and limits | [Search sources](SOURCES.md) |
| link to a search, or show the search page on my site | [Embedding](EMBEDDING.md) |
| publish the search page on my own server | [Self-hosting](SELF-HOSTING.md) |
| cluster my own records, or search from code | the [README](../README.md#using-the-library), then [Embedding](EMBEDDING.md#the-library-on-your-page) |
| add a search engine of my own | [Writing a source](SOURCES.md#writing-a-source) |
| draw the maps on my own page | [The maps on your page](EMBEDDING.md#the-maps-on-your-page) and [`examples/map.html`](../examples/map.html) |
| understand how topics are found, named and drawn | [How it works](GUIDE.md) |
| tune the algorithms | [Parameters](PARAMETERS.md) |
| know how Broccoli fits into GenesisL1 | [Broccoli and GenesisL1](GENESISL1.md) |
| find a quick answer | [Questions](FAQ.md) |
| work on Broccoli | [Contributing](../CONTRIBUTING.md) |
| report a vulnerability | [Security](../SECURITY.md) |

## All pages

- [SEARCH-PAGE.md](SEARCH-PAGE.md): the search page. Sources and query
  syntax, records, order and algorithm, the four maps, zooming, topics and
  records, exports, settings, links that open a search, keyboard and
  accessibility, troubleshooting.
- [SOURCES.md](SOURCES.md): the twelve built-in sources (what each searches,
  its API, query syntax, sorts, filters, years, settings, paging, limits and
  records), how every source works (rate limits, retries, errors), and how to
  write your own, with or without code.
- [GUIDE.md](GUIDE.md): how Broccoli reads text, how Lingo, STC and bisecting
  k-means find and name topics, how the maps are laid out and coloured, how
  the search page puts the parts together, and where the limits lie.
- [PARAMETERS.md](PARAMETERS.md): every algorithm parameter, with its
  default, range and meaning, and the presets.
- [EMBEDDING.md](EMBEDDING.md): links that open a search, the search page in
  a frame (size, theme, permissions), the library from a CDN, and the maps on
  your own page.
- [SELF-HOSTING.md](SELF-HOSTING.md): what to publish, static hosts, an
  nginx configuration, caching, a Content Security Policy, the E-utilities
  proxy, a proxy for arXiv's API, versions.
- [GENESISL1.md](GENESISL1.md): GenesisL1, where Broccoli fits and runs in
  its ecosystem (genesisl1.com, GL1X and its PubMed search, AI agents), and
  the principles they share.
- [FAQ.md](FAQ.md): short answers to what people ask first.

In the repository: [CHANGELOG.md](../CHANGELOG.md) (what changed in each
version), [NOTICE.md](../NOTICE.md) (the papers, data sources and fonts
Broccoli credits), [CITATION.cff](../CITATION.cff) (how to cite it),
[CONTRIBUTING.md](../CONTRIBUTING.md) and [SECURITY.md](../SECURITY.md), and
the example pages in [`examples/`](../examples/): your own documents
(`basic.html`), any source (`sources.html`), the PubMed client
(`pubmed-api.html`), ES modules (`esm.html`) and the maps (`map.html`).
