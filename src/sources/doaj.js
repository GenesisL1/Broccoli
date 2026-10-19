/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * DOAJ, the Directory of Open Access Journals: articles from vetted open
 * access journals in every field and language, through its search API.
 * https://doaj.org/api/docs
 *
 * The API serves the first 1,000 results of a search, 100 at a time; its
 * query syntax is Elasticsearch's, without wildcards or fuzzy matching.
 */

import { buildUrl } from './http.js';
import { markupSections, markupToText, markupToSafeHtml } from './markup.js';
import { parseDisplayName, makeDate, normalizeDoi, doiLink, doiUrl, safeUrl } from './records.js';

export const DOAJ_ARTICLES = 'https://doaj.org/api/search/articles/';

/**
 * DOAJ refuses wildcards and fuzzy matching: ?, * and ~ stay plain
 * characters. A colon before a space ("COVID-19: outcomes") is punctuation,
 * not a field.
 */
export function doajEscape(query) {
  const once = (s) => s.replace(/(^|[^\\])([?*~])/g, '$1\\$2');
  return once(once(String(query))).replace(/([^\\]):(?=\s|$)/g, '$1\\:');
}

/** The DOAJ query with years and filters as clauses. */
export function doajQuery(req) {
  const clauses = ['(' + doajEscape(req.query) + ')'];
  if ((req.filters || {}).abstracts) clauses.push('_exists_:bibjson.abstract');
  if (req.from || req.to) clauses.push('bibjson.year:[' + (req.from || 1000) + ' TO ' + (req.to || 3000) + ']');
  return clauses.length > 1 ? clauses.join(' AND ') : doajEscape(req.query);
}

/** One DOAJ article as a record. */
export function doajRecord(r) {
  const b = r.bibjson || {};
  const j = b.journal || {};
  const ids = b.identifier || [];
  const doi = normalizeDoi((ids.find((i) => String(i.type).toLowerCase() === 'doi') || {}).id);
  const full = safeUrl(((b.link || []).find((l) => String(l.type).toLowerCase() === 'fulltext') || {}).url);
  const issn = (ids.find((i) => /issn/i.test(i.type || '')) || {}).id || null;
  const page = 'https://doaj.org/article/' + r.id;
  const start = j.start_page || b.start_page;
  const end = j.end_page || b.end_page;
  return {
    source: 'doaj',
    id: String(r.id),
    type: 'article',
    title: markupToText(b.title || ''),
    titleHtml: markupToSafeHtml(b.title || ''),
    abstractSections: markupSections(b.abstract || ''),
    authors: (b.author || []).map((a) => parseDisplayName(a.name || '', a.orcid_id ? { orcid: String(a.orcid_id).replace(/^https?:\/\/orcid\.org\//, '') } : null)),
    journal: {
      title: j.title || null,
      isoAbbreviation: null,
      issn,
      volume: j.volume || null,
      issue: j.number || null,
      pages: start ? (end && end !== start ? start + '-' + end : String(start)) : null,
    },
    publisher: j.publisher || null,
    year: parseInt(b.year, 10) || null,
    pubDate: makeDate(b.year, b.month),
    doi,
    url: full || (doi ? doiUrl(doi) : page),
    links: [
      { label: 'DOAJ', text: 'record', url: page },
      full ? { label: 'Full text', text: (/^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(full) || [])[1] || 'link', url: full } : null,
      doiLink(doi),
    ].filter(Boolean),
    keywords: b.keywords || [],
    languages: j.language || [],
    openAccess: true,
  };
}

export const doajSource = {
  id: 'doaj',
  name: 'DOAJ',
  description: 'Articles from the vetted open access journals of the Directory of Open Access Journals, in every field and many languages.',
  homepage: 'https://doaj.org/',
  docs: 'https://doaj.org/api/docs',
  terms: 'https://doaj.org/terms/',
  group: 'All fields',
  kinds: ['article'],
  idLabel: 'DOAJ',
  syntax: 'Elasticsearch syntax: fields such as title:, abstract:, and AND, OR, NOT. No wildcards.',
  placeholder: 'participatory budgeting',
  examples: [
    ['participatory budgeting', 28], ['mangrove restoration', 26], ['dengue vector control', 24], ['heritage conservation digital', 21],
    ['teacher wellbeing', 19], ['food security climate adaptation', 17], ['traditional medicine plants', 15],
    ['earthquake early warning', 13], ['open educational resources', 11],
  ],
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'added', label: 'Recently added' }],
  filters: [
    { id: 'abstracts', label: 'Only articles with an abstract', default: true },
  ],
  keywordsLabel: 'Keywords',
  years: true,
  maxLimit: 1000,
  defaultLimit: 200,
  pageSize: 100,
  rateLimit: 2,

  async fetchPage(req, page) {
    const url = buildUrl(DOAJ_ARTICLES + encodeURIComponent(doajQuery(req)), {
      page: page.page,
      pageSize: page.size,
      sort: req.sort === 'added' ? 'created_date:desc' : undefined,
    });
    const json = await req.request.json(url, { signal: req.signal });
    return { total: json.total != null ? json.total : null, records: (json.results || []).map(doajRecord) };
  },
};
