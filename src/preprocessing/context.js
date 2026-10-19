/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * The preprocessing context: tokens, words (case-normalized), stems and the
 * flags that later stages need. Everything is kept in parallel typed arrays
 * (a "column store"), so the algorithms can work on integer indices
 * instead of strings.
 */

import { tokenize } from '../text/tokenizer.js';
import { TYPE_MASK, TF_COMMON_WORD, TF_QUERY_WORD, TF_SENTENCE_END, isWordType } from '../text/token-types.js';
import { compileWordFilters } from './dictionaries.js';

export const TT_SEPARATOR = 0;

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/**
 * Creates an empty context.
 * input = { documents: string[][] (field texts per document), fieldNames: string[],
 *           titleField: number (index into fieldNames or -1), language }
 */
export function createContext(input) {
  return {
    language: input.language,
    fieldNames: input.fieldNames,
    titleField: input.titleField == null ? -1 : input.titleField,
    documentCount: input.documents.length,
    documents: input.documents,
    tokens: null,
    words: null,
    stems: null,
    phrases: null,
    labels: null,
    queryStems: new Set(),
    timings: {},
    _t0: now(),
  };
}

export function markTime(ctx, name, start) {
  ctx.timings[name] = Math.round((now() - start) * 100) / 100;
  return now();
}

export { now };

/** Stage 1: tokenize all fields of all documents into one token stream. */
export function tokenizeDocuments(ctx) {
  const image = [];
  const type = [];
  const doc = [];
  const field = [];
  const docs = ctx.documents;
  for (let d = 0; d < docs.length; d++) {
    const fields = docs[d];
    for (let f = 0; f < fields.length; f++) {
      const text = fields[f];
      if (text == null || text === '') continue;
      let added = 0;
      tokenize(text, (img, t) => {
        image.push(img);
        type.push(t);
        doc.push(d);
        field.push(f);
        added++;
      });
      if (added > 0) {
        image.push(null);
        type.push(TT_SEPARATOR);
        doc.push(d);
        field.push(f);
      }
    }
  }
  ctx.tokens = {
    count: image.length,
    image,
    type: Uint16Array.from(type),
    doc: Int32Array.from(doc),
    field: Uint8Array.from(field),
    wordIndex: new Int32Array(image.length).fill(-1),
  };
}

/**
 * Stage 2: case normalization. Tokens that differ only in case become one
 * word; the word's image is its most frequent original form. Words appearing
 * in fewer than `wordDfThreshold` documents are dropped (their tokens act as
 * separators).
 */
export function normalizeCase(ctx, wordDfThreshold = 1) {
  const tokens = ctx.tokens;
  const n = tokens.count;
  const keyToWord = new Map();
  const lower = [];
  const variants = [];
  const wordType = [];
  const tokenWord = tokens.wordIndex;

  // Capitals at the start of a sentence say nothing about a word's usual
  // spelling, so those occurrences only count when there are no others.
  let initial = true;
  for (let i = 0; i < n; i++) {
    const t = tokens.type[i] & TYPE_MASK;
    if (!isWordType(t)) {
      if (t === TT_SEPARATOR || (tokens.type[i] & TF_SENTENCE_END) !== 0) initial = true;
      continue;
    }
    const weight = initial ? 1 / 1024 : 1;
    initial = false;
    const img = tokens.image[i];
    const key = img.toLowerCase();
    let w = keyToWord.get(key);
    if (w === undefined) {
      w = lower.length;
      keyToWord.set(key, w);
      lower.push(key);
      variants.push(new Map());
      wordType.push(t);
    }
    const v = variants[w];
    v.set(img, (v.get(img) || 0) + weight);
    tokenWord[i] = w;
  }

  let W = lower.length;
  // Document frequencies, needed for the threshold.
  let df = new Int32Array(W);
  {
    const lastDoc = new Int32Array(W).fill(-1);
    for (let i = 0; i < n; i++) {
      const w = tokenWord[i];
      if (w < 0) continue;
      const d = tokens.doc[i];
      if (lastDoc[w] !== d) { lastDoc[w] = d; df[w]++; }
    }
  }

  if (wordDfThreshold > 1) {
    const remap = new Int32Array(W).fill(-1);
    let k = 0;
    for (let w = 0; w < W; w++) if (df[w] >= wordDfThreshold) remap[w] = k++;
    if (k < W) {
      for (let i = 0; i < n; i++) if (tokenWord[i] >= 0) tokenWord[i] = remap[tokenWord[i]];
      const keep = (arr) => arr.filter((_, w) => remap[w] >= 0);
      const lower2 = keep(lower), variants2 = keep(variants), types2 = keep(wordType);
      lower.length = 0; lower.push(...lower2);
      variants.length = 0; variants.push(...variants2);
      wordType.length = 0; wordType.push(...types2);
      const df2 = new Int32Array(k);
      for (let w = 0; w < W; w++) if (remap[w] >= 0) df2[remap[w]] = df[w];
      df = df2;
      W = k;
    }
  }

  const image = new Array(W);
  for (let w = 0; w < W; w++) {
    let best = null, bestCount = -1;
    for (const [img, c] of variants[w]) {
      if (c > bestCount) { best = img; bestCount = c; }
    }
    image[w] = best;
  }

  const tf = new Int32Array(W);
  const fieldMask = new Uint32Array(W);
  const lists = new Array(W);
  for (let w = 0; w < W; w++) lists[w] = [];
  const lastDoc = new Int32Array(W).fill(-1);
  for (let i = 0; i < n; i++) {
    const w = tokenWord[i];
    if (w < 0) continue;
    const d = tokens.doc[i];
    tf[w]++;
    fieldMask[w] |= 1 << tokens.field[i];
    const list = lists[w];
    if (lastDoc[w] !== d) { lastDoc[w] = d; list.push(d, 1); }
    else list[list.length - 1]++;
  }
  const tfByDocument = lists.map((l) => Int32Array.from(l));

  ctx.words = {
    count: W,
    image,
    lower,
    type: Uint16Array.from(wordType),
    tf,
    df,
    tfByDocument,
    fieldMask,
    stemIndex: new Int32Array(W),
  };
}

