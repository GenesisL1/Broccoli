/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * INSPIRE-HEP: the literature of high-energy physics and its neighbours
 * (astrophysics, cosmology, gravitation, nuclear physics), with arXiv
 * links and citation counts, through the INSPIRE REST API.
 * https://github.com/inspirehep/rest-api-doc
 */

import { buildUrl } from './http.js';
import { markupToText, markupToSafeHtml, markupSections } from './markup.js';
import { parseInvertedName, parseIsoDate, makeDate, normalizeDoi, doiLink, arxivLink } from './records.js';

export const INSPIRE_LITERATURE = 'https://inspirehep.net/api/literature';

const FIELDS = ['control_number', 'titles', 'abstracts', 'authors.full_name', 'collaborations', 'arxiv_eprints', 'dois',
  'publication_info', 'earliest_date', 'keywords', 'citation_count', 'document_type'];

const SORTS = { relevance: undefined, date: 'mostrecent', cited: 'mostcited' };

const MAX_AUTHORS = 25;

const KINDS = { article: 'article', 'conference paper': 'article', proceedings: 'book', book: 'book', 'book chapter': 'book', thesis: 'thesis', report: 'report', review: 'review', note: 'report', 'activity report': 'report' };

/** The INSPIRE query with the years as a date range. */
export function inspireQuery(req) {
  const q = req.query;
  if (req.from && req.to) return '(' + q + ') and date ' + req.from + '->' + req.to;
  if (req.from) return '(' + q + ') and date >= ' + req.from;
  if (req.to) return '(' + q + ') and date <= ' + req.to;
  return q;
}

/** One INSPIRE literature hit as a record. */
export function inspireRecord(hit) {
  const m = hit.metadata || {};
  const id = String(m.control_number || hit.id || '');
  const pub = (m.publication_info || []).find((p) => p && p.journal_title) || {};
  const eprint = (m.arxiv_eprints || [])[0] || {};
  const arxiv = eprint.value || null;
  const doi = normalizeDoi(((m.dois || [])[0] || {}).value);
  const abstracts = m.abstracts || [];
  const abs = abstracts.find((a) => a && a.source === 'arXiv') || abstracts[0] || {};
  const people = (m.authors || []).filter((a) => a && a.full_name);
  const authors = (m.collaborations || []).filter((c) => c && c.value).map((c) => ({ collective: c.value.replace(/\s+collaboration$/i, '') + ' Collaboration' }))
    .concat(people.slice(0, MAX_AUTHORS).map((a) => parseInvertedName(a.full_name)));
  const docType = String((m.document_type || [])[0] || 'article');
  const published = !!pub.journal_title;
  const type = !published && arxiv && (docType === 'article' || docType === 'conference paper') ? 'preprint' : KINDS[docType] || 'other';
  const date = parseIsoDate(m.earliest_date);
  const year = parseInt(pub.year, 10) || (date && date.year) || null;
  const pages = pub.page_start ? (pub.page_end && pub.page_end !== pub.page_start ? pub.page_start + '-' + pub.page_end : String(pub.page_start)) : pub.artid || null;
  const url = 'https://inspirehep.net/literature/' + id;
  const tags = [];
  if (type === 'preprint') tags.push('Preprint');
  else if (docType !== 'article') tags.push(docType.charAt(0).toUpperCase() + docType.slice(1));
  if (eprint.categories && eprint.categories.length) tags.push(eprint.categories[0]);
  const title = ((m.titles || [])[0] || {}).title || '';
  return {
    source: 'inspire',
    id,
    type,
    title: markupToText(title),
    titleHtml: markupToSafeHtml(title),
    abstractSections: markupSections(abs.value || ''),
    authors,
    authorString: undefined,
    journal: {
      title: pub.journal_title || (arxiv ? 'arXiv' : null),
      volume: pub.journal_volume || null,
      issue: pub.journal_issue || null,
      pages,
    },
    year,
    pubDate: published && pub.year ? makeDate(pub.year) : date,
    doi,
    arxiv,
    url,
    links: [{ label: 'INSPIRE', text: id, url }, arxivLink(arxiv), doiLink(doi)].filter(Boolean),
    keywords: (m.keywords || []).filter((k) => k && k.value && !/^(PACS|PDG|JACOW)$/i.test(k.schema || '') && !/^\d/.test(k.value)).map((k) => k.value),
    publicationTypes: [docType],
    tags,
    citedBy: m.citation_count != null ? m.citation_count : null,
    extra: { authorCount: people.length, categories: eprint.categories || [] },
  };
}

export const inspireSource = {
  id: 'inspire',
  name: 'INSPIRE-HEP',
  shortName: 'INSPIRE',
  description: 'The literature of high-energy physics, astrophysics, cosmology, gravitation and nuclear physics, with arXiv links and citation counts.',
  homepage: 'https://inspirehep.net/',
  docs: 'https://github.com/inspirehep/rest-api-doc',
  group: 'Physics',
  kinds: ['article', 'preprint', 'thesis', 'book', 'report'],
  idLabel: 'INSPIRE',
  syntax: 'Free text, or INSPIRE syntax such as t for title, a for author, and, or, not.',
  placeholder: 'dark matter direct detection',
  examples: [
    ['dark matter direct detection', 30], ['neutrino oscillations', 27], ['Higgs boson self-coupling', 24], ['gravitational waves', 22],
    ['quark-gluon plasma', 19], ['axion', 17], ['lattice QCD', 15], ['cosmic microwave background', 13], ['muon g-2', 11],
  ],
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'date', label: 'Most recent' }, { id: 'cited', label: 'Most cited' }],
  filters: [],
  keywordsLabel: 'Keywords',
  years: true,
  maxLimit: 2000,
  defaultLimit: 200,
  pageSize: 200,
  rateLimit: 2,

  async fetchPage(req, page) {
    const url = buildUrl(INSPIRE_LITERATURE, {
      q: inspireQuery(req),
      size: page.size,
      page: page.page,
      sort: SORTS[req.sort],
      fields: FIELDS.join(','),
    });
    const json = await req.request.json(url, { signal: req.signal });
    const hits = json.hits || {};
    const total = typeof hits.total === 'object' && hits.total ? hits.total.value : hits.total;
    return { total: total != null ? total : null, records: (hits.hits || []).map(inspireRecord) };
  },
};
