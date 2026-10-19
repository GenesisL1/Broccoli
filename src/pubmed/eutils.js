/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * NCBI E-utilities client for PubMed, made for the browser: no server,
 * CORS-friendly "simple" requests only (GET, or POST with a form body),
 * NCBI's rate limits respected (3 requests/s, 10 with an API key),
 * retries with backoff on 429/5xx, cancellation through AbortSignal.
 *
 * Usage policy: https://www.ncbi.nlm.nih.gov/books/NBK25497/ — identify
 * your tool and give a contact e-mail; get an API key for higher limits.
 */

import { parsePubmedXml, parseSpellXml, parseSearchXml, toDocuments } from './records.js';

export const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
export const PUBMED_SORTS = Object.freeze(['relevance', 'pub_date', 'Author', 'JournalName']);
export const DATE_TYPES = Object.freeze(['pdat', 'edat', 'mdat']);

export class EutilsError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'EutilsError';
    Object.assign(this, details);
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(abortError()); return; }
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

function abortError() {
  try {
    return new DOMException('The operation was aborted.', 'AbortError');
  } catch (e) {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    return err;
  }
}

function encodeParams(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
    .join('&');
}

export class PubMedClient {
  /**
   * options = {
   *   apiKey, email, tool = 'broccoli',
   *   baseUrl = EUTILS_BASE (point it at your own proxy if you prefer),
   *   requestsPerSecond (default 3, or 10 with an apiKey or a proxy baseUrl),
   *   maxRetries = 4, timeout = 45000 (ms), fetch (custom fetch implementation)
   * }
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || null;
    this.email = options.email || null;
    this.tool = options.tool || 'broccoli';
    const base = options.baseUrl || EUTILS_BASE;
    // A plain base gets a trailing slash; a proxy base ending in "=" or "?" is used as is.
    this.baseUrl = /[/=?]$/.test(base) ? base : base + '/';
    // Behind a proxy the proxy enforces NCBI's limit (with its own key, perhaps),
    // so the client only caps itself at the keyed rate.
    this.requestsPerSecond = options.requestsPerSecond || (this.apiKey || this.baseUrl !== EUTILS_BASE ? 10 : 3);
    this.maxRetries = options.maxRetries == null ? 4 : options.maxRetries;
    this.timeout = options.timeout || 45000;
    this._fetch = options.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    if (!this._fetch) throw new Error('PubMedClient needs a fetch implementation');
    this._nextSlot = 0;
    this._queue = Promise.resolve();
    this.requestCount = 0;
  }

  _commonParams() {
    return { tool: this.tool, email: this.email, api_key: this.apiKey };
  }

  /** Waits for the next request slot under the rate limit. */
  _slot(signal) {
    const interval = Math.ceil(1000 / this.requestsPerSecond) + 15;
    const turn = this._queue.then(async () => {
      const wait = this._nextSlot - Date.now();
      if (wait > 0) await sleep(wait, signal);
      this._nextSlot = Date.now() + interval;
    });
    this._queue = turn.catch(() => {});
    return turn;
  }

  /**
   * Performs one E-utilities request with rate limiting and retries.
   * Returns the response body as text.
   */
  async request(utility, params, { method = 'GET', signal } = {}) {
    const all = Object.assign({}, params, this._commonParams());
    const query = encodeParams(all);
    const url = this.baseUrl + utility;
    const joiner = url.indexOf('?') >= 0 ? '&' : '?';
    let attempt = 0;
    for (;;) {
      await this._slot(signal);
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const onAbort = () => controller && controller.abort();
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      const timer = controller ? setTimeout(() => controller.abort(), this.timeout) : null;
      let response = null, networkError = null, body = null;
      try {
        this.requestCount++;
        const init = { method, signal: controller ? controller.signal : undefined };
        if (method === 'POST') {
          init.body = query;
          init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
          response = await this._fetch(url, init);
        } else {
          response = await this._fetch(url + joiner + query, init);
        }
        // The body is read under the same timeout and cancellation as the headers.
        if (response.ok) body = await response.text();
      } catch (err) {
        networkError = err;
      } finally {
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
      if (signal && signal.aborted) throw abortError();
      if (networkError) {
        // CORS refusals and offline errors look alike; do not retry them for long.
        if (attempt >= Math.min(2, this.maxRetries)) {
          throw new EutilsError('Could not reach NCBI E-utilities (' + (networkError.message || networkError) + ')', { utility, cause: networkError, network: true });
        }
      } else if (response.ok) {
        return body;
      } else {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt >= this.maxRetries) {
          let detail = '';
          try { detail = (await response.text()).slice(0, 300); } catch (e) { /* ignore */ }
          throw new EutilsError('E-utilities ' + utility + ' failed with HTTP ' + response.status + (detail ? ': ' + detail : ''), { utility, status: response.status });
        }
      }
      attempt++;
      let delay = Math.min(8000, 600 * Math.pow(2, attempt - 1));
      const retryAfter = response && response.headers && response.headers.get ? response.headers.get('Retry-After') : null;
      if (retryAfter && Number.isFinite(+retryAfter)) delay = Math.max(delay, +retryAfter * 1000);
      await sleep(delay, signal);
    }
  }

