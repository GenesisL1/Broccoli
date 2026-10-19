/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Language components: everything language-specific the clustering pipeline
 * needs (a stemmer, a stop word set, stop label patterns). New languages are
 * added with registerLanguage().
 */

import { stemEnglish } from './stemmer-english.js';
import {
  STOPWORDS, STOPLABELS, BIOMEDICAL_STOPWORDS, BIOMEDICAL_STOPLABELS,
} from './lexicon-english.js';
import {
  stemGerman, stemFrench, stemSpanish, stemItalian, stemPortuguese, stemDutch, stemRussian,
} from './stemmers-snowball.js';
import {
  STOPWORDS_DE, STOPWORDS_FR, STOPWORDS_ES, STOPWORDS_IT, STOPWORDS_PT, STOPWORDS_NL, STOPWORDS_RU,
  STOPLABELS_DE, STOPLABELS_FR, STOPLABELS_ES, STOPLABELS_IT, STOPLABELS_PT, STOPLABELS_NL, STOPLABELS_RU,
} from './lexicon-european.js';

const HAS_DIGIT = /\p{N}/u;
// "SNPs", "RCTs", "mRNAs", "siRNAs": an upper-case core with a plural s.
const PLURAL_ACRONYM = /^[\p{L}\p{N}-]*\p{Lu}[\p{Lu}\p{N}-]*\p{Lu}s$/u;
const ALL_UPPER = /^[\p{Lu}\p{N}+-]+$/u;
const LETTER_TAIL = /^(.*-)(\p{Ll}+)$/u;

/**
 * Stems a word for English. `lower` is the lower-cased word, `image` its most
 * frequent original form. Acronyms and tokens with digits are not stemmed
 * (only a plural "s" on an acronym is removed: "SNPs" → "snp"); for
 * hyphenated words only the last, alphabetic part is stemmed.
 */