/** Stage 3: stemming. Words with equal stems share a stem entry. */
export function stemWords(ctx) {
  const { words, tokens, language } = ctx;
  const W = words.count;
  const keyToStem = new Map();
  const stemImage = [];
  for (let w = 0; w < W; w++) {
    let s = language.stem(words.lower[w], words.image[w]);
    if (!s) s = words.lower[w];
    let idx = keyToStem.get(s);
    if (idx === undefined) {
      idx = stemImage.length;
      keyToStem.set(s, idx);
      stemImage.push(s);
    }
    words.stemIndex[w] = idx;
  }
  const S = stemImage.length;
  const mostFrequentWord = new Int32Array(S).fill(-1);
  const tf = new Int32Array(S);
  const fieldMask = new Uint32Array(S);
  for (let w = 0; w < W; w++) {
    const s = words.stemIndex[w];
    tf[s] += words.tf[w];
    fieldMask[s] |= words.fieldMask[w];
    const cur = mostFrequentWord[s];
    if (cur < 0 || words.tf[w] > words.tf[cur]) mostFrequentWord[s] = w;
  }
  // Per-document (doc, tf, fieldMask) triples, from the token stream.
  const lists = new Array(S);
  for (let s = 0; s < S; s++) lists[s] = [];
  const lastDoc = new Int32Array(S).fill(-1);
  const df = new Int32Array(S);
  for (let i = 0; i < tokens.count; i++) {
    const w = tokens.wordIndex[i];
    if (w < 0) continue;
    const s = words.stemIndex[w];
    const d = tokens.doc[i];
    const list = lists[s];
    if (lastDoc[s] !== d) {
      lastDoc[s] = d;
      df[s]++;
      list.push(d, 1, 1 << tokens.field[i]);
    } else {
      list[list.length - 2]++;
      list[list.length - 1] |= 1 << tokens.field[i];
    }
  }
  ctx.stems = {
    count: S,
    image: stemImage,
    mostFrequentWord,
    tf,
    df,
    fieldMask,
    tfByDocument: lists.map((l) => Int32Array.from(l)),
  };
}

/**
 * Stage 4: stop word marking from the language, optional language extras
 * (e.g. "biomedical") and per-request word dictionaries.
 */
export function markStopWords(ctx, options = {}) {
  const { words, language } = ctx;
  const extraSets = [];
  for (const name of options.extras || []) {
    const extra = language.extras[name];
    if (extra) extraSets.push(extra.stopwords);
  }
  const custom = compileWordFilters(options.wordFilters);
  for (let w = 0; w < words.count; w++) {
    const lw = words.lower[w];
    let common = language.stopwords.has(lw);
    for (let k = 0; !common && k < extraSets.length; k++) common = extraSets[k].has(lw);
    if (!common && custom) common = custom(lw);
    if (common) words.type[w] |= TF_COMMON_WORD;
  }
}

/**
 * Converts a search query into plain query-hint text: strips PubMed and
 * Lucene-style syntax (field tags, boolean operators, quotes, wildcards).
 */
export function queryHintText(query) {
  return String(query || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(?:AND|OR|NOT)\b/g, ' ')
    .replace(/[A-Za-z]+:(?=\S)/g, ' ')
    .replace(/[()"*{}~^+]/g, ' ');
}

/** Stage 5: words of the query hint (matched by stem) get TF_QUERY_WORD. */
export function markQueryWords(ctx, queryHint) {
  const { words, language } = ctx;
  const stems = new Set();
  if (queryHint) {
    tokenize(queryHintText(queryHint), (img, t) => {
      if (!isWordType(t & TYPE_MASK)) return;
      const lw = img.toLowerCase();
      if (language.stopwords.has(lw)) return;
      stems.add(language.stem(lw, img) || lw);
      stems.add('=' + lw);
    });
  }
  ctx.queryStems = stems;
  if (stems.size === 0) return;
  for (let w = 0; w < words.count; w++) {
    const s = ctx.stems ? ctx.stems.image[words.stemIndex[w]] : null;
    if ((s !== null && stems.has(s)) || stems.has('=' + words.lower[w])) {
      words.type[w] |= TF_QUERY_WORD;
    }
  }
}
