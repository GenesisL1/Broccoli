/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Lingo (Osiński, Stefanowski & Weiss 2004, "Lingo: Search Results
 * Clustering Algorithm Based on Singular Value Decomposition"): find good,
 * human-readable cluster labels first, then assign documents to them.
 *
 *  1. Preprocess; discover frequent phrases; filter label candidates.
 *  2. Build the term-document matrix A (tf-idf, title boost, unit columns).
 *  3. Factorize A; the leading left vectors are abstract concepts.
 *  4. For every concept pick the label candidate whose term vector is the
 *     closest (cosine), boosting phrases and penalizing overlong ones.
 *  5. The documents of a cluster are the documents of its label; clusters
 *     whose document sets overlap strongly are merged.
 */

import { preprocess, contextStats } from '../preprocessing/pipeline.js';
import { formatLabel } from '../preprocessing/labels.js';
import { TF_COMMON_WORD } from '../text/token-types.js';
import { factorize } from '../matrix/factorization.js';
import { buildTermDocumentMatrix, labelStems, termWeighting } from './vsm.js';
import {
  createUnionFind, sortClusters, phraseLengthPenalty, computeClusterCount,
} from './common.js';
import { now } from '../preprocessing/context.js';

export const LINGO_DEFAULTS = Object.freeze({
  desiredClusterCount: 30,
  scoreWeight: 0,
  clusterBuilder: {
    phraseLabelBoost: 1.5,
    phraseLengthPenaltyStart: 8,
    phraseLengthPenaltyStop: 8,
    clusterMergingThreshold: 0.7,
    labelAssigner: 'unique',
    labelGeneralization: 0,
  },
  matrixBuilder: {
    titleWordsBoost: 2,
    maxWordDf: 0.9,
    maximumMatrixSize: 2500000,
    termWeighting: 'log-tfidf',
  },
  matrixReducer: {
    factorizationFactory: 'svd',
    factorizationQuality: 'high',
    initialization: 'nndsvd',
    seed: 0x5eed,
  },
  preprocessing: {
    wordDfThreshold: 1,
    phraseDfThreshold: 1,
    maxPhraseLength: 8,
    documentAssigner: { exactPhraseAssignment: false, minClusterSize: 2 },
    labelFilters: {
      queryLabelFilter: true,
      stopWordLabelFilter: true,
      numericLabelFilter: true,
      genitiveLabelFilter: true,
      stopLabelFilter: true,
      minLengthLabelFilter: true,
      minLength: 3,
      completeLabelFilter: true,
      labelOverrideThreshold: 0.65,
    },
  },
});

/**
 * Label × concept score matrix. Returns Float64Array (labels × K, row-major),
 * with -Infinity for labels that cannot be scored.
 */
function scoreLabels(ctx, tdm, U, params) {
  const { words, stems, labels } = ctx;
  const W = words.count;
  const K = U.cols;
  const L = labels.count;
  const N = ctx.documentCount;
  const cb = params.clusterBuilder;
  const weight = termWeighting(params.matrixBuilder.termWeighting);
  const scores = new Float64Array(L * K).fill(-Infinity);
  for (let l = 0; l < L; l++) {
    const f = labels.featureIndex[l];
    if (f < W) {
      const row = tdm.stemToRow[words.stemIndex[f]];
      if (row < 0) continue;
      for (let j = 0; j < K; j++) scores[l * K + j] = U.data[row * K + j];
    } else {
      const ws = ctx.phrases.wordIndices[f - W];
      const penalty = phraseLengthPenalty(ws.length, cb.phraseLengthPenaltyStart, cb.phraseLengthPenaltyStop);
      if (penalty === 0) continue;
      // Phrase term vector: content words that are matrix rows, weighted globally.
      const rows = [], vals = [];
      let norm = 0;
      for (const w of ws) {
        if ((words.type[w] & TF_COMMON_WORD) !== 0) continue;
        const s = words.stemIndex[w];
        const row = tdm.stemToRow[s];
        if (row < 0) continue;
        const v = weight(stems.tf[s], stems.df[s], N);
        if (v <= 0) continue;
        const existing = rows.indexOf(row);
        if (existing >= 0) { vals[existing] += v; continue; }
        rows.push(row);
        vals.push(v);
      }
      for (const v of vals) norm += v * v;
      if (rows.length === 0 || norm === 0) continue;
      const scale = (penalty * cb.phraseLabelBoost) / Math.sqrt(norm);
      for (let j = 0; j < K; j++) {
        let s = 0;
        for (let t = 0; t < rows.length; t++) s += vals[t] * U.data[rows[t] * K + j];
        scores[l * K + j] = s * scale;
      }
    }
  }
  return scores;
}

/**
 * Greedy unique assignment: repeatedly take the best (label, concept) pair
 * among unused labels and concepts. Returns arrays indexed by concept.
 */
function assignUnique(scores, L, K) {
  const labelOf = new Int32Array(K).fill(-1);
  const scoreOf = new Float64Array(K);
  // Only a concept's top-K labels can ever be assigned to it.
  const entries = [];
  for (let j = 0; j < K; j++) {
    const top = [];
    for (let l = 0; l < L; l++) {
      const s = scores[l * K + j];
      if (!(s > 0)) continue;
      if (top.length < K) {
        top.push(l);
        if (top.length === K) top.sort((a, b) => scores[b * K + j] - scores[a * K + j]);
      } else if (s > scores[top[K - 1] * K + j]) {
        let pos = K - 1;
        while (pos > 0 && scores[top[pos - 1] * K + j] < s) pos--;
        top.splice(pos, 0, l);
        top.pop();
      }
    }
    for (const l of top) entries.push([scores[l * K + j], l, j]);
  }
  entries.sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2]);
  const used = new Uint8Array(L);
  for (const [s, l, j] of entries) {
    if (labelOf[j] >= 0 || used[l]) continue;
    labelOf[j] = l;
    scoreOf[j] = s;
    used[l] = 1;
  }
  return { labelOf, scoreOf };
}