function englishStem(lower, image) {
  if (image && image.length > 1) {
    if (PLURAL_ACRONYM.test(image)) return lower.slice(0, -1);
    if (ALL_UPPER.test(image) && /\p{Lu}/u.test(image)) return lower;
  }
  if (HAS_DIGIT.test(lower)) return lower;
  if (lower.indexOf('-') >= 0) {
    const m = LETTER_TAIL.exec(lower);
    return m ? m[1] + stemEnglish(m[2]) : lower;
  }
  if (lower.indexOf("'") >= 0 || lower.indexOf('.') >= 0) {
    const stripped = lower.replace(/'s$|s'$|'$/u, (s) => (s === "s'" ? 's' : ''));
    if (stripped.indexOf('.') >= 0 || stripped.indexOf("'") >= 0) return stripped;
    return stemEnglish(stripped);
  }
  return stemEnglish(lower);
}

/**
 * Wraps a Snowball stemmer for words as they come out of the tokenizer:
 * acronyms and tokens with digits stay as they are, and in hyphenated words
 * only the last, alphabetic part is stemmed.
 */
export function wordStemmer(stem) {
  return function (lower, image) {
    if (image && image.length > 1 && ALL_UPPER.test(image) && /\p{Lu}/u.test(image)) return lower;
    if (HAS_DIGIT.test(lower)) return lower;
    if (lower.indexOf('-') >= 0) {
      const m = LETTER_TAIL.exec(lower);
      return m ? m[1] + stem(m[2]) : lower;
    }
    return stem(lower);
  };
}

function compileLabelPatterns(patterns) {
  return patterns.map((p) => (p instanceof RegExp ? p : new RegExp(p, 'iu')));
}

/** Lower-cased stop words, each with an apostrophe also in its typographic form. */
function stopwordSet(list) {
  const set = new Set();
  for (const w of list || []) {
    const lw = w.toLowerCase();
    set.add(lw);
    if (lw.indexOf("'") >= 0) set.add(lw.replace(/'/g, '\u2019'));
  }
  return set;
}

function makeLanguage(def) {
  return Object.freeze({
    code: def.code,
    name: def.name || def.code,
    stem: def.stem || ((lower) => lower),
    stopwords: stopwordSet(def.stopwords),
    stoplabels: compileLabelPatterns(def.stoplabels || []),
    labelFormat: def.labelFormat || 'title',
    otherTopics: def.otherTopics || 'Other topics',
    extras: Object.freeze(
      Object.fromEntries(
        Object.entries(def.extras || {}).map(([k, v]) => [
          k,
          Object.freeze({
            stopwords: stopwordSet(v.stopwords),
            stoplabels: compileLabelPatterns(v.stoplabels || []),
          }),
        ])
      )
    ),
  });
}

const registry = new Map();
// Languages defined in this module; a worker started from the library knows only these.
const builtIn = new Set();
let initializing = true;

/**
 * Registers a language. `def` = { code, name, stem(lower, image) → string,
 * stopwords: string[], stoplabels: (string|RegExp)[], labelFormat: default label style,
 * otherTopics: name of the "Other topics" group, extras: { name: { stopwords, stoplabels } } }.
 */
export function registerLanguage(def) {
  if (!def || !def.code) throw new Error('registerLanguage: a language needs a code');
  const lang = makeLanguage(def);
  registry.set(def.code, lang);
  if (initializing) builtIn.add(def.code);
  else builtIn.delete(def.code);
  return lang;
}

/** True for a language code that ships with the library and was not redefined. */
export function isBuiltInLanguage(code) {
  return typeof code === 'string' && builtIn.has(code);
}

export function getLanguage(code) {
  if (code && typeof code === 'object' && code.stopwords instanceof Set) return code;
  const lang = registry.get(code || 'en');
  if (!lang) throw new Error('Unknown language "' + code + '". Known: ' + [...registry.keys()].join(', '));
  return lang;
}

export function listLanguages() {
  return [...registry.values()].map((l) => ({ code: l.code, name: l.name, extras: Object.keys(l.extras) }));
}

// The "sentence" label style suits languages that do not use title case
// (and keeps German nouns capitalized, since words keep their usual spelling).
const SNOWBALL_LANGUAGES = [
  ['de', 'German', stemGerman, STOPWORDS_DE, STOPLABELS_DE, 'Sonstige Themen'],
  ['fr', 'French', stemFrench, STOPWORDS_FR, STOPLABELS_FR, 'Autres sujets'],
  ['es', 'Spanish', stemSpanish, STOPWORDS_ES, STOPLABELS_ES, 'Otros temas'],
  ['it', 'Italian', stemItalian, STOPWORDS_IT, STOPLABELS_IT, 'Altri argomenti'],
  ['pt', 'Portuguese', stemPortuguese, STOPWORDS_PT, STOPLABELS_PT, 'Outros tópicos'],
  ['nl', 'Dutch', stemDutch, STOPWORDS_NL, STOPLABELS_NL, 'Overige onderwerpen'],
  ['ru', 'Russian', stemRussian, STOPWORDS_RU, STOPLABELS_RU, 'Другие темы'],
];

registerLanguage({
  code: 'en',
  name: 'English',
  stem: englishStem,
  stopwords: STOPWORDS,
  stoplabels: STOPLABELS,
  extras: {
    biomedical: { stopwords: BIOMEDICAL_STOPWORDS, stoplabels: BIOMEDICAL_STOPLABELS },
  },
});

for (const [code, name, stem, stopwords, stoplabels, otherTopics] of SNOWBALL_LANGUAGES) {
  registerLanguage({ code, name, stem: wordStemmer(stem), stopwords, stoplabels, labelFormat: 'sentence', otherTopics });
}

registerLanguage({
  code: 'none',
  name: 'No language processing',
  stem: (lower) => lower,
  stopwords: [],
  stoplabels: [],
  labelFormat: 'sentence',
});

initializing = false;
