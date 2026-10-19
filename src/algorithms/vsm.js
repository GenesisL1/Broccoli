/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Vector space model: the term-document matrix (stems × documents) shared
 * by Lingo and Bisecting k-means.
 */

import { SparseMatrix } from '../matrix/matrix.js';
import { TF_COMMON_WORD } from '../text/token-types.js';

export const TERM_WEIGHTINGS = Object.freeze({
  /** Damped frequency ln(1 + tf) times inverse document frequency ln(n / df). */
  'log-tfidf': (tf, df, n) => (df <= 0 || tf <= 0 ? 0 : Math.log(1 + tf) * Math.log(n / df)),
  /** Raw frequency times inverse document frequency. */
  'linear-tfidf': (tf, df, n) => (df <= 0 ? 0 : tf * Math.log(n / df)),
  /** Raw term frequency. */
  tf: (tf) => tf,
});

export function termWeighting(name) {
  const fn = TERM_WEIGHTINGS[name || 'log-tfidf'];
  if (!fn) throw new Error('Unknown term weighting "' + name + '". Known: ' + Object.keys(TERM_WEIGHTINGS).join(', '));
  return fn;
}

/** Stems that label candidates are made of (content words only). */
export function labelStems(ctx) {
  const { words, labels } = ctx;
  const W = words.count;
  const set = new Set();
  for (let i = 0; i < labels.count; i++) {
    const f = labels.featureIndex[i];
    if (f < W) {
      set.add(words.stemIndex[f]);
    } else {
      for (const w of ctx.phrases.wordIndices[f - W]) {
        if ((words.type[w] & TF_COMMON_WORD) === 0) set.add(words.stemIndex[w]);
      }
    }
  }
  return Int32Array.from([...set].sort((a, b) => a - b));
}

/**
 * Builds the term-document matrix over the given candidate stems.
 * options = { termWeighting, titleWordsBoost, maxWordDf, maximumMatrixSize }
 * Stems found in more than maxWordDf of the documents are skipped; the
 * remaining stems are ranked by weight and only as many rows as fit in
 * maximumMatrixSize (rows × documents) are kept. Each (stem, document)
 * weight is boosted when the stem occurs in that document's title field.
 * Columns are L2-normalized.
 *
 * Returns { A: SparseMatrix, rowStems: Int32Array, stemToRow: Int32Array }.
 */
export function buildTermDocumentMatrix(ctx, candidateStems, options = {}) {
  const N = ctx.documentCount;
  const { stems } = ctx;
  const weight = termWeighting(options.termWeighting);
  const titleBoost = options.titleWordsBoost == null ? 2 : options.titleWordsBoost;
  const maxWordDf = options.maxWordDf == null ? 0.9 : options.maxWordDf;
  const maxSize = options.maximumMatrixSize == null ? 37500 : options.maximumMatrixSize;
  const titleBit = ctx.titleField >= 0 ? 1 << ctx.titleField : 0;

  const eligible = [];
  for (const s of candidateStems) {
    const df = stems.df[s];
    if (df > 0 && df / N <= maxWordDf) eligible.push(s);
  }
  // Rank stems by their total weight in the matrix (the sum of the row), so
  // that the rows kept under the size limit are the ones carrying the most
  // mass; a word repeated many times in a single document does not crowd out
  // a word used across many documents.
  const globalWeight = new Map();
  for (const s of eligible) {
    const df = stems.df[s];
    const list = stems.tfByDocument[s];
    let total = 0;
    for (let i = 0; i < list.length; i += 3) {
      let v = weight(list[i + 1], df, N);
      if (titleBit && (list[i + 2] & titleBit)) v *= titleBoost;
      total += v;
    }
    globalWeight.set(s, total);
  }
  eligible.sort((a, b) => globalWeight.get(b) - globalWeight.get(a) || a - b);
  const maxRows = Math.max(1, Math.floor(maxSize / Math.max(1, N)));
  const rowStems = Int32Array.from(eligible.slice(0, maxRows));

  const stemToRow = new Int32Array(stems.count).fill(-1);
  rowStems.forEach((s, r) => { stemToRow[s] = r; });

  const columns = new Array(N);
  for (let d = 0; d < N; d++) columns[d] = [];
  for (let r = 0; r < rowStems.length; r++) {
    const s = rowStems[r];
    const df = stems.df[s];
    const list = stems.tfByDocument[s];
    for (let i = 0; i < list.length; i += 3) {
      const d = list[i], tf = list[i + 1], mask = list[i + 2];
      let v = weight(tf, df, N);
      if (titleBit && (mask & titleBit)) v *= titleBoost;
      if (v !== 0) columns[d].push([r, v]);
    }
  }
  const A = SparseMatrix.fromColumns(rowStems.length, columns).normalizeColumns();
  return { A, rowStems, stemToRow };
}