/**
 * Label generalization, a Broccoli addition (off when `threshold` is 0): a
 * concept trades its label for a shorter phrase contained in it when that
 * phrase scores at least `threshold` times as well and covers at least twice
 * as many documents. It keeps one factorization quirk from turning a large
 * topic into a narrow one ("Breast Cancer Screening", 4 records, instead of
 * "Breast Cancer", 59).
 */
function generalizeLabels(ctx, scores, K, labelOf, scoreOf, threshold) {
  if (!(threshold > 0)) return;
  const W = ctx.words.count;
  const L = ctx.labels.count;
  const used = new Uint8Array(L);
  for (let j = 0; j < K; j++) if (labelOf[j] >= 0) used[labelOf[j]] = 1;
  const seq = new Array(L);
  for (let l = 0; l < L; l++) {
    const f = ctx.labels.featureIndex[l];
    seq[l] = ' ' + (f < W ? String(ctx.words.stemIndex[f])
      : Array.from(ctx.phrases.wordIndices[f - W], (w) => ctx.words.stemIndex[w]).join(' ')) + ' ';
  }
  const support = new Int32Array(L);
  for (let l = 0; l < L; l++) support[l] = ctx.labels.documents[l].cardinality();
  for (let j = 0; j < K; j++) {
    const l = labelOf[j];
    if (l < 0) continue;
    let best = -1, bestSupport = 2 * support[l] - 1;
    for (let m = 0; m < L; m++) {
      if (m === l || used[m] || support[m] <= bestSupport) continue;
      if (seq[m].length >= seq[l].length || seq[l].indexOf(seq[m]) < 0) continue;
      if (!(scores[m * K + j] >= threshold * scoreOf[j])) continue;
      best = m;
      bestSupport = support[m];
    }
    if (best >= 0) {
      used[l] = 0;
      used[best] = 1;
      labelOf[j] = best;
      scoreOf[j] = scores[best * K + j];
    }
  }
}

/** Per-concept best label; concepts may share a label (duplicates removed later). */
function assignSimple(scores, L, K) {
  const labelOf = new Int32Array(K).fill(-1);
  const scoreOf = new Float64Array(K);
  for (let j = 0; j < K; j++) {
    let best = -1, bestScore = 0;
    for (let l = 0; l < L; l++) {
      const s = scores[l * K + j];
      if (s > bestScore) { bestScore = s; best = l; }
    }
    labelOf[j] = best;
    scoreOf[j] = bestScore;
  }
  return { labelOf, scoreOf };
}

/**
 * Runs Lingo. input = { documents: string[][], fieldNames, titleField, language }.
 * Returns { clusters: [{ labels, documents, score, feature, merged }], context, stats, timings }.
 */
