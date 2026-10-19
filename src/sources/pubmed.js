/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * PubMed through NCBI E-utilities (ESearch for the IDs, EFetch for the
 * records), with PubMed's own query syntax and filters.
 * https://www.ncbi.nlm.nih.gov/books/NBK25501/
 */

import { PubMedClient, EUTILS_BASE } from '../pubmed/eutils.js';
import { SourceError, isAbortError } from './http.js';
import { standardLinks } from './records.js';

/** Publication types worth showing beside a record, in this order. */
export const NOTABLE_TYPES = Object.freeze([
  'Retracted Publication', 'Retraction of Publication', 'Preprint', 'Systematic Review', 'Meta-Analysis',
  'Review', 'Randomized Controlled Trial', 'Clinical Trial', 'Case Reports', 'Practice Guideline', 'Guideline',
  'Editorial', 'Comment',
]);

/** The notable types among a record's publication types (any letter case). */
export function notableTypes(types) {
  const have = new Set((types || []).map((t) => String(t).toLowerCase()));
  return NOTABLE_TYPES.filter((t) => have.has(t.toLowerCase()));
}

const FILTERS = {
  abstracts: 'hasabstract',
  english: 'english[lang]',
  humans: 'humans[mh]',
  free: 'free full text[sb]',
  reviews: 'review[pt]',
  trials: 'clinical trial[pt]',
};

/** The PubMed query with the filters switched on. */
export function pubmedTerm(query, filters = {}) {
  const parts = Object.keys(FILTERS).filter((k) => filters[k]).map((k) => FILTERS[k]);
  return parts.length ? '(' + query + ') AND ' + parts.join(' AND ') : query;
}

/** A PubMed article (from parsePubmedXml) as a source record. */
export function pubmedRecord(a) {
  return Object.assign({}, a, {
    source: 'pubmed',
    id: a.pmid,
    links: standardLinks(a),
    tags: notableTypes(a.publicationTypes),
  });
}

function sourceError(err) {
  if (isAbortError(err) || err instanceof SourceError) return err;
  const details = { source: 'pubmed', status: err.status || 0, cause: err };
  if (err.network) return new SourceError('Could not reach PubMed (NCBI E-utilities)', Object.assign(details, { kind: 'network' }));
  if (err.status === 429) return new SourceError('NCBI is limiting requests from this address (HTTP 429)', Object.assign(details, { kind: 'rate-limit' }));
  if (/^ESearch: /.test(err.message || '')) {
    return new SourceError('PubMed could not read the query: ' + err.message.replace(/^ESearch: /, ''), Object.assign(details, { kind: 'query' }));
  }
  return new SourceError(err.message || String(err), Object.assign(details, { kind: err.status ? 'http' : 'parse' }));
}

export const pubmedSource = {
  id: 'pubmed',
  name: 'PubMed',
  description: 'Biomedical and life-science literature: MEDLINE, PubMed Central and NCBI Bookshelf, through NCBI E-utilities.',
  homepage: 'https://pubmed.ncbi.nlm.nih.gov/',
  docs: 'https://www.ncbi.nlm.nih.gov/books/NBK25501/',
  terms: 'https://www.ncbi.nlm.nih.gov/home/about/policies/',
  group: 'Biomedicine',
  kinds: ['article', 'book'],
  idLabel: 'PMID',
  syntax: 'PubMed syntax: field tags such as [ti], [au], [mh], and AND, OR, NOT.',
  placeholder: 'long covid cognitive symptoms',
  examples: [
    ['long covid cognitive symptoms', 34], ['HLA class II autoimmunity', 30], ['GLP-1 receptor agonists heart failure', 28],
    ['CRISPR off-target effects', 24], ['gut microbiome depression', 22], ['CAR-T cell therapy solid tumors', 20],
    ['antimicrobial resistance wastewater', 17], ['protein thermostability prediction', 15], ['senolytics healthy aging', 13],
    ['glymphatic system sleep', 11],
  ],
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'date', label: 'Most recent' }],
  filters: [
    { id: 'abstracts', label: 'Only records with an abstract', help: 'Records without one have only a title to cluster on.', default: true },
    { id: 'english', label: 'English only' },
    { id: 'humans', label: 'Humans only' },
    { id: 'free', label: 'Free full text only' },
    { id: 'reviews', label: 'Reviews only' },
    { id: 'trials', label: 'Clinical trials only' },
  ],
  settings: [
    { id: 'apiKey', label: 'NCBI API key', type: 'secret', help: 'Free from your NCBI account settings. Raises the limit from 3 to 10 requests a second.' },
    { id: 'email', label: 'Contact e-mail', type: 'email', help: 'NCBI asks tools to identify a contact for heavy use.' },
    { id: 'baseUrl', label: 'E-utilities address', type: 'url', placeholder: EUTILS_BASE, help: 'Change only to use a proxy, such as server/eutils-proxy.php from the Broccoli repository.' },
  ],
  keywordsLabel: 'Keywords',
  years: true,
  biomedical: true,
  maxLimit: 10000,
  defaultLimit: 200,
  pageSize: 200,

  async search(req) {
    const s = req.settings || {};
    let client;
    try {
      client = new PubMedClient({
        apiKey: s.apiKey || undefined,
        email: s.email || undefined,
        baseUrl: s.baseUrl || undefined,
        tool: s.tool || 'broccoli',
        fetch: req.fetch,
      });
    } catch (err) {
      throw new SourceError(err.message, { source: 'pubmed', kind: 'config' });
    }
    const base = client.baseUrl;
    try {
      const search = await client.search(pubmedTerm(req.query, req.filters), {
        retmax: req.limit,
        sort: req.sort === 'date' ? 'pub_date' : 'relevance',
        mindate: req.from || undefined,
        maxdate: req.to || undefined,
        signal: req.signal,
      });
      const info = {
        total: search.count,
        queryTranslation: search.queryTranslation,
        warnings: search.warnings.concat(search.phrasesNotFound.length ? ['Not found: ' + search.phrasesNotFound.join(', ')] : []),
        phrasesNotFound: search.phrasesNotFound,
        urls: [base + 'esearch.fcgi'],
      };
      if (!search.ids.length) {
        let suggestion = null;
        try { suggestion = await client.spell(req.query, { signal: req.signal }); } catch (e) { if (isAbortError(e)) throw e; }
        return Object.assign(info, { records: [], suggestion, requests: client.requestCount });
      }
      const articles = await client.fetchArticles(search.ids, {
        signal: req.signal,
        batchSize: Math.min(500, req.source.pageSize || 200),
        onProgress: (done, total) => req.progress(done, total),
      });
      info.urls.push(base + 'efetch.fcgi');
      return Object.assign(info, { records: articles.map(pubmedRecord), requests: client.requestCount });
    } catch (err) {
      throw sourceError(err);
    }
  },
};
