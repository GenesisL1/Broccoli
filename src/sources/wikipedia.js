/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Wikipedia: a general search, through the MediaWiki action API of any
 * language edition. Each result is a page title and the snippet of text
 * around the match, which is what web search results clustering was made
 * for.
 * https://www.mediawiki.org/wiki/API:Search
 */

import { buildUrl, SourceError } from './http.js';
import { markupToText } from './markup.js';
import { parseIsoDate } from './records.js';

/** Wikipedia editions in the languages Broccoli can cluster. */
export const WIKIPEDIA_LANGUAGES = Object.freeze({
  en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano', pt: 'Português', nl: 'Nederlands', ru: 'Русский',
});

function edition(lang) {
  return Object.prototype.hasOwnProperty.call(WIKIPEDIA_LANGUAGES, lang) ? lang : 'en';
}

/** A page's address on its Wikipedia. */
export function wikipediaUrl(title, lang = 'en') {
  const path = encodeURIComponent(String(title).replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':').replace(/%2C/g, ',');
  return 'https://' + edition(lang) + '.wikipedia.org/wiki/' + path;
}

/** One search result as a record. */
export function wikipediaRecord(r, lang = 'en') {
  const url = wikipediaUrl(r.title, lang);
  const edited = parseIsoDate(r.timestamp);
  return {
    source: 'wikipedia',
    id: String(r.pageid != null ? r.pageid : r.title),
    type: 'page',
    title: r.title,
    abstract: markupToText(r.snippet || '').replace(/\s*…\s*/g, ' … ').trim(),
    authors: [],
    authorString: '',
    url,
    links: [{ label: 'Wikipedia', text: edition(lang) + '.wikipedia.org', url }],
    tags: r.wordcount ? [String(r.wordcount).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' words'] : [],
    languages: [edition(lang)],
    extra: { words: r.wordcount != null ? r.wordcount : null, edited: edited ? r.timestamp : null },
  };
}

export const wikipediaSource = {
  id: 'wikipedia',
  name: 'Wikipedia',
  description: 'A general search of Wikipedia in English or seven other languages: page titles and the text around each match.',
  homepage: 'https://www.wikipedia.org/',
  docs: 'https://www.mediawiki.org/wiki/API:Search',
  terms: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
  group: 'General',
  kinds: ['page'],
  idLabel: 'Page',
  syntax: 'Wikipedia search syntax: "quoted phrases", -excluded words, intitle:, and the rest of CirrusSearch.',
  placeholder: 'renaissance architecture',
  examples: [
    ['renaissance architecture', 30], ['jazz', 27], ['volcano', 25], ['silk road', 22], ['photosynthesis', 20],
    ['byzantine empire', 18], ['machine learning', 16], ['coffee', 14], ['norse mythology', 12],
  ],
  sorts: [{ id: 'relevance', label: 'Best match' }],
  filters: [],
  settings: [
    { id: 'lang', label: 'Wikipedia language', type: 'select', options: Object.keys(WIKIPEDIA_LANGUAGES).map((k) => ({ id: k, label: WIKIPEDIA_LANGUAGES[k] })), default: 'en', help: 'Topics are labelled in the same language.' },
  ],
  years: false,
  maxLimit: 2000,
  defaultLimit: 200,
  pageSize: 500,
  rateLimit: 5,

  async fetchPage(req, page) {
    const lang = edition(req.settings.lang);
    const url = buildUrl('https://' + lang + '.wikipedia.org/w/api.php', {
      action: 'query',
      list: 'search',
      srsearch: req.query,
      srlimit: page.size,
      sroffset: page.offset || undefined,
      srprop: 'snippet|wordcount|timestamp',
      srinfo: 'totalhits|suggestion',
      format: 'json',
      formatversion: 2,
      origin: '*',
    });
    const json = await req.request.json(url, { signal: req.signal });
    if (json.error) {
      throw new SourceError('Wikipedia could not run the search: ' + (json.error.info || json.error.code), { source: 'wikipedia', kind: 'query', url });
    }
    const q = json.query || {};
    const info = q.searchinfo || {};
    return {
      total: info.totalhits != null ? info.totalhits : null,
      records: (q.search || []).map((r) => wikipediaRecord(r, lang)),
      suggestion: info.suggestion || null,
      language: lang,
    };
  },
};
