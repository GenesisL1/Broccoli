/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Bisecting k-means (Steinbach, Karypis & Kumar 2000, "A Comparison of
 * Document Clustering Techniques"): start with all documents in one
 * cluster and keep splitting the largest cluster with k-means until the
 * requested number of clusters is reached (splits that would leave a part
 * smaller than minClusterSize are not made). Documents are tf-idf vectors,
 * optionally projected onto the leading singular vectors first. Each
 * cluster is labelled with the heaviest terms of its centroid.
 */

import { preprocess, contextStats } from '../preprocessing/pipeline.js';
import { formatLabel } from '../preprocessing/labels.js';
import { SparseMatrix } from '../matrix/matrix.js';
import { partialSvd, sphericalKMeans } from '../matrix/factorization.js';
import { buildTermDocumentMatrix } from './vsm.js';
import { now } from '../preprocessing/context.js';

export const BKM_DEFAULTS = Object.freeze({
  clusterCount: 25,
  maxIterations: 15,
  partitionCount: 2,
  minClusterSize: 2,
  labelCount: 3,
  useDimensionalityReduction: true,
  seed: 0x5eed,
  matrixBuilder: {
    titleWordsBoost: 2,
    maxWordDf: 0.9,
    maximumMatrixSize: 2500000,
    termWeighting: 'log-tfidf',
  },
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
      completeLabelFilter: false,
    },
  },
});

const BISECT_TRIALS = 5;

/** Norm of the sum of the given columns of a column-normalized matrix. */
function compositeNorm(X, columns) {
  const sum = new Float64Array(X.rows);
  for (const j of columns) {
    for (let p = X.colPtr[j]; p < X.colPtr[j + 1]; p++) sum[X.rowIndex[p]] += X.values[p];
  }
  let s = 0;
  for (let i = 0; i < sum.length; i++) s += sum[i] * sum[i];
  return Math.sqrt(s);
}

/** Dense matrix (r × n) → SparseMatrix with the same values. */
function denseToSparseColumns(D) {
  const cols = new Array(D.cols);
  for (let j = 0; j < D.cols; j++) {
    const c = [];
    for (let i = 0; i < D.rows; i++) {
      const v = D.data[i * D.cols + j];
      if (v !== 0) c.push([i, v]);
    }
    cols[j] = c;
  }
  return SparseMatrix.fromColumns(D.rows, cols).normalizeColumns();
}

/**
 * Runs Bisecting k-means. input = { documents: string[][], fieldNames, titleField, language }.
 */
