/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * OpenAlex: an open index of scholarly works in every field, with abstracts
 * (as inverted indexes), topics, keywords and citation counts. The arXiv
 * source reads arXiv's papers from the same index, because arXiv's own API
 * does not accept requests from web pages.
 * https://docs.openalex.org/
 *
 * No API key is needed. Results are fetched by page number (up to 10,000 a
 * search): OpenAlex answers numbered pages for everyone, but the second page
 * of a cursor only for callers with a key. OpenAlex gives each address a
 * daily allowance of searches; a developer with heavy use can pass a free key
 * of their own as settings.apiKey (the search page does not ask for one).
 */

import { buildUrl } from './http.js';
import { markupToText, markupToSafeHtml } from './markup.js';
import { parseDisplayName, parseIsoDate, normalizeDoi, pmidLink, pmcLink, doiLink, arxivLink, doiUrl, safeUrl } from './records.js';

export const OPENALEX_WORKS = 'https://api.openalex.org/works';

const SELECT = ['id', 'doi', 'display_name', 'publication_year', 'publication_date', 'type', 'authorships', 'primary_location',
  'biblio', 'abstract_inverted_index', 'keywords', 'mesh', 'ids', 'cited_by_count', 'open_access', 'language', 'is_retracted'];

const SORTS = { relevance: undefined, date: 'publication_date:desc', cited: 'cited_by_count:desc' };

const TYPE_LABELS = {
  review: 'Review', preprint: 'Preprint', 'book-chapter': 'Book chapter', book: 'Book', dataset: 'Dataset',
  dissertation: 'Dissertation', editorial: 'Editorial', letter: 'Letter', erratum: 'Erratum', report: 'Report',
  'peer-review': 'Peer review', standard: 'Standard', retraction: 'Retraction', 'supplementary-materials': 'Supplementary material',
};

const KINDS = {
  article: 'article', review: 'review', preprint: 'preprint', book: 'book', 'book-chapter': 'book', dataset: 'dataset',
  dissertation: 'thesis', report: 'report', software: 'software',
};

/** An OpenAlex abstract_inverted_index → the abstract's text. */
export function uninvertAbstract(index) {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  for (const word of Object.keys(index)) {
    const at = index[word];
    if (!Array.isArray(at)) continue;
    for (const p of at) if (Number.isInteger(p) && p >= 0 && p < 200000) words[p] = word;
  }
  return words.filter((w) => w !== undefined).join(' ');
}

