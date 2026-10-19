/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * DataCite: DOIs for research data, software and other outputs, from
 * Zenodo, Dryad, Figshare, institutional repositories and data centres,
 * through the DataCite REST API.
 * https://support.datacite.org/docs/api
 */

import { buildUrl } from './http.js';
import { markupSections, markupToText } from './markup.js';
import { nameFromParts, parseInvertedName, makeDate, normalizeDoi, doiLink, doiUrl, safeUrl } from './records.js';

export const DATACITE_DOIS = 'https://api.datacite.org/dois';

const SORTS = { relevance: 'relevance', date: '-published', cited: '-citation-count' };

const KINDS = {
  Dataset: 'dataset', Software: 'software', ComputationalNotebook: 'software', JournalArticle: 'article', Text: 'article',
  Preprint: 'preprint', Book: 'book', BookChapter: 'book', Dissertation: 'thesis', Report: 'report',
};

/** "ComputationalNotebook" → "Computational notebook" */
function typeLabel(t) {
  const s = String(t || '').replace(/([a-z])([A-Z])/g, '$1 $2');
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : '';
}

/** One DataCite DOI (JSON:API item) as a record. */
export function dataciteRecord(item) {
  const a = item.attributes || {};
  const doi = normalizeDoi(a.doi || item.id);
  const titles = a.titles || [];
  const title = (titles.find((t) => t && !t.titleType) || titles[0] || {}).title || '';
  const descriptions = (a.descriptions || []).filter((d) => d && d.description);
  const desc = descriptions.find((d) => d.descriptionType === 'Abstract') || descriptions[0];
  const text = desc ? [].concat(desc.description).join(' ') : '';
  const authors = (a.creators || []).map((c) => {
    const ids = (c.nameIdentifiers || []).find((n) => /orcid/i.test(n.nameIdentifierScheme || ''));
    const extra = ids && ids.nameIdentifier ? { orcid: String(ids.nameIdentifier).replace(/^https?:\/\/orcid\.org\//, '') } : null;
    if (c.familyName) return nameFromParts(c.familyName, c.givenName, extra);
    if (c.nameType === 'Organizational' || !/,/.test(c.name || '')) return c.name ? Object.assign({ collective: c.name }, extra) : null;
    return parseInvertedName(c.name, extra);
  }).filter(Boolean);
  const publisher = a.publisher && typeof a.publisher === 'object' ? a.publisher.name : a.publisher || null;
  const rtg = (a.types || {}).resourceTypeGeneral || '';
  const tags = [typeLabel(rtg)].filter(Boolean);
  if (a.version) tags.push('Version ' + String(a.version).replace(/^v(?=\d)/i, ''));
  return {
    source: 'datacite',
    id: doi || String(item.id || ''),
    type: KINDS[rtg] || (rtg ? 'other' : 'dataset'),
    title: markupToText(title),
    abstractSections: markupSections(text),
    authors,
    journal: { title: (a.container && a.container.title) || publisher },
    publisher,
    year: parseInt(a.publicationYear, 10) || null,
    pubDate: makeDate(a.publicationYear),
    doi,
    url: safeUrl(a.url) || doiUrl(doi),
    links: [doiLink(doi)].filter(Boolean),
    keywords: (a.subjects || []).map((s) => String((s && s.subject) || '').replace(/^FOS:\s*/i, '')).filter(Boolean),
    publicationTypes: tags.slice(0, 1),
    tags,
    languages: a.language ? [a.language] : [],
    citedBy: a.citationCount != null ? a.citationCount : null,
  };
}

/** The resource types to ask for ('' for every kind of output). */
export function dataciteTypes(filters = {}) {
  if (filters.other) return '';
  const types = [];
  if (filters.datasets) types.push('dataset');
  if (filters.software) types.push('software');
  return types.join(',');
}

export const dataciteSource = {
  id: 'datacite',
  name: 'DataCite',
  description: 'Research datasets, software and other outputs with DataCite DOIs, from Zenodo, Dryad, Figshare, institutional repositories and data centres.',
  homepage: 'https://datacite.org/',
  docs: 'https://support.datacite.org/docs/api',
  group: 'Data and code',
  kinds: ['dataset', 'software', 'other'],
  idLabel: 'DOI',
  syntax: 'Elasticsearch syntax: fields such as titles.title:, creators.name:, and AND, OR, NOT. Words are all required.',
  placeholder: 'single-cell RNA-seq dataset',
  examples: [
    ['single-cell RNA-seq', 30], ['climate model output', 27], ['bird migration tracking', 24], ['protein structure prediction', 22],
    ['air quality sensors', 19], ['MRI brain segmentation', 17], ['crop yield', 15], ['species occurrence', 13], ['ocean temperature', 11],
  ],
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'date', label: 'Most recent' }, { id: 'cited', label: 'Most cited' }],
  filters: [
    { id: 'datasets', label: 'Datasets', default: true },
    { id: 'software', label: 'Software', default: true },
    { id: 'other', label: 'Every other kind of output too', help: 'Text, images, models, workflows and the rest.' },
  ],
  keywordsLabel: 'Subjects',
  years: true,
  maxLimit: 2000,
  defaultLimit: 200,
  pageSize: 200,
  rateLimit: 5,

  async fetchPage(req, page) {
    const clauses = ['(' + req.query + ')'];
    if (req.from || req.to) clauses.push('publicationYear:[' + (req.from || 1000) + ' TO ' + (req.to || 3000) + ']');
    const url = buildUrl(DATACITE_DOIS, {
      query: clauses.length > 1 ? clauses.join(' AND ') : req.query,
      'resource-type-id': dataciteTypes(req.filters) || undefined,
      sort: SORTS[req.sort],
      'page[size]': page.size,
      'page[number]': page.page,
      'disable-facets': 'true',
    });
    const json = await req.request.json(url, { signal: req.signal });
    const meta = json.meta || {};
    return { total: meta.total != null ? meta.total : null, records: (json.data || []).map(dataciteRecord) };
  },
};
