/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * A Unicode-aware tokenizer for Latin, Greek and Cyrillic scripts, tuned for
 * scientific prose: it keeps "IL-6", "COVID-19", "CD4+", "TNF-α" and
 * "Crohn's" as single tokens, recognizes numbers, URLs, DOIs and e-mail
 * addresses, and emits every other non-space character as punctuation.
 */

import {
  TT_TERM, TT_NUMERIC, TT_PUNCTUATION, TT_HYPHTERM, TT_ACRONYM, TT_URL,
  TF_SENTENCE_END,
} from './token-types.js';

const HYPHENS = '\\-\\u2010\\u2011\\u2012\\u2013';
const WORD_CHAR = '\\p{L}\\p{N}\\p{M}_';

// Alternatives are tried in order at every position (sticky regex).
const TOKEN_RE = new RegExp(
  [
    '(\\s+)',
    '((?:https?|ftp)://[^\\s<>"\']+|www\\.[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)+(?:/[^\\s<>"\']*)?|' +
      '[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.(?:com|org|net|gov|edu|int|info|io|eu|uk|de|fr|jp|cn|ca|au|nl|ch|se)(?![\\p{L}\\p{N}])(?:/[^\\s<>"\']*)?)',
    '([\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)+)',
    '(10\\.\\d{4,9}/[^\\s<>"\']+)',
    '((?:\\p{L}\\.){2,})',
    '(\\p{N}+(?:[.,]\\p{N}+)*(?:[' + HYPHENS + ']\\p{N}+(?:[.,]\\p{N}+)*)*%?(?![' + WORD_CHAR + ']|[' + HYPHENS + '][\\p{L}]))',
    '([' + WORD_CHAR + ']+(?:[' + HYPHENS + '\'\\u2019][' + WORD_CHAR + ']+)*\\+*)',
    '([^\\s])',
  ].join('|'),
  'uy'
);

const TRAILING_URL_PUNCT = /[.,;:!?)\]}'"»”’]+$/u;
const PURE_NUMBER = /^\p{N}+(?:[.,]\p{N}+)*(?:-\p{N}+(?:[.,]\p{N}+)*)*%?$/u;
const HYPHEN_VARIANTS = /[‐‑‒–]/g;
const INVISIBLE = /[­​-‍⁠﻿]/g;

/** Normalizes text before tokenization: NFC, no soft hyphens or zero-width characters. */
export function prepareText(text) {
  let s = text == null ? '' : String(text);
  if (s.normalize) s = s.normalize('NFC');
  return s.replace(INVISIBLE, '');
}

/**
 * Tokenizes `text`, calling onToken(image, type, start, end) for every token.
 * `type` is a token type from token-types.js, possibly combined with
 * TF_SENTENCE_END for sentence-final punctuation.
 */
export function tokenize(text, onToken) {
  const s = prepareText(text);
  const re = TOKEN_RE;
  re.lastIndex = 0;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (m === null) {
      // Cannot happen (the last alternative matches any non-space char),
      // but never loop forever.
      pos++;
      continue;
    }
    let image = m[0];
    const start = pos;
    pos = re.lastIndex;
    if (m[1] !== undefined) continue;

    if (m[2] !== undefined || m[4] !== undefined) {
      const trimmed = image.replace(TRAILING_URL_PUNCT, '');
      if (trimmed.length < image.length && trimmed.length > 0) {
        pos = start + trimmed.length;
        image = trimmed;
      }
      onToken(image, TT_URL, start, pos);
    } else if (m[3] !== undefined) {
      onToken(image, TT_URL, start, pos);
    } else if (m[5] !== undefined) {
      onToken(image, TT_ACRONYM, start, pos);
    } else if (m[6] !== undefined) {
      if (/[\u2010-\u2013]/.test(image)) image = image.replace(HYPHEN_VARIANTS, '-');
      onToken(image, TT_NUMERIC, start, pos);
    } else if (m[7] !== undefined) {
      let type = TT_TERM;
      if (/[‐-–’]/.test(image)) {
        image = image.replace(HYPHEN_VARIANTS, '-').replace(/’/g, "'");
      }
      if (image.indexOf('-') >= 0) {
        type = PURE_NUMBER.test(image) ? TT_NUMERIC : TT_HYPHTERM;
      }
      onToken(image, type, start, pos);
    } else {
      const c = image;
      const type = c === '.' || c === '!' || c === '?' || c === '…'
        ? TT_PUNCTUATION | TF_SENTENCE_END
        : TT_PUNCTUATION;
      onToken(c, type, start, pos);
    }
  }
}

/** Convenience: returns an array of { image, type, start, end }. */
export function tokenizeToArray(text) {
  const out = [];
  tokenize(text, (image, type, start, end) => out.push({ image, type, start, end }));
  return out;
}