export function bisectingKMeans(input, params, options = {}) {
  const t0 = now();
  const pp = params.preprocessing;
  const ctx = preprocess(input, {
    wordDfThreshold: pp.wordDfThreshold,
    queryHint: params.queryHint,
    extras: params.extras,
    wordFilters: params.dictionaries && params.dictionaries.wordFilters,
    labelFilterDictionary: params.dictionaries && params.dictionaries.labelFilters,
    labelFilters: Object.assign({}, pp.labelFilters, { completeLabelFilter: false }),
    minClusterSize: 1,
    phrases: false,
    labels: true,
    onProgress: options.onProgress,
  });
  const timings = { preprocessing: ctx.timings };
  const result = { clusters: [], context: ctx, stats: contextStats(ctx), timings };
  const N = ctx.documentCount;
  if (N === 0 || ctx.labels.count === 0) {
    timings.total = Math.round(now() - t0);
    return result;
  }
  const progress = options.onProgress || (() => {});
  progress('matrix', 0);
  let t = now();

  const W = ctx.words.count;
  const stemList = [];
  for (let i = 0; i < ctx.labels.count; i++) {
    const f = ctx.labels.featureIndex[i];
    if (f < W) stemList.push(ctx.words.stemIndex[f]);
  }
  const tdm = buildTermDocumentMatrix(ctx, stemList, params.matrixBuilder);
  const A = tdm.A;
  timings.matrix = Math.round(now() - t);
  result.stats.matrixRows = A.rows;
  if (A.rows === 0) {
    timings.total = Math.round(now() - t0);
    return result;
  }

  progress('factorization', 0);
  t = now();
  const K = Math.max(1, Math.min(params.clusterCount, N));
  let X = A;
  const dims = 2 * K;
  if (params.useDimensionalityReduction && dims < N && dims < A.rows) {
    const { U } = partialSvd(A, dims, { seed: params.seed });
    X = denseToSparseColumns(A.transposeMultiplyDense(U).transpose());
  }
  timings.factorization = Math.round(now() - t);

  progress('clustering', 0);
  t = now();
  // Documents without any term cannot be placed.
  const placeable = [];
  for (let j = 0; j < N; j++) if (X.colPtr[j + 1] > X.colPtr[j]) placeable.push(j);
  let clusters = placeable.length ? [placeable] : [];
  const unsplittable = new Set();
  const minSize = Math.max(1, params.minClusterSize || 1);
  let round = 0;
  while (clusters.length < K) {
    let pick = -1;
    for (let c = 0; c < clusters.length; c++) {
      if (clusters[c].length < Math.max(2, 2 * minSize) || unsplittable.has(clusters[c])) continue;
      if (pick < 0 || clusters[c].length > clusters[pick].length) pick = c;
    }
    if (pick < 0) break;
    const members = clusters[pick];
    const parts = Math.max(2, Math.min(params.partitionCount, members.length));
    // As in Steinbach et al., try several bisections and keep the one with
    // the highest overall similarity (the sum of the parts' composite norms).
    let best = null, bestScore = -Infinity;
    for (let trial = 0; trial < BISECT_TRIALS; trial++) {
      const { assignment } = sphericalKMeans(X, parts, {
        columns: members,
        iterations: params.maxIterations,
        seed: (params.seed + 7919 * ++round) >>> 0,
      });
      const groups = new Map();
      assignment.forEach((g, t2) => {
        let list = groups.get(g);
        if (!list) { list = []; groups.set(g, list); }
        list.push(members[t2]);
      });
      const pieces = [...groups.values()].filter((g) => g.length > 0);
      if (pieces.length < 2 || pieces.some((g) => g.length < minSize)) continue;
      let score = 0;
      for (const g of pieces) score += compositeNorm(X, g);
      if (score > bestScore + 1e-12) { bestScore = score; best = pieces; }
    }
    if (!best) {
      unsplittable.add(members);
      continue;
    }
    clusters.splice(pick, 1, ...best);
  }

  // Labels: heaviest centroid terms (in the full term space), weighted by how
  // much more common they are inside the cluster than outside it, so that a
  // word repeated in one document, or a word common everywhere, does not name
  // the cluster.
  const rowDf = new Int32Array(A.rows);
  for (let p = 0; p < A.nnz; p++) rowDf[A.rowIndex[p]]++;
  const out = [];
  for (const members of clusters) {
    const centroid = new Float64Array(A.rows);
    const support = new Int32Array(A.rows);
    for (const j of members) {
      for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) {
        centroid[A.rowIndex[p]] += A.values[p];
        support[A.rowIndex[p]]++;
      }
    }
    let norm = 0;
    for (let i = 0; i < centroid.length; i++) norm += centroid[i] * centroid[i];
    norm = Math.sqrt(norm) || 1;
    const outside = Math.max(1, N - members.length);
    const distinct = (i) => support[i] / members.length - (rowDf[i] - support[i]) / outside;
    const anyDistinct = members.length < N;
    const rank = (i) => centroid[i] * (anyDistinct ? Math.max(0, distinct(i)) : support[i] / members.length);
    const top = Array.from({ length: A.rows }, (_, i) => i)
      .filter((i) => centroid[i] > 0 && rank(i) > 0)
      .sort((a, b) => rank(b) - rank(a) || a - b)
      .slice(0, Math.max(1, params.labelCount));
    const labels = top.map((r) => formatLabel(ctx, ctx.stems.mostFrequentWord[tdm.rowStems[r]], params.labelFormat));
    // Cohesion: mean cosine between members and the centroid.
    let cohesion = 0;
    for (const j of members) {
      let s = 0;
      for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) s += A.values[p] * centroid[A.rowIndex[p]];
      cohesion += s / norm;
    }
    out.push({
      labels: labels.length ? labels : ['(no label)'],
      documents: members.slice().sort((a, b) => a - b),
      score: members.length ? cohesion / members.length : 0,
    });
  }
  out.sort((a, b) => b.documents.length - a.documents.length || b.score - a.score);
  result.clusters = out;
  timings.clustering = Math.round(now() - t);
  timings.total = Math.round(now() - t0);
  return result;
}
