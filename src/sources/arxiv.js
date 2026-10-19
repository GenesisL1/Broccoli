/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * arXiv's own API (Atom feeds). arXiv does not send the CORS headers a web
 * page needs, so in a browser this source works only through a proxy
 * (settings.baseUrl); from a server, a browser extension, a worker runtime
 * or the command line it works as is. In web pages, the "arxiv" source
 * reads the same papers from the OpenAlex index instead.
 * https://info.arxiv.org/help/api/user-manual.html
 *
 * arXiv asks for no more than one request every three seconds.
 */

import { buildUrl, SourceError } from './http.js';
import { parseXml, child, children, textContent } from '../pubmed/xml.js';
import { parseDisplayName, parseIsoDate, normalizeDoi, doiLink } from './records.js';

export const ARXIV_API = 'https://export.arxiv.org/api/query';

const FIELDED = /\b(?:ti|au|abs|co|jr|cat|rn|id|all):/;

/** A plain query as arXiv search_query: every word (or "quoted phrase") required, in any field. */
export function arxivSearchQuery(query, req = {}) {
  let q = String(query).trim();
  if (!FIELDED.test(q)) {
    const terms = q.match(/"[^"]+"|\S+/g) || [];
    q = terms.filter((t) => !/^(AND|OR|NOT)$/.test(t)).map((t) => 'all:' + (t.startsWith('"') ? t : t.replace(/[()]/g, ''))).join(' AND ');
  }
  if (req.from || req.to) {
    q = '(' + q + ') AND submittedDate:[' + (req.from || 1991) + '01010000 TO ' + (req.to || 2999) + '12312359]';
  }
  return q;
}

/** The arXiv identifier of an abs URL, without its version: "http://arxiv.org/abs/2401.01234v2" → "2401.01234". */
export function arxivIdFromUrl(url) {
  const m = /arxiv\.org\/abs\/(.+?)(v\d+)?$/i.exec(String(url || '').trim());
  return m ? m[1] : null;
}

/** One Atom entry as a record. */
export function arxivEntryRecord(entry) {
  const absUrl = textContent(child(entry, 'id'));
  const id = arxivIdFromUrl(absUrl) || absUrl;
  const version = (/v(\d+)$/.exec(absUrl) || [])[1] || null;
  const published = parseIsoDate(textContent(child(entry, 'published')));
  const primary = child(entry, 'arxiv:primary_category');
  const categories = children(entry, 'category').map((c) => c.attrs.term).filter(Boolean);
  const journalRef = textContent(child(entry, 'arxiv:journal_ref')) || null;
  const doi = normalizeDoi(textContent(child(entry, 'arxiv:doi')));
  const url = 'https://arxiv.org/abs/' + id;
  const tags = ['Preprint'];
  if (primary && primary.attrs.term) tags.push(primary.attrs.term);
  return {
    source: 'arxiv-api',
    id,
    type: 'preprint',
    title: textContent(child(entry, 'title')),
    abstract: textContent(child(entry, 'summary')),
    authors: children(entry, 'author').map((a) => parseDisplayName(textContent(child(a, 'name')))),
    journal: { title: journalRef || 'arXiv' },
    year: published ? published.year : null,
    pubDate: published,
    doi,
    arxiv: id,
    url,
    links: [{ label: 'arXiv', text: id, url }, { label: 'PDF', text: id, url: 'https://arxiv.org/pdf/' + id }, doiLink(doi)].filter(Boolean),
    publicationTypes: ['Preprint'],
    tags,
    extra: { version, categories, comment: textContent(child(entry, 'arxiv:comment')) || null, journalRef },
  };
}

/** Reads an arXiv API Atom feed: { total, records }. */
export function parseArxivFeed(xml) {
  const doc = parseXml(xml);
  const feed = children(doc).find((n) => n.name === 'feed');
  if (!feed) throw new SourceError('arXiv sent an answer that is not an Atom feed', { source: 'arxiv-api', kind: 'parse' });
  const entries = children(feed, 'entry');
  const error = entries.find((e) => /api\/errors/.test(textContent(child(e, 'id'))));
  if (error) {
    throw new SourceError('arXiv could not read the query: ' + (textContent(child(error, 'summary')) || 'error'), { source: 'arxiv-api', kind: 'query' });
  }
  const total = parseInt(textContent(child(feed, 'opensearch:totalResults')), 10);
  return { total: Number.isFinite(total) ? total : null, records: entries.map(arxivEntryRecord) };
}

export const arxivApiSource = {
  id: 'arxiv-api',
  name: 'arXiv API',
  shortName: 'arXiv API',
  description: 'arXiv\'s own API. It does not accept requests from web pages, so in a browser it needs a proxy; elsewhere it works as is.',
  homepage: 'https://arxiv.org/',
  docs: 'https://info.arxiv.org/help/api/user-manual.html',
  terms: 'https://info.arxiv.org/help/api/tou.html',
  group: 'Preprints',
  kinds: ['preprint'],
  idLabel: 'arXiv',
  browser: false,
  syntax: 'arXiv syntax: ti:, au:, abs:, cat:, and AND, OR, ANDNOT. Plain words are all required.',
  placeholder: 'graph neural networks',
  examples: [['graph neural networks', 1]],
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'date', label: 'Most recent' }],
  filters: [],
  settings: [
    { id: 'baseUrl', label: 'API address', type: 'url', placeholder: ARXIV_API, help: 'A proxy that passes requests on to arXiv\'s API, for use in web pages.' },
  ],
  years: true,
  maxLimit: 2000,
  defaultLimit: 200,
  pageSize: 200,
  rateLimit: 1 / 3,

  async fetchPage(req, page) {
    const url = buildUrl(req.settings.baseUrl || ARXIV_API, {
      search_query: arxivSearchQuery(req.query, req),
      start: page.offset,
      max_results: page.size,
      sortBy: req.sort === 'date' ? 'submittedDate' : 'relevance',
      sortOrder: 'descending',
    });
    return parseArxivFeed(await req.request.text(url, { signal: req.signal }));
  },
};