  /**
   * ESearch. options = { retmax = 100, retstart = 0, sort = 'relevance',
   *   datetype = 'pdat', mindate, maxdate (YYYY or YYYY/MM/DD), reldate (days),
   *   field, useHistory = false, signal }
   * Returns { count, ids, retmax, retstart, webEnv, queryKey, queryTranslation,
   *   translations, warnings, errors, phrasesNotFound }.
   */
  async search(term, options = {}) {
    if (!term || !String(term).trim()) throw new EutilsError('Empty query');
    const params = {
      db: 'pubmed',
      term: String(term).trim(),
      retmode: 'json',
      retmax: Math.max(0, Math.min(10000, options.retmax == null ? 100 : options.retmax)),
      retstart: options.retstart || 0,
      // Sent even for "relevance": ESearch's own default order is not guaranteed to be Best Match.
      sort: options.sort || 'relevance',
      field: options.field,
      usehistory: options.useHistory ? 'y' : undefined,
    };
    if (options.mindate || options.maxdate) {
      params.datetype = options.datetype || 'pdat';
      params.mindate = options.mindate || '1800';
      params.maxdate = options.maxdate || '3000';
    } else if (options.reldate) {
      params.datetype = options.datetype || 'pdat';
      params.reldate = options.reldate;
    }
    const body = await this.request('esearch.fcgi', params, { signal: options.signal });
    let json = null;
    try {
      json = JSON.parse(body);
    } catch (e) {
      const parsed = parseSearchXml(body);
      if (parsed) return Object.assign({ translations: [] }, parsed);
      throw new EutilsError('Unexpected ESearch response');
    }
    if (json.error) throw new EutilsError('ESearch: ' + json.error, { utility: 'esearch.fcgi' });
    const r = json.esearchresult || {};
    if (r.ERROR) throw new EutilsError('ESearch: ' + r.ERROR, { utility: 'esearch.fcgi' });
    const warnings = [];
    const wl = r.warninglist || {};
    for (const k of ['outputmessages', 'phrasesignored', 'quotedphrasesnotfound']) {
      if (Array.isArray(wl[k])) warnings.push(...wl[k]);
    }
    const el = r.errorlist || {};
    return {
      count: parseInt(r.count, 10) || 0,
      retmax: parseInt(r.retmax, 10) || 0,
      retstart: parseInt(r.retstart, 10) || 0,
      ids: Array.isArray(r.idlist) ? r.idlist.map(String) : [],
      webEnv: r.webenv || null,
      queryKey: r.querykey || null,
      queryTranslation: r.querytranslation || null,
      translations: Array.isArray(r.translationset) ? r.translationset.map((t) => ({ from: t.from, to: t.to })) : [],
      warnings,
      errors: [].concat(el.fieldsnotfound || []).filter(Boolean),
      phrasesNotFound: [].concat(el.phrasesnotfound || []).filter(Boolean),
    };
  }

  /**
   * EFetch PubMed records for a list of PMIDs, in batches (POST), keeping
   * the order of `ids`. options = { batchSize = 200, signal, onProgress(done, total) }.
   */
  async fetchArticles(ids, options = {}) {
    const list = [...new Set((ids || []).map(String).filter((id) => /^\d+$/.test(id)))];
    const batchSize = Math.max(1, Math.min(500, options.batchSize || 200));
    const byId = new Map();
    let done = 0;
    if (options.onProgress) options.onProgress(0, list.length);
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      const xml = await this.request('efetch.fcgi', {
        db: 'pubmed',
        id: batch.join(','),
        retmode: 'xml',
        rettype: 'abstract',
      }, { method: 'POST', signal: options.signal });
      const { articles, error } = parsePubmedXml(xml);
      if (error && articles.length === 0) throw new EutilsError('EFetch: ' + error, { utility: 'efetch.fcgi' });
      for (const a of articles) byId.set(a.pmid, a);
      done += batch.length;
      if (options.onProgress) options.onProgress(Math.min(done, list.length), list.length);
    }
    return list.map((id) => byId.get(id)).filter(Boolean);
  }

  /** ESpell: a suggested correction for the query, or null. */
  async spell(term, options = {}) {
    const xml = await this.request('espell.fcgi', { db: 'pubmed', term: String(term) }, { signal: options.signal });
    return parseSpellXml(xml);
  }

  /**
   * Search, then fetch the matching records. Same options as search() plus
   * fetchArticles() options. Returns { search, articles }.
   */
  async searchAndFetch(term, options = {}) {
    const search = await this.search(term, options);
    const articles = search.ids.length ? await this.fetchArticles(search.ids, options) : [];
    return { search, articles };
  }
}

/** Convenience wrapper: search PubMed and return { search, articles, documents }. */
export async function searchPubMed(term, options = {}) {
  const client = options.client || new PubMedClient(options);
  const { search, articles } = await client.searchAndFetch(term, options);
  return { search, articles, documents: toDocuments(articles, options) };
}
