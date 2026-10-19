/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Frequent phrase discovery over the stemmed token stream with a suffix
 * array, after Zhang & Dong (2004), "Semantic, Hierarchical, Online
 * Clustering of Web Search Results". Each LCP interval is a repeated,
 * right-complete phrase; phrases whose every occurrence is preceded by the
 * same content word are dropped in favour of the longer phrase (left
 * completeness). Stop words get special treatment because a label can
 * never start or end with one: phrases may not start with a stop word,
 * trailing stop words are trimmed, and a shared preceding stop word does not
 * make a phrase incomplete.
 */

import { suffixArray, lcpArray, forEachLcpInterval } from '../util/suffix-array.js';
import { TF_COMMON_WORD } from '../text/token-types.js';

/**
 * Builds the integer sequence the suffix array is computed on: stem indices
 * for words, a fresh (unique) symbol for every run of separators.
 * Returns { seq, posToToken, alphabet, stemCount }.
 */
export function buildStemSequence(ctx) {
  const { tokens, words, stems } = ctx;
  const n = tokens.count;
  const seq = new Int32Array(n + 1);
  const posToToken = new Int32Array(n + 1);
  let len = 0;
  let next = stems.count;
  let lastWasSeparator = true;
  for (let i = 0; i < n; i++) {
    const w = tokens.wordIndex[i];
    if (w >= 0) {
      seq[len] = words.stemIndex[w];
      posToToken[len] = i;
      len++;
      lastWasSeparator = false;
    } else if (!lastWasSeparator) {
      seq[len] = next++;
      posToToken[len] = i;
      len++;
      lastWasSeparator = true;
    }
  }
  return {
    seq: seq.slice(0, len),
    posToToken: posToToken.slice(0, len),
    alphabet: Math.max(next, 1),
    stemCount: stems.count,
  };
}

/** Isolates the per-occurrence bookkeeping shared by phrase extraction and STC. */
export function collectOccurrences(ctx, built, SA, lb, rb, length) {
  const { tokens } = ctx;
  const tokenDoc = tokens.doc;
  const tokenWord = tokens.wordIndex;
  const tokenImage = tokens.image;
  const posToToken = built.posToToken;
  // Sequence positions follow token order, which follows document order.
  const positions = SA.slice(lb, rb + 1).sort();
  const pairs = [];
  // The phrase's image is its most frequent original spelling (case included).
  const variants = new Map();
  let lastDoc = -1;
  for (let k = 0; k < positions.length; k++) {
    const p = positions[k];
    const d = tokenDoc[posToToken[p]];
    if (d !== lastDoc) {
      pairs.push(d, 1);
      lastDoc = d;
    } else {
      pairs[pairs.length - 1]++;
    }
    let key = tokenImage[posToToken[p]];
    for (let j = 1; j < length; j++) key += '\u0001' + tokenImage[posToToken[p + j]];
    const v = variants.get(key);
    if (v) v.count++;
    else variants.set(key, { count: 1, position: p });
  }
  let best = null;
  for (const v of variants.values()) if (best === null || v.count > best.count) best = v;
  const wordIndices = new Int32Array(length);
  const images = new Array(length);
  for (let j = 0; j < length; j++) {
    const tok = posToToken[best.position + j];
    wordIndices[j] = tokenWord[tok];
    images[j] = tokenImage[tok];
  }
  return {
    wordIndices,
    images,
    tf: positions.length,
    df: pairs.length / 2,
    tfByDocument: Int32Array.from(pairs),
  };
}

/**
 * Extracts phrases of 2..maxPhraseLength words occurring at least twice and
 * in at least `phraseDfThreshold` documents. Fills ctx.phrases.
 */
export function extractPhrases(ctx, options = {}) {
  const maxLength = Math.max(2, options.maxPhraseLength || 8);
  const minDf = Math.max(1, options.phraseDfThreshold || 1);
  const { words, stems } = ctx;
  const built = buildStemSequence(ctx);
  const { seq } = built;
  const S = stems.count;

  const out = { wordIndices: [], images: [], stemIndices: [], tf: [], df: [], tfByDocument: [] };
  if (seq.length > 1) {
    const SA = suffixArray(seq, built.alphabet);
    const LCP = lcpArray(seq, SA);

    // Whether a stem is a stop word: a stem is "common" when its most frequent word is.
    const stemCommon = new Uint8Array(S);
    for (let s = 0; s < S; s++) {
      stemCommon[s] = (words.type[stems.mostFrequentWord[s]] & TF_COMMON_WORD) !== 0 ? 1 : 0;
    }

    forEachLcpInterval(LCP, 2, (lcp, lb, rb, parentLcp) => {
      const start = SA[lb];
      if (stemCommon[seq[start]]) return;
      // Trim trailing stop words; the trimmed phrase must still be deeper than the parent.
      let length = lcp;
      while (length > 0 && stemCommon[seq[start + length - 1]]) length--;
      if (length < 2) return;
      if (length < lcp && length <= parentLcp) return;

      // Left completeness: skip if every occurrence follows the same content word.
      if (length < maxLength) {
        const first = SA[lb] > 0 ? seq[SA[lb] - 1] : -1;
        if (first >= 0 && first < S && !stemCommon[first]) {
          let same = true;
          for (let k = lb + 1; k <= rb; k++) {
            const p = SA[k];
            if (p === 0 || seq[p - 1] !== first) { same = false; break; }
          }
          if (same) return;
        }
      }

      const occ = collectOccurrences(ctx, built, SA, lb, rb, length);
      if (occ.df < minDf) return;
      out.wordIndices.push(occ.wordIndices);
      out.images.push(occ.images);
      out.stemIndices.push(seq.slice(start, start + length));
      out.tf.push(occ.tf);
      out.df.push(occ.df);
      out.tfByDocument.push(occ.tfByDocument);
    }, maxLength);
  }

  ctx.phrases = {
    count: out.wordIndices.length,
    wordIndices: out.wordIndices,
    images: out.images,
    stemIndices: out.stemIndices,
    tf: Int32Array.from(out.tf),
    df: Int32Array.from(out.df),
    tfByDocument: out.tfByDocument,
  };
}
