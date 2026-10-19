/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Crossref: the metadata of works with Crossref DOIs (journal articles,
 * books, proceedings, posted preprints, reports), from every publisher,
 * through the Crossref REST API. Abstracts arrive as JATS XML.
 * https://api.crossref.org/swagger-ui/index.html
 *
 * Crossref ranks every work that matches any of the query's words, so its
 * match counts are large; the best matches come first.
 */

import { buildUrl, SourceError } from './http.js';
import { markupSections, markupToText, markupToSafeHtml } from './markup.js';
import { nameFromParts, makeDate, normalizeDoi, doiLink, doiUrl, safeUrl } from './records.js';

export const CROSSREF_WORKS = 'https://api.crossref.org/works';

const SELECT = ['DOI', 'title', 'author', 'abstract', 'container-title', 'short-container-title', 'issued', 'posted', 'type',
  'subject', 'volume', 'issue', 'page', 'URL', 'is-referenced-by-count', 'publisher', 'group-title'];

const SORTS = {
  relevance: {},
  date: { sort: 'published', order: 'desc' },
  cited: { sort: 'is-referenced-by-count', order: 'desc' },
};

const KINDS = {
  'journal-article': 'article', 'proceedings-article': 'article', 'posted-content': 'preprint', 'book-chapter': 'book',
  'book-section': 'book', 'book-part': 'book', book: 'book', monograph: 'book', 'edited-book': 'book', 'reference-book': 'book',
  'reference-entry': 'book', dataset: 'dataset', dissertation: 'thesis', report: 'report', 'report-component': 'report',
};

const TYPE_LABELS = {
  'journal-article': 'Journal article', 'proceedings-article': 'Conference paper', 'posted-content': 'Preprint',
  'book-chapter': 'Book chapter', book: 'Book', monograph: 'Book', 'edited-book': 'Book', dataset: 'Dataset',
  dissertation: 'Dissertation', report: 'Report', 'peer-review': 'Peer review', standard: 'Standard', component: 'Component',
};

function first(list) {
  return Array.isArray(list) && list.length ? list[0] : null;
}

function dateOf(d) {
  const parts = d && Array.isArray(d['date-parts']) ? d['date-parts'][0] : null;
  return parts && parts[0] ? makeDate(parts[0], parts[1], parts[2]) : null;
}

/** One Crossref work as a record. */
export function crossrefRecord(w) {
  const doi = normalizeDoi(w.DOI);
  const kind = KINDS[w.type] || (w.type ? 'other' : 'article');
  const container = first(w['container-title']);
  const short = first(w['short-container-title']);
  const pubDate = dateOf(w.issued) || dateOf(w.posted);
  const authors = (w.author || []).map((a) => {
    const orcid = a.ORCID ? String(a.ORCID).replace(/^https?:\/\/orcid\.org\//, '') : null;
    if (a.family) return nameFromParts(a.family, a.given, orcid ? { orcid } : null);
    return a.name ? { collective: a.name } : null;
  }).filter(Boolean);
  const title = first(w.title) || '';
  const tags = [];
  if (kind === 'preprint') tags.push('Preprint');
  else if (w.type && w.type !== 'journal-article' && TYPE_LABELS[w.type]) tags.push(TYPE_LABELS[w.type]);
  return {
    source: 'crossref',
    id: doi ? doi.toLowerCase() : String(w.URL || title),
    type: kind,
    title: markupToText(title),
    titleHtml: markupToSafeHtml(title),
    abstractSections: markupSections(w.abstract || ''),
    authors,
    journal: {
      title: container || (kind === 'preprint' ? w.publisher : null),
      isoAbbreviation: short && short !== container ? short : null,
      issn: null,
      volume: w.volume || null,
      issue: w.issue || null,
      pages: w.page || null,
    },
    publisher: w.publisher || null,
    year: pubDate ? pubDate.year : null,
    pubDate,
    doi,
    url: doi ? doiUrl(doi) : safeUrl(w.URL),
    links: [doiLink(doi)].filter(Boolean),
    keywords: w.subject || [],
    publicationTypes: [TYPE_LABELS[w.type] || w.type].filter(Boolean),
    tags,
    citedBy: w['is-referenced-by-count'] != null ? w['is-referenced-by-count'] : null,
  };
}

/** The Crossref filter parameter for a search. */
export function crossrefFilter(req) {
  const f = req.filters || {};
  const parts = [];
  if (f.abstracts) parts.push('has-abstract:true');
  if (f.articles) parts.push('type:journal-article');
  if (req.from) parts.push('from-pub-date:' + req.from);
  if (req.to) parts.push('until-pub-date:' + req.to);
  return parts.join(',');
}

export const crossrefSource = {
  id: 'crossref',
  name: 'Crossref',
  description: 'Metadata of works with Crossref DOIs from publishers in every field: articles, books, proceedings, preprints and reports.',
  homepage: 'https://www.crossref.org/',
  docs: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/',
  terms: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/',
  group: 'All fields',
  kinds: ['article', 'book', 'preprint', 'report', 'thesis', 'dataset'],
  idLabel: 'DOI',
  syntax: 'Free text: Crossref ranks works by how well their metadata matches the words.',
  placeholder: 'ocean acidification fisheries',
  matchesAnyWord: true,
  examples: [
    ['ocean acidification fisheries', 30], ['additive manufacturing titanium', 27], ['carbon pricing emissions', 24],
    ['wildfire smoke health', 22], ['hydrogen storage materials', 19], ['algorithmic fairness', 17], ['groundwater depletion', 15],
    ['bioplastics degradation', 13], ['remote work productivity', 11],
  ],
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'date', label: 'Most recent' }, { id: 'cited', label: 'Most cited' }],
  filters: [
    { id: 'abstracts', label: 'Only works with an abstract', help: 'Many Crossref records have none; without one only the title is clustered.', default: true },
    { id: 'articles', label: 'Journal articles only' },
  ],
  settings: [
    { id: 'email', label: 'Contact e-mail', type: 'email', help: 'Optional. Crossref serves requests that give a contact e-mail from its more reliable "polite" pool.' },
  ],
  keywordsLabel: 'Subjects',
  years: true,
  maxLimit: 2000,
  defaultLimit: 200,
  pageSize: 200,
  rateLimit: 1,

  async fetchPage(req, page) {
    const params = Object.assign({
      query: req.query,
      filter: crossrefFilter(req),
      rows: page.size,
      cursor: page.cursor || '*',
      select: SELECT.join(','),
      mailto: req.settings.email || undefined,
    }, SORTS[req.sort] || {});
    let json;
    try {
      json = await req.request.json(buildUrl(CROSSREF_WORKS, params), { signal: req.signal });
    } catch (err) {
      // Should Crossref ever refuse a field in "select", ask again for whole records.
      if (!(err instanceof SourceError) || err.status !== 400 || !/select|field/i.test(err.detail || '')) throw err;
      delete params.select;
      json = await req.request.json(buildUrl(CROSSREF_WORKS, params), { signal: req.signal });
    }
    const message = json.message || {};
    const items = message.items || [];
    return {
      total: message['total-results'] != null ? message['total-results'] : null,
      records: items.map(crossrefRecord),
      cursor: items.length && message['next-cursor'] ? message['next-cursor'] : null,
    };
  },
};
