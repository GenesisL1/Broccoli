/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Search sources: any search API, behind one small interface.
 *
 * A source is a plain object. It describes itself (name, sorts, filters,
 * settings, examples) and fetches records in one of two ways:
 *
 *   fetchPage(request, page) → { records, total, cursor }
 *     one page of results; Broccoli asks for pages until it has `limit`
 *     records. page = { page (1, 2, …), size, offset, cursor } where cursor
 *     is what the previous page returned. Return cursor: null when there
 *     are no more pages, or leave it out for APIs paged by number or offset.
 *
 *   search(request) → { records, total, … }
 *     the whole search at once, for APIs that need several steps (PubMed:
 *     ESearch for the IDs, then EFetch for the records).
 *
 * request = { source, query, limit, sort, filters, from, to, settings,
 *   signal, request (fetch helper: json(url), text(url), rate-limited),
 *   progress(done, total), fetch }
 *
 * Records can be partial: makeRecord() completes them. searchSource() runs
 * a search on any source and returns complete records ready for
 * toDocuments() and cluster().
 */

import { SourceError, createRequester, abortError } from './http.js';
import { makeRecord } from './records.js';

const registry = new Map();
const defined = new WeakSet();
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

function option(o) {
  if (typeof o === 'string') return { id: o, label: o };
  return Object.assign({}, o, { id: String(o.id), label: o.label || String(o.id) });
}

/**
 * Checks a source definition and fills in its defaults. Returns a frozen
 * copy; searchSource() accepts it directly, registerSource() lists it.
 */
export function defineSource(def) {
  if (defined.has(def)) return def;
  if (!def || typeof def !== 'object') throw new TypeError('A source definition must be an object');
  if (!ID.test(String(def.id || ''))) {
    throw new TypeError('A source needs an id of lower-case letters, digits and hyphens (got ' + JSON.stringify(def.id) + ')');
  }
  if (typeof def.search !== 'function' && typeof def.fetchPage !== 'function') {
    throw new TypeError('Source "' + def.id + '" needs a fetchPage(request, page) or a search(request) function');
  }
  const maxLimit = Math.max(1, Math.floor(def.maxLimit || 1000));
  const out = Object.assign({}, def, {
    name: def.name || def.id,
    shortName: def.shortName || def.name || def.id,
    description: def.description || '',
    group: def.group || 'Other',
    kinds: (def.kinds || ['article']).slice(),
    sorts: (def.sorts && def.sorts.length ? def.sorts : [{ id: 'relevance', label: 'Best match' }]).map(option),
    filters: (def.filters || []).map((f) => Object.assign(option(f), { help: f.help || '', default: !!f.default })),
    settings: (def.settings || []).map((s) => Object.assign(option(s), { type: s.type || 'text', help: s.help || '' })),
    examples: (def.examples || []).map((e) => (Array.isArray(e) ? { query: e[0], weight: e[1] || 1 } : typeof e === 'string' ? { query: e, weight: 1 } : Object.assign({ weight: 1 }, e))),
    years: !!def.years,
    pageSize: Math.max(1, Math.floor(def.pageSize || 100)),
    maxLimit,
    defaultLimit: Math.min(maxLimit, Math.max(1, Math.floor(def.defaultLimit || 200))),
    rateLimit: def.rateLimit || 3,
    browser: def.browser !== false,
  });
  Object.freeze(out);
  defined.add(out);
  return out;
}

/** Adds a source to the list (replacing one with the same id) and returns it. */
export function registerSource(def) {
  const source = defineSource(def);
  registry.set(source.id, source);
  return source;
}

export function unregisterSource(id) {
  return registry.delete(id);
}

/** A registered source by id, or null. */
export function getSource(id) {
  return registry.get(id) || null;
}

/** The registered sources, in the order they were registered. */
export function listSources() {
  return [...registry.values()];
}

function resolve(source) {
  if (typeof source === 'string') {
    const s = getSource(source);
    if (!s) throw new SourceError('Unknown source "' + source + '"', { kind: 'config', source });
    return s;
  }
  return defineSource(source);
}

