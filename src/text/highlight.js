/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Finds where cluster labels occur in a text, matching words by stem so
 * that "Breast Cancers" in an abstract lights up for the label
 * "Breast Cancer".
 */

import { tokenize, prepareText } from './tokenizer.js';
import { getLanguage } from './language.js';
import { TYPE_MASK, isWordType } from './token-types.js';

/**
 * Returns highlight spans [{ start, end, term }] over prepareText(text)
 * for the content words of `terms` (an array of label strings). Adjacent
 * matches of the same term (with only stop words between them) are joined
 * into one span. `term` is the index of the matching label.
 */
export function highlightSpans(text, terms, language = 'en') {
  const lang = getLanguage(language);
  const stemToTerm = new Map();
  (terms || []).forEach((term, i) => {
    tokenize(String(term), (img, t) => {
      if (!isWordType(t & TYPE_MASK)) return;
      const lw = img.toLowerCase();
      if (lang.stopwords.has(lw)) return;
      const s = lang.stem(lw, img) || lw;
      if (!stemToTerm.has(s)) stemToTerm.set(s, i);
    });
  });
  const spans = [];
  if (stemToTerm.size === 0) return spans;
  let open = null;
  tokenize(text, (img, t, start, end) => {
    const type = t & TYPE_MASK;
    if (!isWordType(type)) { open = null; return; }
    const lw = img.toLowerCase();
    if (lang.stopwords.has(lw)) return; // stop words may sit inside a span
    const s = lang.stem(lw, img) || lw;
    let term = stemToTerm.get(s);
    if (term === undefined && lw.indexOf('-') > 0) {
      // "breast-cancer" matches "Breast Cancer" when every part matches the same label.
      const parts = img.split('-').filter(Boolean);
      const hits = parts.map((part) => {
        const pl = part.toLowerCase();
        return lang.stopwords.has(pl) ? -2 : stemToTerm.get(lang.stem(pl, part) || pl);
      }).filter((h) => h !== -2);
      if (hits.length > 1 && hits.every((h) => h !== undefined && h === hits[0])) term = hits[0];
    }
    if (term === undefined) { open = null; return; }
    if (open && open.term === term) {
      open.end = end;
    } else {
      open = { start, end, term };
      spans.push(open);
    }
  });
  return spans;
}

/** Escapes text for HTML. */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Returns HTML for `text` with label matches wrapped in
 * <mark data-term="i">…</mark>. All text is escaped.
 */
export function highlightHtml(text, terms, language = 'en', tag = 'mark') {
  const s = prepareText(text);
  const spans = highlightSpans(s, terms, language);
  let out = '';
  let pos = 0;
  for (const sp of spans) {
    out += escapeHtml(s.slice(pos, sp.start));
    out += '<' + tag + ' data-term="' + sp.term + '">' + escapeHtml(s.slice(sp.start, sp.end)) + '</' + tag + '>';
    pos = sp.end;
  }
  return out + escapeHtml(s.slice(pos));
}
