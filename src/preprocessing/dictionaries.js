/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Per-request dictionaries:
 *
 *   dictionaries: {
 *     wordFilters:  [{ exact: ['foo'] }, { glob: ['http*'] }, { regexp: ['^\\d+mg$'] }],
 *     labelFilters: [{ exact: ['data mining'] }, { glob: ['* information'] }, { regexp: ['^about '] }],
 *   }
 *
 * Word filters mark words as stop words. Label filters reject candidate
 * labels. All matching is case-insensitive. In label globs "*" stands for
 * any number of words; in word globs "*" stands for any characters.
 */

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toRegExp(pattern) {
  if (pattern instanceof RegExp) return pattern;
  let p = String(pattern);
  if (p.startsWith('(?i)')) p = p.slice(4);
  return new RegExp(p, 'iu');
}

function asList(entries) {
  if (!entries) return [];
  return Array.isArray(entries) ? entries : [entries];
}

/** Compiles word filters into a predicate on lower-cased words. */
export function compileWordFilters(entries) {
  const exact = new Set();
  const patterns = [];
  for (const e of asList(entries)) {
    if (typeof e === 'string') { exact.add(e.toLowerCase()); continue; }
    for (const w of asList(e.exact)) exact.add(String(w).toLowerCase());
    for (const g of asList(e.glob)) {
      patterns.push(new RegExp('^' + String(g).toLowerCase().split('*').map(escapeRegExp).join('.*') + '$', 'u'));
    }
    for (const r of asList(e.regexp)) patterns.push(toRegExp(r));
  }
  if (exact.size === 0 && patterns.length === 0) return null;
  return (lower) => {
    if (exact.has(lower)) return true;
    for (let i = 0; i < patterns.length; i++) if (patterns[i].test(lower)) return true;
    return false;
  };
}

/**
 * Label glob → RegExp. "*" as a whole token matches any number of words
 * (including none); "*" inside a token matches any characters of one word.
 */
export function labelGlobToRegExp(glob) {
  const parts = String(glob).toLowerCase().trim().split(/\s+/);
  let src = '^';
  let literalSeen = false;
  for (const part of parts) {
    if (part === '*') {
      src += literalSeen ? '(?: \\S+)*' : '(?:\\S+ )*';
    } else {
      if (literalSeen) src += ' ';
      src += part.split('*').map(escapeRegExp).join('\\S*');
      literalSeen = true;
    }
  }
  if (!literalSeen) return /^.*$/u;
  return new RegExp(src + '$', 'u');
}

/** Compiles label filters into a predicate on lower-cased label text (words joined by spaces). */
export function compileLabelFilters(entries) {
  const exact = new Set();
  const patterns = [];
  for (const e of asList(entries)) {
    if (typeof e === 'string') { exact.add(e.toLowerCase().trim().replace(/\s+/g, ' ')); continue; }
    for (const w of asList(e.exact)) exact.add(String(w).toLowerCase().trim().replace(/\s+/g, ' '));
    for (const g of asList(e.glob)) patterns.push(labelGlobToRegExp(g));
    for (const r of asList(e.regexp)) patterns.push(toRegExp(r));
  }
  if (exact.size === 0 && patterns.length === 0) return null;
  return (label) => {
    if (exact.has(label)) return true;
    for (let i = 0; i < patterns.length; i++) if (patterns[i].test(label)) return true;
    return false;
  };
}
