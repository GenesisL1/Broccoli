/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Token types (low byte) and token flags (high bits).
 */

export const TT_TERM = 1;          // ordinary word: "cluster", "p53", "mRNA"
export const TT_NUMERIC = 2;       // number: "12", "3.5", "95%", "1,000"
export const TT_PUNCTUATION = 3;   // any punctuation or symbol
export const TT_HYPHTERM = 4;      // hyphenated term: "IL-6", "non-small-cell"
export const TT_ACRONYM = 5;       // dotted acronym or abbreviation: "U.S.", "e.g."
export const TT_URL = 6;           // URL, DOI or e-mail address
export const TYPE_MASK = 0xff;

export const TF_SENTENCE_END = 0x100;  // punctuation that ends a sentence
export const TF_COMMON_WORD = 0x200;   // stop word (from the language or a dictionary)
export const TF_QUERY_WORD = 0x400;    // word from the query hint

export function tokenType(flags) {
  return flags & TYPE_MASK;
}

export function isCommon(flags) {
  return (flags & TF_COMMON_WORD) !== 0;
}

export function isQueryWord(flags) {
  return (flags & TF_QUERY_WORD) !== 0;
}

export function isNumeric(flags) {
  return (flags & TYPE_MASK) === TT_NUMERIC;
}

/** Token types that become words (as opposed to separators). */
export function isWordType(type) {
  return type === TT_TERM || type === TT_NUMERIC || type === TT_HYPHTERM || type === TT_ACRONYM;
}