function year(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1000 && n <= 3000 ? n : null;
}

async function pageThrough(source, request) {
  const size = Math.min(source.pageSize, request.limit);
  const records = [];
  let first = null, cursor = null, total = null;
  request.progress(0, request.limit);
  for (let page = 1; records.length < request.limit && page <= 500; page++) {
    const res = (await source.fetchPage(request, { page, size, offset: records.length, cursor })) || {};
    if (request.signal && request.signal.aborted) throw abortError();
    if (page === 1) {
      first = res;
      total = Number.isFinite(+res.total) && res.total !== null ? +res.total : null;
    }
    const got = res.records || [];
    records.push(...got);
    const want = total === null ? request.limit : Math.min(request.limit, total);
    request.progress(Math.min(records.length, want), want);
    if (!got.length || res.cursor === null) break;
    if (total !== null && records.length >= total) break;
    if (res.cursor === undefined && got.length < size) break;
    cursor = res.cursor === undefined ? null : res.cursor;
  }
  return Object.assign({}, first, { records, total: total === null ? records.length : total, cursor: undefined });
}

/**
 * Runs a search on a source (an id or a definition). options = {
 *   limit (default: the source's), sort, filters: { id: true|false },
 *   from, to (years), settings (the source's own: API keys, e-mail…),
 *   signal, onProgress(done, total), fetch, timeout, maxRetries,
 *   requestsPerSecond (instead of the source's own limit: for a proxy
 *   with limits of its own, or for tests)
 * }
 * Returns { source, name, query, total, records, queryTranslation,
 *   suggestion, warnings, phrasesNotFound, language, requests, urls }.
 */
export async function searchSource(source, query, options = {}) {
  const def = resolve(source);
  const text = String(query == null ? '' : query).trim();
  if (!text) throw new SourceError('Type something to search for', { kind: 'query', source: def.id });
  if (options.signal && options.signal.aborted) throw abortError();
  const limit = Math.max(1, Math.min(def.maxLimit, Math.floor(+options.limit || def.defaultLimit)));
  const sort = (def.sorts.find((s) => s.id === options.sort) || def.sorts[0]).id;
  const filters = {};
  for (const f of def.filters) {
    filters[f.id] = options.filters && options.filters[f.id] !== undefined ? !!options.filters[f.id] : f.default;
  }
  const settings = Object.assign({}, options.settings);
  const rps = options.requestsPerSecond || (typeof def.rateLimit === 'function' ? def.rateLimit(settings) : def.rateLimit);
  const requester = createRequester({
    source: def.id, name: def.name, fetch: options.fetch, signal: options.signal,
    requestsPerSecond: rps, gateKey: def.service || def.id, timeout: options.timeout, maxRetries: options.maxRetries,
  });
  const request = {
    source: def,
    query: text,
    limit,
    sort,
    filters,
    from: def.years ? year(options.from) : null,
    to: def.years ? year(options.to) : null,
    settings,
    signal: options.signal,
    fetch: options.fetch,
    request: requester,
    progress: (done, total) => { if (options.onProgress) options.onProgress(done, total); },
  };
  const raw = (def.search ? await def.search(request) : await pageThrough(def, request)) || {};
  if (options.signal && options.signal.aborted) throw abortError();
  const seen = new Set();
  const records = [];
  for (const r of raw.records || []) {
    const rec = makeRecord(def.id, r);
    const key = rec.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(rec);
    if (records.length >= limit) break;
  }
  return {
    source: def.id,
    name: def.name,
    query: text,
    total: Number.isFinite(+raw.total) && raw.total !== null ? +raw.total : records.length,
    records,
    queryTranslation: raw.queryTranslation || null,
    suggestion: raw.suggestion || null,
    warnings: raw.warnings || [],
    phrasesNotFound: raw.phrasesNotFound || [],
    language: raw.language || null,
    requests: requester.count + (raw.requests || 0),
    urls: requester.urls.concat(raw.urls || []),
  };
}