export function lingo(input, params, options = {}) {
  const t0 = now();
  const p = params.preprocessing;
  const ctx = preprocess(input, {
    wordDfThreshold: p.wordDfThreshold,
    phraseDfThreshold: p.phraseDfThreshold,
    maxPhraseLength: p.maxPhraseLength,
    queryHint: params.queryHint,
    extras: params.extras,
    wordFilters: params.dictionaries && params.dictionaries.wordFilters,
    labelFilterDictionary: params.dictionaries && params.dictionaries.labelFilters,
    labelFilters: p.labelFilters,
    exactPhraseAssignment: p.documentAssigner.exactPhraseAssignment,
    minClusterSize: p.documentAssigner.minClusterSize,
    phrases: true,
    labels: true,
    onProgress: options.onProgress,
  });
  const timings = { preprocessing: ctx.timings };
  const progress = options.onProgress || (() => {});
  const N = ctx.documentCount;
  const result = { clusters: [], context: ctx, stats: contextStats(ctx), timings };
  if (N === 0 || ctx.labels.count === 0) {
    timings.total = Math.round(now() - t0);
    return result;
  }

  progress('matrix', 0);
  let t = now();
  const tdm = buildTermDocumentMatrix(ctx, labelStems(ctx), params.matrixBuilder);
  timings.matrix = Math.round(now() - t);
  result.stats.matrixRows = tdm.A.rows;
  result.stats.matrixColumns = tdm.A.cols;
  if (tdm.A.rows === 0) {
    timings.total = Math.round(now() - t0);
    return result;
  }

  progress('factorization', 0);
  t = now();
  const desired = computeClusterCount(params.desiredClusterCount, N);
  const k = Math.min(desired, tdm.A.rows, N);
  const mr = params.matrixReducer;
  const { U } = factorize(tdm.A, k, mr.factorizationFactory, {
    quality: mr.factorizationQuality,
    seed: mr.seed,
    init: mr.initialization,
  });
  timings.factorization = Math.round(now() - t);
  result.stats.baseVectors = U.cols;

  progress('labels', 0);
  t = now();
  const L = ctx.labels.count;
  const K = U.cols;
  const scores = scoreLabels(ctx, tdm, U, params);
  const assigner = params.clusterBuilder.labelAssigner === 'simple' ? assignSimple : assignUnique;
  const { labelOf, scoreOf } = assigner(scores, L, K);
  generalizeLabels(ctx, scores, K, labelOf, scoreOf, params.clusterBuilder.labelGeneralization);

  // Candidate clusters, one per labelled concept (duplicate labels collapse).
  const byLabel = new Map();
  for (let j = 0; j < K; j++) {
    const l = labelOf[j];
    if (l < 0) continue;
    const prev = byLabel.get(l);
    if (prev === undefined || scoreOf[j] > prev.score) byLabel.set(l, { label: l, score: scoreOf[j] });
  }
  const raw = [...byLabel.values()].map((c) => ({
    label: c.label,
    score: c.score,
    docs: ctx.labels.documents[c.label].clone(),
  }));

  // Merge clusters with strongly overlapping documents: |A ∩ B| / max(|A|, |B|).
  const threshold = params.clusterBuilder.clusterMergingThreshold;
  const uf = createUnionFind(raw.length);
  const sizes = raw.map((c) => c.docs.cardinality());
  for (let a = 0; a < raw.length; a++) {
    for (let b = a + 1; b < raw.length; b++) {
      const inter = raw[a].docs.intersectionCount(raw[b].docs);
      if (inter === 0) continue;
      if (inter / Math.max(sizes[a], sizes[b]) >= threshold) uf.union(a, b);
    }
  }
  const clusters = [];
  for (const group of uf.groups()) {
    group.sort((a, b) => raw[b].score - raw[a].score || raw[a].label - raw[b].label);
    const base = raw[group[0]];
    const docs = base.docs.clone();
    for (let g = 1; g < group.length; g++) docs.or(raw[group[g]].docs);
    const feature = ctx.labels.featureIndex[base.label];
    clusters.push({
      labels: [formatLabel(ctx, feature, params.labelFormat)],
      documents: docs.toArray(),
      score: base.score,
      feature,
      merged: group.slice(1).map((g) => formatLabel(ctx, ctx.labels.featureIndex[raw[g].label], params.labelFormat)),
    });
  }
  timings.clusters = Math.round(now() - t);
  result.clusters = sortClusters(clusters, params.scoreWeight);
  timings.total = Math.round(now() - t0);
  return result;
}
