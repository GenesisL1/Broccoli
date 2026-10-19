/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * A source from configuration alone, for any search API that answers in
 * JSON: an address template, where the results are, and which field is
 * which. For anything more involved, write fetchPage() yourself.
 *
 *   jsonSource({
 *     id: 'my-index', name: 'My index',
 *     url: 'https://example.org/api/search?q={query}&size={size}&from={offset}',
 *     results: 'hits.items',        // where the list of results is
 *     total: 'hits.total',          // optional
 *     next: 'hits.next_cursor',     // optional: a cursor, sent as {cursor}
 *     fields: { id: 'id', title: 'title', abstract: 'summary', url: 'link',
 *               year: 'year', authors: 'authors', doi: 'doi', venue: 'journal' },
 *   })
 *
 * Placeholders: {query} {size} {offset} {page} {cursor} {sort} {from} {to}
 * and {settings.name} for the source's own settings (an API key, say).
 * Every value is URL-encoded; a missing one becomes empty. Paths are dotted
 * ("a.b.0.c") or functions of the JSON. The url can also be a function
 * (request, page) → address.
 */

import { SourceError } from './http.js';
import { markupToText, markupSections } from './markup.js';
import { parseDisplayName, nameFromParts } from './records.js';

/** The value at a dotted path ("a.b.0.c"), or what a function returns. */
export function getPath(obj, path) {
  if (typeof path === 'function') return path(obj);
  if (path == null || path === '') return undefined;
  let v = obj;
  for (const key of String(path).split('.')) {
    if (v == null) return undefined;
    v = v[key];
  }
  return v;
}

function fill(template, values) {
  return template.replace(/\{([\w.]+)\}/g, (m, key) => {
    const v = getPath(values, key);
    return v == null ? '' : encodeURIComponent(String(v));
  });
}

function authorsOf(v) {
  if (v == null) return [];
  if (typeof v === 'string') return v.split(/\s*;\s*|\s+and\s+/).filter(Boolean).map((n) => parseDisplayName(n));
  if (!Array.isArray(v)) return [];
  return v.map((a) => {
    if (typeof a === 'string') return parseDisplayName(a);
    if (a && (a.lastName || a.collective)) return a;
    if (a && (a.family || a.familyName)) return nameFromParts(a.family || a.familyName, a.given || a.givenName);
    return a && (a.name || a.display_name || a.full_name) ? parseDisplayName(a.name || a.display_name || a.full_name) : null;
  }).filter(Boolean);
}

/** Checks a jsonSource configuration and returns a source definition. */
export function jsonSource(config) {
  if (!config || (typeof config.url !== 'string' && typeof config.url !== 'function')) {
    throw new TypeError('jsonSource needs a url template (or a function that builds the address)');
  }
  const fields = Object.assign({ id: 'id', title: 'title', abstract: 'abstract', url: 'url' }, config.fields || {});
  const urlOf = typeof config.url === 'function'
    ? config.url
    : (req, page) => fill(config.url, {
      query: req.query, size: page.size, offset: page.offset, page: page.page,
      cursor: page.cursor == null ? config.firstCursor || '' : page.cursor,
      sort: req.sort, from: req.from, to: req.to, settings: req.settings,
    });
  const def = Object.assign({}, config, {
    group: config.group || 'Your sources',
    async fetchPage(req, page) {
      const json = await req.request.json(urlOf(req, page), { signal: req.signal });
      const list = getPath(json, config.results || 'results');
      if (!Array.isArray(list)) {
        throw new SourceError((config.name || config.id) + ' answered without a list of results at "' + (config.results || 'results') + '"', { source: config.id, kind: 'parse' });
      }
      const records = list.map((item) => {
        if (typeof config.map === 'function') return config.map(item);
        const rec = {};
        for (const [key, path] of Object.entries(fields)) {
          const v = getPath(item, path);
          if (v === undefined || v === null) continue;
          if (key === 'authors') rec.authors = authorsOf(v);
          else if (key === 'venue') rec.journal = { title: String(v) };
          else if (key === 'abstract') rec.abstractSections = markupSections(Array.isArray(v) ? v.join(' ') : String(v));
          else if (key === 'title') rec.title = markupToText(Array.isArray(v) ? v[0] : String(v));
          else if (key === 'keywords') rec.keywords = Array.isArray(v) ? v.map(String) : String(v).split(/\s*[;,]\s*/);
          else rec[key] = v;
        }
        return rec;
      });
      const total = config.total ? getPath(json, config.total) : undefined;
      const result = { records, total: total != null ? +total : null };
      if (config.next) {
        const next = getPath(json, config.next);
        result.cursor = next ? String(next) : null;
      }
      return result;
    },
  });
  delete def.url;
  delete def.results;
  delete def.total;
  delete def.next;
  delete def.map;
  delete def.fields;
  delete def.firstCursor;
  return def;
}