/** The arXiv identifier of a work, from its DOI or an arxiv.org address. */
export function arxivIdOf(work) {
  const doi = normalizeDoi(work.doi);
  const m = doi && /^10\.48550\/arxiv\.(.+)$/i.exec(doi);
  if (m) return m[1];
  const locations = [work.primary_location].concat(work.locations || []).filter(Boolean);
  for (const l of locations) {
    for (const u of [l.landing_page_url, l.pdf_url]) {
      const a = /arxiv\.org\/(?:abs|pdf)\/([^?#\s]+?)(?:v\d+)?(?:\.pdf)?$/i.exec(u || '');
      if (a) return a[1];
    }
  }
  return null;
}

function lastSegment(url) {
  return url ? String(url).replace(/\/+$/, '').split('/').pop() : null;
}

/** One OpenAlex work as a record. options = { arxiv: true } for the arXiv source. */
export function openAlexRecord(w, options = {}) {
  const id = String(w.id || '').replace(/^https?:\/\/openalex\.org\//, '');
  const loc = w.primary_location || {};
  const src = loc.source || {};
  const doi = normalizeDoi(w.doi);
  const arxiv = arxivIdOf(w);
  const b = w.biblio || {};
  const authors = (w.authorships || []).map((a) => {
    const name = (a.author && a.author.display_name) || a.raw_author_name || '';
    const orcid = a.author && a.author.orcid ? lastSegment(a.author.orcid) : null;
    return parseDisplayName(name, orcid ? { orcid } : null);
  });
  let venue = src.display_name || null;
  if (venue && /^arxiv\b/i.test(venue)) venue = 'arXiv';
  const pages = b.first_page ? (b.last_page && b.last_page !== b.first_page ? b.first_page + '-' + b.last_page : b.first_page) : null;
  const preprint = w.type === 'preprint' || (arxiv && venue === 'arXiv') || loc.version === 'submittedVersion';
  const tags = [];
  if (w.is_retracted) tags.push('Retracted Publication');
  if (preprint) tags.push('Preprint');
  else if (TYPE_LABELS[w.type]) tags.push(TYPE_LABELS[w.type]);
  const meshBy = new Map();
  for (const m of w.mesh || []) {
    if (!m || !m.descriptor_name) continue;
    let e = meshBy.get(m.descriptor_name);
    if (!e) meshBy.set(m.descriptor_name, (e = { descriptor: m.descriptor_name, major: false, qualifiers: [] }));
    if (m.qualifier_name) e.qualifiers.push({ name: m.qualifier_name, major: !!m.is_major_topic });
    else if (m.is_major_topic) e.major = true;
  }
  const ids = w.ids || {};
  const pmid = ids.pmid ? lastSegment(ids.pmid) : null;
  const pmcid = ids.pmcid ? lastSegment(ids.pmcid) : null;
  const oaUrl = safeUrl(w.open_access && w.open_access.oa_url);
  const page = 'https://openalex.org/' + id;
  const landing = options.arxiv && arxiv ? 'https://arxiv.org/abs/' + arxiv : safeUrl(loc.landing_page_url) || (doi ? doiUrl(doi) : page);
  const links = [
    options.arxiv ? arxivLink(arxiv) : null,
    { label: 'OpenAlex', text: id, url: page },
    options.arxiv ? null : arxivLink(arxiv),
    pmidLink(pmid),
    pmcid ? pmcLink(pmcid) : oaUrl && !/arxiv\.org/i.test(oaUrl) ? { label: 'Free full text', text: hostOf(oaUrl), url: oaUrl } : null,
    doiLink(doi),
  ].filter(Boolean);
  return {
    source: options.source || 'openalex',
    id,
    type: preprint ? 'preprint' : KINDS[w.type] || (w.type ? 'other' : 'article'),
    title: markupToText(w.display_name || w.title || ''),
    titleHtml: markupToSafeHtml(w.display_name || w.title || ''),
    abstract: uninvertAbstract(w.abstract_inverted_index),
    authors,
    journal: { title: venue, isoAbbreviation: null, issn: src.issn_l || null, volume: b.volume || null, issue: b.issue || null, pages },
    publisher: null,
    year: w.publication_year || null,
    pubDate: parseIsoDate(w.publication_date),
    doi,
    pmid,
    pmcid,
    arxiv,
    url: landing,
    links,
    keywords: (w.keywords || []).map((k) => k && (k.display_name || k.keyword)).filter(Boolean),
    mesh: [...meshBy.values()],
    publicationTypes: [TYPE_LABELS[w.type] || (w.type ? w.type.charAt(0).toUpperCase() + w.type.slice(1) : null)].filter(Boolean)
      .concat(w.is_retracted ? ['Retracted Publication'] : []),
    tags,
    languages: w.language ? [w.language] : [],
    openAccess: w.open_access ? !!w.open_access.is_oa : null,
    citedBy: w.cited_by_count != null ? w.cited_by_count : null,
  };
}

function hostOf(url) {
  const m = /^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(url || '');
  return m ? m[1] : 'link';
}

/** The OpenAlex filter parameter for a search. */
export function openAlexFilter(req, extra) {
  const f = req.filters || {};
  const parts = [];
  if (f.abstracts) parts.push('has_abstract:true');
  if (f.open) parts.push('is_oa:true');
  if (f.articles) parts.push('type:article');
  if (req.from) parts.push('from_publication_date:' + req.from + '-01-01');
  if (req.to) parts.push('to_publication_date:' + req.to + '-12-31');
  if (extra) parts.push(extra);
  return parts.join(',');
}

function openAlexPage(options) {
  return async function fetchPage(req, page) {
    // Numbered pages, not a cursor: they need no API key.
    const url = buildUrl(OPENALEX_WORKS, {
      search: req.query,
      filter: openAlexFilter(req, options.filter),
      sort: SORTS[req.sort],
      'per-page': page.size,
      page: page.page,
      select: options.select.join(','),
      api_key: req.settings.apiKey || undefined,
    });
    const json = await req.request.json(url, { signal: req.signal });
    const results = json.results || [];
    const meta = json.meta || {};
    return {
      total: meta.count != null ? meta.count : null,
      records: results.map((w) => openAlexRecord(w, options)),
    };
  };
}

export const openAlexSource = {
  id: 'openalex',
  name: 'OpenAlex',
  description: 'An open index of scholarly works in every field, from journals, repositories, preprint servers and conferences.',
  homepage: 'https://openalex.org/',
  docs: 'https://docs.openalex.org/',
  terms: 'https://help.openalex.org/api/authentication/',
  group: 'All fields',
  service: 'openalex',
  kinds: ['article', 'review', 'preprint', 'book', 'dataset', 'thesis'],
  idLabel: 'OpenAlex',
  syntax: 'Words are matched in titles, abstracts and full texts, with stemming; AND, OR, NOT and "quoted phrases" work.',
  placeholder: 'urban heat islands',
  examples: [
    ['urban heat islands', 30], ['perovskite solar cell stability', 27], ['large language models education', 25],
    ['coral reef bleaching', 22], ['microfinance poverty', 19], ['soil carbon sequestration', 17], ['misinformation social media', 15],
    ['battery recycling lithium', 13], ['ancient DNA migration', 11],
  ],
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'date', label: 'Most recent' }, { id: 'cited', label: 'Most cited' }],
  filters: [
    { id: 'abstracts', label: 'Only works with an abstract', help: 'Works without one have only a title to cluster on.', default: true },
    { id: 'open', label: 'Open access only' },
    { id: 'articles', label: 'Articles only', help: 'Leaves out preprints, books, datasets and the rest.' },
  ],
  keywordsLabel: 'Keywords',
  years: true,
  maxLimit: 1000,
  defaultLimit: 200,
  pageSize: 100,
  rateLimit: 5,
  fetchPage: openAlexPage({ select: SELECT }),
};

export const arxivSource = {
  id: 'arxiv',
  name: 'arXiv',
  description: 'Preprints in physics, mathematics, computer science, quantitative biology and finance, statistics, electrical engineering and economics, read from the OpenAlex index of arXiv.',
  homepage: 'https://arxiv.org/',
  docs: 'https://docs.openalex.org/',
  terms: 'https://help.openalex.org/api/authentication/',
  group: 'Preprints',
  service: 'openalex',
  settingsFrom: 'openalex',
  kinds: ['preprint'],
  idLabel: 'arXiv',
  syntax: 'Words are matched in titles, abstracts and full texts, with stemming; AND, OR, NOT and "quoted phrases" work.',
  placeholder: 'graph neural networks',
  examples: [
    ['graph neural networks', 30], ['dark matter direct detection', 27], ['diffusion models image generation', 25],
    ['quantum error correction', 23], ['reinforcement learning robotics', 20], ['exoplanet atmospheres', 18],
    ['topological insulators', 16], ['federated learning privacy', 14], ['gravitational waves black hole mergers', 12],
  ],
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'date', label: 'Most recent' }, { id: 'cited', label: 'Most cited' }],
  filters: [
    { id: 'abstracts', label: 'Only papers with an abstract', default: true },
  ],
  keywordsLabel: 'Keywords',
  years: true,
  maxLimit: 1000,
  defaultLimit: 200,
  pageSize: 100,
  rateLimit: 5,
  fetchPage: openAlexPage({ select: SELECT.concat(['locations']), filter: 'indexed_in:arxiv', arxiv: true, source: 'arxiv' }),
};
