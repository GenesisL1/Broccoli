<!-- SPDX-License-Identifier: MIT · Copyright (c) 2026 Decentralized Science Labs LLC -->
# Search sources

A **source** is how Broccoli, GenesisL1's search results clustering engine,
reaches a search engine. It describes itself (name, sorts, filters,
settings, example queries) and fetches records from one API, turning each
answer into the record shape every part of Broccoli shares: the clustering,
the maps, the record list and the exports.

Broccoli comes with twelve sources. Eleven answer requests from web pages
and have a tab on the search page; the twelfth, arXiv's own API, is for
servers and proxies. **No built-in source needs an API key or an account.**

This page describes how every source behaves, then each source in turn,
then how to write your own.

- [At a glance](#at-a-glance)
- [How every source works](#how-every-source-works)
- [PubMed](#pubmed-pubmed) ·
  [Europe PMC](#europe-pmc-europepmc) ·
  [ClinicalTrials.gov](#clinicaltrialsgov-clinicaltrials) ·
  [Preprints](#preprints-preprints) ·
  [arXiv](#arxiv-arxiv) ·
  [OpenAlex](#openalex-openalex) ·
  [Crossref](#crossref-crossref) ·
  [DOAJ](#doaj-doaj) ·
  [DataCite](#datacite-datacite) ·
  [INSPIRE-HEP](#inspire-hep-inspire) ·
  [Wikipedia](#wikipedia-wikipedia) ·
  [arXiv API](#arxiv-api-arxiv-api)
- [Writing a source](#writing-a-source)

## At a glance

| Source (`id`) | Tab | Records a search | Page | Paging | Requests a second | Sorts |
|---|---|---|---|---|---|---|
| PubMed (`pubmed`) | PubMed | 200, up to 10,000 | 200 | ESearch for the IDs, then EFetch | 3 | best match, most recent |
| Europe PMC (`europepmc`) | Europe PMC | 200, up to 2,000 | 250 | cursor (`cursorMark`) | 5, shared with Preprints | best match, most recent, most cited |
| ClinicalTrials.gov (`clinicaltrials`) | Trials | 200, up to 2,000 | 200 | page token | 3 | best match, latest start |
| Preprints (`preprints`) | Preprints | 200, up to 2,000 | 250 | cursor (`cursorMark`) | 5, shared with Europe PMC | best match, most recent |
| arXiv (`arxiv`) | arXiv | 200, up to 1,000 | 100 | page number | 5, shared with OpenAlex | best match, most recent, most cited |
| OpenAlex (`openalex`) | OpenAlex | 200, up to 1,000 | 100 | page number | 5, shared with arXiv | best match, most recent, most cited |
| Crossref (`crossref`) | Crossref | 200, up to 2,000 | 200 | cursor | 1 | best match, most recent, most cited |
| DOAJ (`doaj`) | DOAJ | 200, up to 1,000 | 100 | page number | 2 | best match, recently added |
| DataCite (`datacite`) | DataCite | 200, up to 2,000 | 200 | page number | 5 | best match, most recent, most cited |
| INSPIRE-HEP (`inspire`) | INSPIRE | 200, up to 2,000 | 200 | page number | 2 | best match, most recent, most cited |
| Wikipedia (`wikipedia`) | Wikipedia | 200, up to 2,000 | 500 | offset | 5 | best match |
| arXiv API (`arxiv-api`) | none | 200, up to 2,000 | 200 | offset | one every 3 seconds | best match, most recent |

"Records a search" is the default and the most one search can ask for. The
search page offers 100 to 2,000 records, up to the source's most. In code
the sort ids are `relevance`, `date` and `cited`, and `added` for DOAJ's
"Recently added".

Every source except Wikipedia takes a range of years. The search page shows
a source's filters under Settings, Search filters, with its defaults; most
sources ask for records with an abstract by default, because a record
without one has only its title to be clustered on.

## How every source works

`searchSource(source, query, options)` runs a search on any source:

1. It checks the query and options against the source: the limit is capped
   at the source's most, an unknown sort becomes the source's first, every
   filter gets its value or its default, and years outside 1000 to 3000 are
   ignored.
2. It asks the source for pages (`fetchPage`) until it has the records it
   wants, or lets the source run the whole search (`search`).
3. It completes each record (`makeRecord`), drops duplicates by id, and
   returns `{ source, name, query, total, records, queryTranslation,
   suggestion, warnings, phrasesNotFound, language, requests, urls }`.

Requests go through a requester made for the search:

- **Rate limits.** Each source has one queue, shared by every search on the
  page, that spaces requests to the source's `rateLimit`. Sources that call
  the same API share one queue (`service`): Europe PMC and Preprints, OpenAlex
  and arXiv. Two tabs never add up to more than the API allows.
- **Simple requests.** Only CORS "simple" requests are made (GET, or for
  PubMed's EFetch a POST with a form body, and no custom headers), so a
  browser sends them straight to the API without a preflight.
- **Retries.** HTTP 429 and 5xx answers are retried up to three times, after
  0.7, 1.4 and 2.8 seconds, or after the server's `Retry-After` (at most 30
  seconds). A network failure or a timeout is tried once more.
- **Timeouts.** A request that has not finished within 30 seconds, body
  included, is a timeout (45 seconds for PubMed's client).
- **Cancellation.** An `AbortSignal` (`options.signal`) stops a search
  between requests and inside one.

Records arrive clean. Titles and abstracts from HTML or JATS are read into
plain text and safe HTML that can hold nothing but `<i>`, `<b>`, `<u>`,
`<sup>` and `<sub>`; links are kept only if they are `http` or `https`.

Errors are `SourceError`s with a `kind`:

| `kind` | Meaning | What the search page says |
|---|---|---|
| `network` | the API could not be reached, or it refuses requests from web pages | "Could not reach …"; for PubMed it suggests a proxy |
| `timeout` | no complete answer in 30 seconds | "… did not answer in time" |
| `rate-limit` | HTTP 429 after the retries | wait a minute; for OpenAlex and arXiv, the daily allowance is spent |
| `http` | any other error status (`status` has it) | the status, with the API's own message for HTTP 400 |
| `parse` | an answer that could not be read | the message |
| `query` | the API rejected the query | the API's message and the source's syntax |
| `quota`, `config` | an allowance used up; a bad definition or setting | the message |

## PubMed (`pubmed`)

Biomedical and life-science literature: MEDLINE, PubMed Central and NCBI
Bookshelf, through [NCBI E-utilities](https://www.ncbi.nlm.nih.gov/books/NBK25501/)
at `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`.

- **How it searches.** ESearch finds the PMIDs, as many as the limit and at
  most 10,000 (NCBI's ceiling), then EFetch reads the records as XML in
  batches of 200, sent by POST. When ESearch finds nothing, ESpell suggests
  a spelling, which the search page offers.
- **Query.** PubMed's own syntax: field tags such as `[ti]`, `[tiab]`, `[au]`,
  `[mh]` and `[pt]`, `AND`, `OR`, `NOT`, quoted phrases and parentheses.
  PubMed's automatic term mapping applies; its translation of the query is
  returned as `queryTranslation`, and the search page shows it under About
  this result. Examples: `senolytics healthy aging`,
  `longevity[tiab] AND (aging[tiab] OR ageing[tiab])`.
- **Sorts.** `relevance` is PubMed's Best Match; `date` sorts by publication
  date, newest first.
- **Filters**, added to the query with `AND`: Only records with an abstract
  (`hasabstract`, on by default), English only (`english[lang]`), Humans only
  (`humans[mh]`), Free full text only (`free full text[sb]`), Reviews only
  (`review[pt]`), Clinical trials only (`clinical trial[pt]`).
- **Years.** `mindate` and `maxdate` on the publication date.
- **Settings.** `email`, a contact e-mail sent with each request as NCBI
  asks; `baseUrl`, the E-utilities address, to use a proxy such as
  [`server/eutils-proxy.php`](SELF-HOSTING.md#the-e-utilities-proxy). The
  `tool` name is `broccoli`.
- **Limits.** Three requests a second, NCBI's rule for callers without a key.
  Through a proxy the client allows ten and the proxy keeps its own pace. In
  code, `settings.apiKey` takes an NCBI key for ten a second; the search page
  never asks for one.
- **Records.** Full PubMed articles: structured abstracts in labelled
  sections, authors with ORCID iDs, journal, volume, issue and pages, MeSH
  headings with their major topics and qualifiers, keywords, publication
  types, chemicals, and the PMID, PMCID and DOI, with links to PubMed, PMC and
  doi.org. Book chapters from NCBI Bookshelf have the same fields. Tags show
  notable publication types: retractions, preprints, systematic reviews,
  meta-analyses, reviews, randomised trials, clinical trials, case reports,
  guidelines, editorials and comments.

`PubMedClient`, which this source is built on, offers PubMed's own options
(history server, date types, relative dates): see the README.

## Europe PMC (`europepmc`)

Life-science literature from PubMed, PubMed Central, Agricola, patents,
theses and NCBI Bookshelf, plus preprints, through the
[Europe PMC REST API](https://europepmc.org/RestfulWebService) at
`https://www.ebi.ac.uk/europepmc/webservices/rest/search` (`resultType=core`).

- **Query.** Europe PMC's syntax: fields such as `TITLE:`, `ABSTRACT:` and
  `AUTH:`, `AND`, `OR`, `NOT` and quoted phrases. Synonyms are on
  (`synonym=true`), so Europe PMC also matches synonyms of the query's words.
- **Sorts.** `relevance`; `date` (`P_PDATE_D desc`); `cited` (`CITED desc`).
- **Filters**, as clauses: Only records with an abstract (`HAS_ABSTRACT:Y`,
  on by default), Open access only (`OPEN_ACCESS:Y`), Leave out preprints
  (`NOT SRC:PPR`), Reviews only (`PUB_TYPE:"review"`).
- **Years.** `PUB_YEAR:[from TO to]`.
- **Paging.** `cursorMark`, 250 records a page.
- **Limits.** Five requests a second, shared with Preprints.
- **Records.** Abstracts read from Europe PMC's HTML into labelled sections,
  authors with ORCID iDs, journal details, MeSH headings, keywords,
  publication types, citation counts (`citedBy`), the open access flag, and
  links to Europe PMC, PubMed, PMC and the DOI. A record's id is its Europe
  PMC source and id, such as `MED:38012345` or `PPR:PPR812345`. Preprints are
  tagged with their version.

## ClinicalTrials.gov (`clinicaltrials`)

Clinical studies registered at ClinicalTrials.gov, from around the world,
through its [API v2](https://clinicaltrials.gov/data-api/api) at
`https://clinicaltrials.gov/api/v2/studies`. Broccoli asks only for the
fields it shows.

- **Query.** ClinicalTrials.gov's Essie syntax: `AND`, `OR`, `NOT`, quoted
  phrases and `AREA[Field]` expressions.
- **Sorts.** `relevance`; `date`, shown as Latest start (`StartDate:desc`).
- **Filters.** Interventional studies only (`AREA[StudyType]INTERVENTIONAL`,
  which leaves out observational studies and registries), Recruiting or soon
  recruiting (overall status `RECRUITING` or `NOT_YET_RECRUITING`), Only
  studies with posted results.
- **Years.** The study's start date, from 1 January of the first year to 31
  December of the last.
- **Paging.** A page token, 200 studies a page; the total is counted on the
  first page.
- **Limits.** Three requests a second.
- **Records.** Type `trial`. The brief title is the title and the brief
  summary the abstract; the lead sponsor stands in for the journal, and the
  start date for the publication date ("Started March 2024"). Conditions,
  keywords and interventions are the subject terms. Tags give the phase,
  the overall status, a study type other than interventional, and "Has
  results". `extra` holds the official title, acronym, status, phases, study
  type, enrolment, conditions, interventions, sponsor, start and completion
  dates.

## Preprints (`preprints`)

Preprints from bioRxiv, medRxiv, Research Square, SSRN, Preprints.org and
other servers, as indexed by Europe PMC: the Europe PMC source limited to
preprints (`SRC:PPR`).

- **Query, years, paging.** As for Europe PMC.
- **Sorts.** `relevance`; `date`.
- **Filters.** Only preprints with an abstract (on by default).
- **Limits.** Five requests a second, shared with Europe PMC.
- **Records.** The preprint server stands in for the journal, and each record
  is tagged Preprint, with its version.

## arXiv (`arxiv`)

Preprints in physics, mathematics, computer science, quantitative biology
and finance, statistics, electrical engineering and economics. arXiv's own
API does not send the headers a web page needs to read it, so this tab reads
arXiv's papers from the [OpenAlex](https://openalex.org/) index
(`https://api.openalex.org/works` with `filter=indexed_in:arxiv`).

- **Query.** OpenAlex's search: words are matched in titles, abstracts and
  full texts, with stemming; `AND`, `OR`, `NOT` and quoted phrases work.
- **Sorts.** `relevance`; `date` (`publication_date:desc`); `cited`
  (`cited_by_count:desc`).
- **Filters.** Only papers with an abstract (`has_abstract:true`, on by
  default).
- **Years.** `from_publication_date` (1 January) and `to_publication_date`
  (31 December).
- **Paging.** Numbered pages (`page=1`, `2`, `3`…) of 100 papers
  (`per-page`, OpenAlex's most). OpenAlex serves numbered pages to everyone,
  up to 10,000 results a search; a cursor would need an API key past its
  first page, so Broccoli does not use one.
- **Limits.** Up to 1,000 papers a search, five requests a second, and the
  daily allowance OpenAlex gives every address, all shared with the OpenAlex
  tab (see below).
- **Records.** The arXiv ID, taken from the arXiv DOI (`10.48550/arXiv.…`) or
  an arxiv.org address, and arXiv links first; the abstract, rebuilt from
  OpenAlex's inverted index; authors with ORCID iDs; the journal once a paper
  is published; citation counts; MeSH headings where OpenAlex has them;
  keywords. A record's id is its OpenAlex work id (`W…`).

## OpenAlex (`openalex`)

An [open index](https://openalex.org/) of scholarly works in every field,
from journals, repositories, preprint servers and conferences, at
`https://api.openalex.org/works`. Broccoli asks only for the fields it uses.

- **Query, sorts, years, paging.** As for arXiv above.
- **Filters.** Only works with an abstract (`has_abstract:true`, on by
  default), Open access only (`is_oa:true`), Articles only (`type:article`,
  which leaves out preprints, books, datasets and the rest).
- **The daily allowance.** OpenAlex gives every address a daily allowance
  for use without a key. At the time of writing it is worth $0.10 a day, and
  a search request costs $0.001, so about a hundred requests: some fifty
  searches of 200 works, or ten of 1,000. The arXiv tab draws on the same
  allowance. When it is spent, OpenAlex answers HTTP 429 and the search page
  says so; the allowance renews the next day, and the other sources keep
  working. In code, a developer with heavy use can pass a free OpenAlex key as
  `settings.apiKey`; see OpenAlex's
  [authentication page](https://help.openalex.org/api/authentication/).
- **Limits.** Up to 1,000 works a search and five requests a second (OpenAlex
  allows a hundred).
- **Records.** Work types (article, review, preprint, book, dataset, thesis,
  report, software), the venue with volume, issue and pages, the PMID, PMCID,
  arXiv ID and DOI, a free full text link where there is one, the open access
  flag, citation counts, MeSH headings for works in PubMed, keywords, the
  language and a retraction tag.

## Crossref (`crossref`)

Metadata of works with Crossref DOIs from publishers in every field:
articles, books, proceedings, preprints and reports, through the
[Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)
at `https://api.crossref.org/works`. Broccoli asks only for the fields it
uses, and asks again for whole records should Crossref ever refuse one of
them.

- **Query.** Free text. Crossref ranks every work whose metadata matches any
  of the words, best first, so the total counts loose matches too; the search
  page calls them "records ranked" rather than matched.
- **Sorts.** `relevance`; `date` (`sort=published`); `cited`
  (`sort=is-referenced-by-count`), newest or most cited first.
- **Filters.** Only works with an abstract (`has-abstract:true`, on by
  default: many Crossref records have none), Journal articles only
  (`type:journal-article`).
- **Years.** `from-pub-date` and `until-pub-date`.
- **Settings.** `email`: Crossref serves requests that give a contact e-mail
  (`mailto`) from its more reliable "polite" pool.
- **Paging.** Crossref's deep-paging cursor, 200 works a page.
- **Limits.** One request a second, as Crossref asks of its public pool.
- **Records.** JATS abstracts read into labelled sections, authors with ORCID
  iDs, the journal and its short title, volume, issue, pages and publisher,
  tags for preprints, conference papers, book chapters and other types,
  Crossref's subjects as subject terms, and citation counts. A record's id is
  its DOI, in lower case.

## DOAJ (`doaj`)

Articles from the vetted open access journals of the
[Directory of Open Access Journals](https://doaj.org/), in every field and
many languages, through its [search API](https://doaj.org/api/docs) at
`https://doaj.org/api/search/articles/` (the query goes in the address).

- **Query.** Elasticsearch syntax: fields such as `title:` and `abstract:`,
  and `AND`, `OR`, `NOT`. DOAJ refuses wildcards and fuzzy matching, so
  Broccoli keeps `?`, `*` and `~` as plain characters, and reads a colon
  followed by a space ("COVID-19: outcomes") as punctuation, not a field.
- **Sorts.** `relevance`; `added`, shown as Recently added
  (`created_date:desc`).
- **Filters.** Only articles with an abstract (on by default).
- **Years.** `bibjson.year:[from TO to]`.
- **Paging.** Page number, 100 articles a page. DOAJ serves the first 1,000
  results of a search.
- **Limits.** Two requests a second.
- **Records.** Articles, all open access: the journal, volume, issue, pages
  and publisher, keywords, languages, the DOI and a link to the full text.

## DataCite (`datacite`)

Research datasets, software and other outputs with DataCite DOIs, from
Zenodo, Dryad, Figshare, institutional repositories and data centres,
through the [DataCite REST API](https://support.datacite.org/docs/api) at
`https://api.datacite.org/dois`.

- **Query.** Elasticsearch syntax: fields such as `titles.title:` and
  `creators.name:`, and `AND`, `OR`, `NOT`. All the words of a plain query
  are required.
- **Sorts.** `relevance`; `date` (`-published`); `cited` (`-citation-count`).
- **Filters.** Datasets and Software (both on by default), and Every other
  kind of output too (text, images, models, workflows and the rest), which
  asks for every resource type.
- **Years.** `publicationYear:[from TO to]`.
- **Paging.** Page number, 200 outputs a page.
- **Limits.** Five requests a second.
- **Records.** The resource type (dataset, software, article, preprint, book,
  thesis, report or other) with a tag naming it and the version, creators
  with ORCID iDs (people or organisations), the repository or publisher in
  place of a journal, subjects as subject terms (Fields of Science without
  their `FOS:` prefix), citation counts and the language.

## INSPIRE-HEP (`inspire`)

The literature of high-energy physics, astrophysics, cosmology, gravitation
and nuclear physics, through [INSPIRE's API](https://github.com/inspirehep/rest-api-doc)
at `https://inspirehep.net/api/literature`.

- **Query.** Free text, or INSPIRE's own syntax, such as `t` for title, `a`
  for author, and `and`, `or`, `not`.
- **Sorts.** `relevance`; `date` (`mostrecent`); `cited` (`mostcited`).
- **Years.** Added to the query as a date range.
- **Paging.** Page number, 200 records a page.
- **Limits.** INSPIRE allows 15 requests in 5 seconds; Broccoli makes 2 a
  second.
- **Records.** Collaborations as collective authors ("ATLAS Collaboration")
  followed by the first 25 people, the arXiv ID with its primary category as
  a tag, the DOI, the journal reference, the document type, citation counts,
  and keywords (without the PACS, PDG and JACoW codes). A paper with an arXiv
  e-print and no journal yet is a preprint. `extra` holds the number of
  authors and the arXiv categories.

## Wikipedia (`wikipedia`)

A general search of [Wikipedia](https://www.wikipedia.org/) in English,
German, French, Spanish, Italian, Portuguese, Dutch or Russian, through the
[MediaWiki action API](https://www.mediawiki.org/wiki/API:Search) of the
edition (`https://{lang}.wikipedia.org/w/api.php`).

- **Query.** Wikipedia's search syntax: quoted phrases, `-excluded` words,
  `intitle:` and the rest of CirrusSearch.
- **Sorts.** `relevance` only. No years.
- **Settings.** `lang`, the edition (`en`, `de`, `fr`, `es`, `it`, `pt`, `nl`
  or `ru`). The topics are labelled in the same language, because the search
  returns its `language` and the search page clusters with it.
- **Paging.** Offset, 500 results a page.
- **Limits.** Five requests a second.
- **Records.** Type `page`: the page title, the text around the matches as
  the abstract, the page's length as a tag ("4,210 words") and a link to the
  page. `extra` holds the word count and the time of the last edit.
  Wikipedia's spelling suggestion, when it has one, comes back as
  `suggestion`; the search page offers it when nothing matches.

## arXiv API (`arxiv-api`)

[arXiv's own API](https://info.arxiv.org/help/api/user-manual.html) at
`https://export.arxiv.org/api/query`, which answers with Atom feeds. It does
not accept requests from web pages, so the source is registered with
`browser: false` and has no tab. It works as is from a server, a worker
runtime, a browser extension or the command line, and in a web page through
a proxy that passes requests on to arXiv (`settings.baseUrl`).

- **Query.** arXiv's syntax: `ti:`, `au:`, `abs:`, `cat:`, `AND`, `OR` and
  `ANDNOT`. In a plain query every word, or quoted phrase, is required.
- **Sorts.** `relevance`; `date` (submitted date, newest first).
- **Years.** `submittedDate`, from the start of the first year to the end of
  the last.
- **Paging.** Offset (`start`), 200 papers a page.
- **Limits.** One request every three seconds, as arXiv's terms of use ask.
- **Records.** The arXiv ID without its version, the version, the primary
  category as a tag, all categories, the journal reference in place of a
  journal, the DOI, links to the abstract page and the PDF, and the author's
  comment.

```js
const res = await Broccoli.searchSource('arxiv-api', 'ti:transformer AND cat:cs.CL', {
  limit: 400, sort: 'date',
  settings: { baseUrl: 'https://your.server/arxiv-proxy?' },   // in a web page only
});
```

## Writing a source

A source of your own is an object with an id, a name and a function that
fetches records. Register it and `searchSource()` can run it; register it
before `app/app.js` loads and it gets a tab on the search page.

### The definition

| Field | Meaning |
|---|---|
| `id` | required: up to 40 lower-case letters, digits and hyphens |
| `name`, `shortName` | the display name, and a shorter one for the tab |
| `fetchPage(req, page)` or `search(req)` | required: one page of records, or the whole search |
| `description`, `homepage`, `docs`, `terms` | shown on the search page's source card |
| `group` | sources of one group sit together among the tabs (`'Biomedicine'`, `'All fields'`…) |
| `kinds` | the record types it returns: `article`, `review`, `preprint`, `book`, `thesis`, `report`, `dataset`, `software`, `trial`, `page`, `other` |
| `sorts` | `[{ id, label }]`; the first is the default; `relevance` first by convention |
| `filters` | `[{ id, label, help, default }]`: switches the page shows under Search filters |
| `settings` | `[{ id, label, type, help, placeholder, options, default }]`, `type` one of `text`, `email`, `url`, `secret`, `select` |
| `years` | `true` when `from` and `to` mean something to it |
| `pageSize` | the most records one request returns (default 100) |
| `maxLimit`, `defaultLimit` | the most records a search, and the default (1,000 and 200 unless set) |
| `rateLimit` | requests a second (default 3), or a function of the settings |
| `service` | sources with the same `service` share one rate limit |
| `examples` | `[['query', weight], …]`: example searches for the search page's landing map, each a floret sized by its weight |
| `placeholder`, `syntax` | the search box's example, and a one-line note on the query syntax |
| `idLabel`, `keywordsLabel` | what to call its identifiers ("PMID", "DOI") and its subject terms |
| `matchesAnyWord` | `true` if the API ranks records that match any word (the page then says "records ranked") |
| `browser` | `false` if the API refuses requests from web pages: the search page leaves it out |

`defineSource(definition)` checks a definition and fills in the defaults
without listing it; `registerSource(definition)` does the same and lists
it, replacing a source with the same id.

### Fetching pages

```js
Broccoli.registerSource({
  id: 'my-index',
  name: 'My index',
  pageSize: 100,
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'date', label: 'Newest' }],
  filters: [{ id: 'reviewed', label: 'Reviewed only', default: false }],
  years: true,
  async fetchPage(req, page) {
    const url = Broccoli.buildUrl('https://search.example.org/api', {
      q: req.query,
      size: page.size,
      from: page.offset,                          // or page: page.page, or cursor: page.cursor
      sort: req.sort === 'date' ? 'newest' : undefined,
      reviewed: req.filters.reviewed ? 1 : undefined,
      year_from: req.from || undefined, year_to: req.to || undefined,
    });
    const json = await req.request.json(url, { signal: req.signal });
    return { total: json.total, records: json.items.map(toRecord) };
  },
});
```

`page` is `{ page, size, offset, cursor }`: the page number from 1, the
number of records to ask for (the source's `pageSize`, or the limit if that
is smaller), the number of records received so far, and the cursor the
previous page returned (`null` on the first page). Use whichever the API
pages by:

- **By offset**: send `page.offset` and `page.size`.
- **By page number**: send `page.page` and `page.size`.
- **By cursor**: send `page.cursor` (or the API's first-page value when it is
  `null`) and return the next one as `cursor`, or `cursor: null` when there
  are no more pages.

Broccoli asks for the next page until it has `limit` records, and stops
early when a page comes back empty, when the source returns `cursor: null`,
when it has as many records as the `total` the first page reported, or, for
a source that returns no cursor, when a page is shorter than `size`. It asks
for 500 pages at most. `buildUrl()` leaves out parameters that are
`undefined`, `null` or empty, and joins arrays with commas.

### Whole searches

An API that needs several steps implements `search(req)` instead and returns
`{ records, total }` with any of `queryTranslation`, `suggestion`, `warnings`,
`phrasesNotFound`, `language`, `requests` and `urls`. The PubMed source does
this: ESearch for the IDs, then EFetch for the records. Call
`req.progress(done, total)` as records arrive, so the page can show
progress.

### The request

`req` holds `source` (the definition), `query`, `limit`, `sort` (a sort id),
`filters` (`{ id: true|false }` for every filter), `from` and `to` (years, or
`null`), `settings` (the values for the source's settings), `signal`,
`progress(done, total)`, `fetch`, and `request`. `request.json(url, init)`
and `request.text(url, init)` keep to the source's rate limit, retry HTTP
429 and 5xx, time out, follow the signal and throw `SourceError`s; `init`
can carry `method`, `body` and `headers` (headers make a browser send a
preflight first).

### Records

Return records with whatever the API gives; `makeRecord()` fills in the
rest. The fields are listed in the README under
[Search sources](../README.md#search-sources). The ones that matter most:

- `id`: unique within the source; Broccoli drops later records with the same
  id. Without one it uses the PMID, DOI, address or title.
- `title` and `abstract` (or `abstractSections: [{ label, text, html }]`):
  what is clustered. Records without an abstract are clustered on their
  title alone.
- `type`: one of the kinds above (`article` if missing, `other` if unknown).
- `authors`: `['Ada Lovelace', …]`, or objects `{ lastName, foreName,
  initials, collective, orcid }`. `parseDisplayName()`,
  `parseInvertedName()` and `nameFromParts()` read the usual forms.
- `journal: { title, volume, issue, pages }`, `publisher`, `year` or
  `pubDate` (`makeDate()`, `parseIsoDate()`).
- `doi`, `pmid`, `pmcid`, `arxiv`: identifiers; without `links`, Broccoli
  links them to doi.org, PubMed, PMC and arXiv.
- `url`: the record's page at the source (only `http` and `https` are kept).
- `keywords` and `mesh`: subject terms, clustered when the reader turns them
  on.
- `tags`: short flags shown with the record ("Preprint", "Phase 2",
  "Retracted Publication"); `citedBy`, `openAccess`, `languages`; `extra` for
  anything else.

For HTML or JATS abstracts, `markupSections()` gives labelled sections,
`markupToText()` plain text and `markupToSafeHtml()` HTML with only
inline formatting.

### Errors

Errors from `req.request` are already `SourceError`s. Throw your own with a
kind when the API says something specific, so the search page can explain
it:

```js
if (json.error) {
  throw new Broccoli.SourceError('My index could not read the query: ' + json.error, { source: 'my-index', kind: 'query' });
}
```

### Settings and keys

The search page shows a field for each setting under Settings, Access (a
`select` goes under Search filters), keeps the value in the reader's
browser, and passes it in `req.settings`, to your source only. Use settings for a contact e-mail, a proxy address or a
language. A setting of type `secret` is shown as a password field; keep in
mind that anything a browser sends can be read by the person using it, so a
key that must stay private belongs on a server, not in a setting.

A rate limit can depend on the settings: `rateLimit: (s) => (s.apiKey ? 10 : 3)`.

### An API that needs a secret key

Put a small proxy of your own in front of it, on a server you control, and
point the source at the proxy. The proxy should:

- forward to one fixed upstream address, never one taken from the request;
- pass on only the parameters the source sends, from an allow list;
- add the key on the server, and remove it from error messages;
- answer only your own site's pages (check the `Origin` header), and send
  CORS headers for them;
- keep to the upstream's rate limit for all your visitors together.

[`server/eutils-proxy.php`](../server/eutils-proxy.php), the proxy for NCBI
E-utilities, does all of this and is a good model.

### Without code: `jsonSource`

For a JSON API with nothing unusual about it, `jsonSource` writes
`fetchPage` from an address template and field paths:

```js
Broccoli.registerSource(Broccoli.jsonSource({
  id: 'my-index', name: 'My index', pageSize: 50,
  url: 'https://search.example.org/api?q={query}&size={size}&from={offset}&sort={sort}',
  results: 'hits.items',             // where the list of results is (dotted path)
  total: 'hits.total',               // optional
  next: 'hits.next_cursor',          // optional: a cursor, sent back as {cursor}
  fields: {                          // record field: path in each result
    id: 'id', title: 'title', abstract: 'summary', url: 'link', year: 'year',
    authors: 'authors', doi: 'doi', venue: 'journal', keywords: 'tags',
  },
}));
```

The placeholders are `{query}`, `{size}`, `{offset}`, `{page}`, `{cursor}`,
`{sort}`, `{from}`, `{to}` and `{settings.name}`; every value is URL-encoded,
and a missing one becomes empty. Paths are dotted (`hits.items.0.title`) or
functions of the JSON. `url` can also be a function `(req, page) → address`,
`map(item)` can replace `fields` for full control over each record, and
`firstCursor` sets the cursor of the first page.

### Testing a source

The test suite never touches the network. Give `searchSource()` a fake
`fetch` that answers with a saved copy of the API's answer, and a high
`requestsPerSecond` so the test does not wait:

```js
const fake = async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify(SAVED_ANSWER), headers: { get: () => null } });
const res = await Broccoli.searchSource('my-index', 'test', { limit: 20, fetch: fake, requestsPerSecond: 1000 });
```

`tests/test-sources.js` has a test like this for every built-in source, with
the answers in `tests/fixtures/`. [CONTRIBUTING.md](../CONTRIBUTING.md)
describes how to run the tests and what a new built-in source needs.
