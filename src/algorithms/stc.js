/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Suffix Tree Clustering (Zamir & Etzioni 1998, "Web Document Clustering: A
 * Feasibility Demonstration"), with these refinements: stop-word aware
 * phrases, stem-equivalent base cluster merging and
 * multi-phrase cluster descriptions.
 *
 *  1. Every repeated phrase (an internal node of the generalized suffix tree
 *     of all sentences, found here as an LCP interval of a suffix array) that
 *     appears in enough documents becomes a base cluster.
 *  2. Base clusters are scored by document count and phrase length.
 *  3. Base clusters whose document sets overlap in both directions above the
 *     merge threshold are linked; connected components become clusters.
 *  4. A cluster is described by its best few, non-redundant phrases.
 */

import { preprocess, contextStats } from '../preprocessing/pipeline.js';
import { buildStemSequence, collectOccurrences } from '../preprocessing/phrases.js';
import { createLabelAcceptor, formatWords } from '../preprocessing/labels.js';
import { suffixArray, lcpArray, forEachLcpInterval } from '../util/suffix-array.js';
import { BitSet } from '../util/bitset.js';
import { TF_COMMON_WORD, TF_QUERY_WORD } from '../text/token-types.js';
import { createUnionFind } from './common.js';
import { now } from '../preprocessing/context.js';

export const STC_DEFAULTS = Object.freeze({
  documentCountBoost: 1,
  optimalPhraseLength: 3,
  optimalPhraseLengthDev: 2,
  singleTermBoost: 0.5,
  maxBaseClusters: 300,
  minBaseClusterScore: 2,
  minBaseClusterSize: 2,
  maxClusters: 15,
  mergeThreshold: 0.6,
  maxPhrases: 3,
  maxPhraseOverlap: 0.6,
  mostGeneralPhraseCoverage: 0.5,
  maxWordsPerLabel: 4,
  ignoreWordIfInHigherDocsPercent: 0.9,
  ignoreWordIfInFewerDocs: 2,
  mergeStemEquivalentBaseClusters: true,
  preprocessing: {
    wordDfThreshold: 1,
    labelFilters: {
      queryLabelFilter: true,
      stopWordLabelFilter: true,
      numericLabelFilter: true,
      genitiveLabelFilter: true,
      stopLabelFilter: true,
      minLengthLabelFilter: true,
      minLength: 3,
    },
  },
});

/**
 * Base cluster score: phrase-length factor × documentCount^documentCountBoost.
 * The length factor is a Gaussian around optimalPhraseLength (counting
 * content words only); single words get singleTermBoost when it is positive.
 */
export function baseClusterScore(effectiveLength, documentCount, p) {
  let lengthFactor;
  if (effectiveLength === 1 && p.singleTermBoost > 0) {
    lengthFactor = p.singleTermBoost;
  } else {
    const dev = Math.max(1e-9, p.optimalPhraseLengthDev);
    const x = effectiveLength - p.optimalPhraseLength;
    lengthFactor = Math.exp(-(x * x) / (2 * dev * dev));
  }
  return lengthFactor * Math.pow(documentCount, p.documentCountBoost);
}

/** True if `needle` occurs as a contiguous run inside `hay`. */
function containsRun(hay, needle) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** True if two stem sequences share a contiguous run of at least `min` stems. */
function sharesRun(a, b, min) {
  for (let i = 0; i + min <= a.length; i++) {
    if (containsRun(b, a.subarray ? a.subarray(i, i + min) : a.slice(i, i + min))) return true;
  }
  return false;
}

function overlapRatio(a, b) {
  // |a ∩ b| / min(|a|, |b|) over sets of stems.
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.max(1, Math.min(a.size, b.size));
}

/**
 * Runs STC. input = { documents: string[][], fieldNames, titleField, language }.
 */
export function stc(input, params, options = {}) {
  const t0 = now();
  const pp = params.preprocessing;
  const ctx = preprocess(input, {
    wordDfThreshold: pp.wordDfThreshold,
    queryHint: params.queryHint,
    extras: params.extras,
    wordFilters: params.dictionaries && params.dictionaries.wordFilters,
    phrases: false,
    labels: false,
    onProgress: options.onProgress,
  });
  const timings = { preprocessing: ctx.timings };
  const result = { clusters: [], context: ctx, stats: contextStats(ctx), timings };
  const N = ctx.documentCount;
  if (N === 0 || ctx.words.count === 0) {
    timings.total = Math.round(now() - t0);
    return result;
  }
  const progress = options.onProgress || (() => {});
  progress('baseClusters', 0);
  let t = now();

  const { words, stems } = ctx;
  const S = stems.count;
  const stemCommon = new Uint8Array(S);
  const stemIgnored = new Uint8Array(S);
  const stemQuery = new Uint8Array(S);
  for (let s = 0; s < S; s++) {
    const w = stems.mostFrequentWord[s];
    stemCommon[s] = (words.type[w] & TF_COMMON_WORD) !== 0 ? 1 : 0;
    stemQuery[s] = (words.type[w] & TF_QUERY_WORD) !== 0 ? 1 : 0;
    const df = stems.df[s];
    stemIgnored[s] = df / N > params.ignoreWordIfInHigherDocsPercent || df < params.ignoreWordIfInFewerDocs ? 1 : 0;
  }

  const acceptLabel = createLabelAcceptor(ctx, {
    labelFilters: pp.labelFilters,
    extras: params.extras,
    dictionaryLabelFilters: params.dictionaries && params.dictionaries.labelFilters,
  });

  const built = buildStemSequence(ctx);
  const seq = built.seq;
  const baseClusters = [];
  if (seq.length > 1) {
    const SA = suffixArray(seq, built.alphabet);
    const LCP = lcpArray(seq, SA);
    const maxWords = Math.max(1, params.maxWordsPerLabel);
    forEachLcpInterval(LCP, 1, (lcp, lb, rb, parentLcp) => {
      if (rb - lb + 1 < params.minBaseClusterSize) return;
      const start = SA[lb];
      if (stemCommon[seq[start]]) return;
      let length = lcp;
      while (length > 0 && stemCommon[seq[start + length - 1]]) length--;
      if (length < 1) return;
      if (length < lcp && length <= parentLcp) return;
      let effective = 0, nonQuery = 0;
      for (let j = 0; j < length; j++) {
        const s = seq[start + j];
        if (stemCommon[s]) continue;
        if (!stemIgnored[s]) effective++;
        if (!stemQuery[s]) nonQuery++;
      }
      if (effective === 0) return;
      if (nonQuery === 0 && ctx.queryStems.size > 0) return;
      const occ = collectOccurrences(ctx, built, SA, lb, rb, length);
      if (occ.df < params.minBaseClusterSize) return;
      if (!acceptLabel(occ.wordIndices)) return;
      const score = baseClusterScore(effective, occ.df, params);
      if (score < params.minBaseClusterScore) return;
      const docs = new BitSet(N);
      for (let i = 0; i < occ.tfByDocument.length; i += 2) docs.set(occ.tfByDocument[i]);
      const content = new Set();
      for (let j = 0; j < length; j++) {
        const s = seq[start + j];
        if (!stemCommon[s]) content.add(s);
      }
      baseClusters.push({
        wordIndices: occ.wordIndices,
        images: occ.images,
        sequence: seq.slice(start, start + length),
        stems: content,
        docs,
        size: occ.df,
        score,
        phrases: null,
      });
    }, maxWords);
  }
  result.stats.baseClusters = baseClusters.length;

  // Merge stem-equivalent base clusters ("clustering algorithm" / "algorithms for clustering").
  let bases = baseClusters;
  if (params.mergeStemEquivalentBaseClusters && bases.length > 1) {
    const groups = new Map();
    for (const b of bases) {
      const key = [...b.stems].sort((x, y) => x - y).join(',');
      const g = groups.get(key);
      if (!g) groups.set(key, b);
      else {
        g.docs.or(b.docs);
        if (b.score > g.score) {
          g.wordIndices = b.wordIndices;
          g.images = b.images;
          g.sequence = b.sequence;
          g.score = b.score;
        }
        g.size = g.docs.cardinality();
      }
    }
    bases = [...groups.values()];
  }

  bases.sort((a, b) => b.score - a.score || b.size - a.size);
  if (bases.length > params.maxBaseClusters) bases = bases.slice(0, params.maxBaseClusters);
  timings.baseClusters = Math.round(now() - t);

  progress('merge', 0);
  t = now();
  const B = bases.length;
  const uf = createUnionFind(B);
  const threshold = params.mergeThreshold;
  for (let i = 0; i < B; i++) {
    for (let j = i + 1; j < B; j++) {
      const inter = bases[i].docs.intersectionCount(bases[j].docs);
      if (inter === 0) continue;
      if (inter / bases[i].size > threshold && inter / bases[j].size > threshold) uf.union(i, j);
    }
  }

  const clusters = [];
  for (const group of uf.groups()) {
    group.sort((a, b) => bases[b].score - bases[a].score || a - b);
    const docs = bases[group[0]].docs.clone();
    let score = 0;
    for (const g of group) {
      docs.or(bases[g].docs);
      score += bases[g].score;
    }
    const size = docs.cardinality();
    // A phrase contained in a longer phrase of the same cluster that covers
    // most of its documents is a truncated form of it: skip it as a label.
    const truncated = new Set();
    for (const g of group) {
      const b = bases[g];
      for (const h of group) {
        if (h === g) continue;
        const c = bases[h];
        if (c.sequence.length > b.sequence.length && c.size >= 0.6 * b.size && containsRun(c.sequence, b.sequence)) {
          truncated.add(g);
          break;
        }
      }
    }
    const selected = [];
    for (const g of group) {
      if (selected.length >= params.maxPhrases) break;
      if (truncated.has(g) && group.some((h) => !truncated.has(h))) continue;
      const b = bases[g];
      if (selected.length > 0 && b.size / size < params.mostGeneralPhraseCoverage) continue;
      if (selected.some((s) => overlapRatio(s.stems, b.stems) > params.maxPhraseOverlap || sharesRun(s.sequence, b.sequence, 2))) continue;
      selected.push(b);
    }
    clusters.push({
      labels: selected.map((b) => formatWords(
        b.images,
        Array.from(b.wordIndices, (w) => (words.type[w] & TF_COMMON_WORD) !== 0),
        params.labelFormat
      )),
      documents: docs.toArray(),
      score,
      baseClusters: group.length,
    });
  }
  clusters.sort((a, b) => b.score - a.score || b.documents.length - a.documents.length);
  result.clusters = clusters.slice(0, params.maxClusters);
  timings.merge = Math.round(now() - t);
  timings.total = Math.round(now() - t0);
  return result;
}
