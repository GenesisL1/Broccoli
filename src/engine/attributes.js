/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Parameter descriptors ("attributes") for each
 * algorithm: path, type, bounds, default and documentation. They drive
 * validation and the settings form of the demo application.
 */

import { LINGO_DEFAULTS } from '../algorithms/lingo.js';
import { STC_DEFAULTS } from '../algorithms/stc.js';
import { BKM_DEFAULTS } from '../algorithms/bisecting-kmeans.js';

const FILTERS = [
  ['queryLabelFilter', 'Query label filter', 'Drop labels made only of query words.'],
  ['stopWordLabelFilter', 'Stop word label filter', 'Drop labels that start or end with a stop word.'],
  ['numericLabelFilter', 'Numeric label filter', 'Drop labels that start with a number or a quantity ("2-year"), or end with a number.'],
  ['genitiveLabelFilter', 'Genitive label filter', "Drop labels that end in a possessive (\"Crohn's\")."],
  ['stopLabelFilter', 'Stop label filter', 'Drop labels matching the language stop label patterns.'],
  ['minLengthLabelFilter', 'Minimum length filter', 'Drop labels shorter than the minimum length.'],
];

function labelFilterAttributes(prefix, withComplete) {
  const out = FILTERS.map(([key, label, description]) => ({
    path: prefix + key, type: 'boolean', label, description, group: 'Label filters',
  }));
  out.push({
    path: prefix + 'minLength', type: 'integer', min: 1, max: 20, label: 'Minimum label length',
    description: 'Minimum number of characters in a label.', group: 'Label filters',
  });
  if (withComplete) {
    out.push(
      {
        path: prefix + 'completeLabelFilter', type: 'boolean', label: 'Truncated label filter',
        description: 'Drop labels that nearly always occur inside a longer label ("Carlo" in "Monte Carlo").',
        group: 'Label filters',
      },
      {
        path: prefix + 'labelOverrideThreshold', type: 'number', min: 0, max: 1, step: 0.05,
        label: 'Truncated label threshold',
        description: 'A label is dropped when a longer label containing it occurs at least this fraction as often. Lower values remove more labels.',
        group: 'Label filters',
      }
    );
  }
  return out;
}

const MATRIX_ATTRIBUTES = [
  {
    path: 'matrixBuilder.termWeighting', type: 'enum', options: ['log-tfidf', 'linear-tfidf', 'tf'],
    label: 'Term weighting', description: 'How terms are weighted in the term-document matrix.', group: 'Matrix model',
  },
  {
    path: 'matrixBuilder.titleWordsBoost', type: 'number', min: 0, max: 10, step: 0.5,
    label: 'Title word boost', description: "Multiplier for a term's weight in a document whose title contains it.", group: 'Matrix model',
  },
  {
    path: 'matrixBuilder.maxWordDf', type: 'number', min: 0, max: 1, step: 0.05,
    label: 'Maximum word document frequency',
    description: 'Words found in a larger fraction of the documents are left out of the matrix (e.g. 0.9 drops words present in over 90% of the documents).',
    group: 'Matrix model',
  },
  {
    path: 'matrixBuilder.maximumMatrixSize', type: 'integer', min: 1000, max: 50000000,
    label: 'Maximum matrix size',
    description: 'Upper bound on rows × documents of the term-document matrix; the heaviest terms are kept.',
    group: 'Matrix model',
  },
];

const PREPROCESSING_ATTRIBUTES = [
  {
    path: 'preprocessing.wordDfThreshold', type: 'integer', min: 1, max: 100,
    label: 'Word document frequency threshold', description: 'Ignore words found in fewer documents.', group: 'Preprocessing',
  },
];

export const ALGORITHMS = Object.freeze({
  lingo: {
    id: 'lingo',
    name: 'Lingo',
    description: 'Label-first clustering: matrix factorization finds concepts, then the best phrase is picked for each. Overlapping clusters with descriptive labels.',
    defaults: LINGO_DEFAULTS,
    attributes: [
      {
        path: 'desiredClusterCount', type: 'integer', min: 2, max: 100,
        label: 'Desired cluster count',
        description: 'Number of concepts to look for; the actual cluster count grows with it and with the square root of the number of documents.',
        group: 'Clusters',
      },
      {
        path: 'scoreWeight', type: 'number', min: 0, max: 1, step: 0.05,
        label: 'Size–score balance', description: '0 orders clusters by size only, 1 by label score only.', group: 'Clusters',
      },
      {
        path: 'clusterBuilder.phraseLabelBoost', type: 'number', min: 0, max: 10, step: 0.1,
        label: 'Phrase label boost', description: 'Weight of multi-word labels relative to single words.', group: 'Labels',
      },
      {
        path: 'clusterBuilder.phraseLengthPenaltyStart', type: 'integer', min: 2, max: 8,
        label: 'Phrase length penalty start', description: 'Phrases of this many words or more are penalized.', group: 'Labels',
      },
      {
        path: 'clusterBuilder.phraseLengthPenaltyStop', type: 'integer', min: 2, max: 8,
        label: 'Phrase length penalty stop', description: 'Phrases of this many words or more are never used as labels.', group: 'Labels',
      },
      {
        path: 'clusterBuilder.clusterMergingThreshold', type: 'number', min: 0, max: 1, step: 0.05,
        label: 'Cluster merging threshold',
        description: 'Clusters sharing at least this fraction of the larger cluster\'s documents are merged. Lower values merge more.',
        group: 'Clusters',
      },
      {
        path: 'clusterBuilder.labelGeneralization', type: 'number', min: 0, max: 1, step: 0.05,
        label: 'Label generalization', description: 'Broccoli addition: switch to a shorter phrase inside the chosen label when it scores at least this share as well and covers at least twice the documents. 0 turns it off.', group: 'Labels',
      },
      {
        path: 'clusterBuilder.labelAssigner', type: 'enum', options: ['unique', 'simple'],
        label: 'Label assignment', description: '"unique" gives every concept a different label (greedy); "simple" lets concepts share one.', group: 'Labels',
      },
      ...MATRIX_ATTRIBUTES,
      {
        path: 'matrixReducer.factorizationFactory', type: 'enum', options: ['svd', 'nmf-ed', 'nmf-kl', 'lnmf', 'kmeans'],
        label: 'Factorization', description: 'Partial SVD (classic Lingo), non-negative factorizations (Euclidean, Kullback–Leibler, local) or k-means.', group: 'Matrix model',
      },
      {
        path: 'matrixReducer.factorizationQuality', type: 'enum', options: ['low', 'medium', 'high'],
        label: 'Factorization quality', description: 'Iteration budget of the iterative factorizations (15 / 30 / 50).', group: 'Matrix model',
      },
      {
        path: 'matrixReducer.initialization', type: 'enum', options: ['nndsvd', 'random'],
        label: 'NMF initialization', description: 'Starting point of the non-negative factorizations.', group: 'Matrix model',
      },
      {
        path: 'matrixReducer.seed', type: 'integer', min: 0, max: 2147483647,
        label: 'Random seed', description: 'Seed for the randomized steps (random NMF initialization, k-means, Lanczos start); the same seed gives the same clusters.', group: 'Matrix model',
      },
      ...PREPROCESSING_ATTRIBUTES,
      {
        path: 'preprocessing.phraseDfThreshold', type: 'integer', min: 1, max: 100,
        label: 'Phrase document frequency threshold', description: 'Ignore phrases found in fewer documents.', group: 'Preprocessing',
      },
      {
        path: 'preprocessing.maxPhraseLength', type: 'integer', min: 2, max: 8,
        label: 'Maximum phrase length', description: 'Longest phrase (in words) considered as a label.', group: 'Preprocessing',
      },
      {
        path: 'preprocessing.documentAssigner.exactPhraseAssignment', type: 'boolean',
        label: 'Exact phrase assignment',
        description: 'Assign a phrase cluster only the documents containing the exact phrase. Off: any document containing all of its words.',
        group: 'Clusters',
      },
      {
        path: 'preprocessing.documentAssigner.minClusterSize', type: 'integer', min: 1, max: 100,
        label: 'Minimum cluster size', description: 'Smallest number of documents in a cluster.', group: 'Clusters',
      },
      ...labelFilterAttributes('preprocessing.labelFilters.', true),
    ],
  },
  stc: {
    id: 'stc',
    name: 'STC',
    description: 'Suffix Tree Clustering: shared phrases form base clusters, which merge when their documents overlap. Fast, phrase-based, multi-phrase labels.',
    defaults: STC_DEFAULTS,
    attributes: [
      { path: 'maxClusters', type: 'integer', min: 1, max: 200, label: 'Maximum clusters', description: 'Number of clusters returned.', group: 'Clusters' },
      { path: 'mergeThreshold', type: 'number', min: 0, max: 1, step: 0.05, label: 'Base cluster merge threshold', description: 'Base clusters are merged when each shares more than this fraction of its documents with the other.', group: 'Clusters' },
      { path: 'minBaseClusterScore', type: 'number', min: 0, max: 100, step: 0.5, label: 'Minimum base cluster score', description: 'Base clusters scoring lower are discarded.', group: 'Base clusters' },
      { path: 'minBaseClusterSize', type: 'integer', min: 1, max: 100, label: 'Minimum base cluster size', description: 'Minimum number of documents per base cluster.', group: 'Base clusters' },
      { path: 'maxBaseClusters', type: 'integer', min: 1, max: 5000, label: 'Maximum base clusters', description: 'Only the highest-scoring base clusters take part in merging.', group: 'Base clusters' },
      { path: 'documentCountBoost', type: 'number', min: 0, max: 3, step: 0.1, label: 'Document count boost', description: 'Exponent on the document count in the base cluster score.', group: 'Base clusters' },
      { path: 'optimalPhraseLength', type: 'integer', min: 1, max: 8, label: 'Optimal label length', description: 'Phrase length (content words) with the highest score.', group: 'Base clusters' },
      { path: 'optimalPhraseLengthDev', type: 'number', min: 0.5, max: 10, step: 0.5, label: 'Label length tolerance', description: 'How quickly longer or shorter phrases lose score.', group: 'Base clusters' },
      { path: 'singleTermBoost', type: 'number', min: 0, max: 2, step: 0.1, label: 'Single term boost', description: 'Length factor of one-word base clusters (0 uses the length curve).', group: 'Base clusters' },
      { path: 'maxWordsPerLabel', type: 'integer', min: 1, max: 8, label: 'Maximum words per label', description: 'Longest phrase (in words) a base cluster may have.', group: 'Labels' },
      { path: 'maxPhrases', type: 'integer', min: 1, max: 10, label: 'Maximum phrases per label', description: 'How many base cluster phrases describe a cluster.', group: 'Labels' },
      { path: 'maxPhraseOverlap', type: 'number', min: 0, max: 1, step: 0.05, label: 'Maximum phrase overlap', description: 'Phrases sharing more of their words with a phrase already in the label are skipped.', group: 'Labels' },
      { path: 'mostGeneralPhraseCoverage', type: 'number', min: 0, max: 1, step: 0.05, label: 'Minimum phrase coverage', description: 'Additional label phrases must cover at least this fraction of the cluster.', group: 'Labels' },
      { path: 'ignoreWordIfInHigherDocsPercent', type: 'number', min: 0, max: 1, step: 0.05, label: 'Maximum word-document ratio', description: 'Words in a larger fraction of the documents do not count towards a phrase.', group: 'Preprocessing' },
      { path: 'ignoreWordIfInFewerDocs', type: 'integer', min: 1, max: 100, label: 'Minimum word-document count', description: 'Words in fewer documents do not count towards a phrase.', group: 'Preprocessing' },
      { path: 'mergeStemEquivalentBaseClusters', type: 'boolean', label: 'Merge stem-equivalent base clusters', description: 'Treat phrases with the same content stems as one base cluster.', group: 'Base clusters' },
      ...PREPROCESSING_ATTRIBUTES,
      ...labelFilterAttributes('preprocessing.labelFilters.', false),
    ],
  },
  bkm: {
    id: 'bkm',
    name: 'Bisecting k-means',
    description: 'Repeatedly splits the largest cluster in two with k-means. Every document lands in exactly one cluster; labels are top centroid terms.',
    defaults: BKM_DEFAULTS,
    attributes: [
      { path: 'clusterCount', type: 'integer', min: 2, max: 200, label: 'Cluster count', description: 'Number of clusters to create.', group: 'Clusters' },
      { path: 'maxIterations', type: 'integer', min: 1, max: 200, label: 'Maximum k-means iterations', description: 'Iterations per split.', group: 'Clusters' },
      { path: 'partitionCount', type: 'integer', min: 2, max: 10, label: 'Partitions per split', description: 'Number of parts a cluster is split into.', group: 'Clusters' },
      { path: 'minClusterSize', type: 'integer', min: 1, max: 100, label: 'Minimum cluster size', description: 'A cluster is split only if every part keeps at least this many documents (1 splits down to single documents).', group: 'Clusters' },
      { path: 'labelCount', type: 'integer', min: 1, max: 10, label: 'Label count', description: 'Number of centroid terms in each label.', group: 'Labels' },
      { path: 'useDimensionalityReduction', type: 'boolean', label: 'Dimensionality reduction', description: 'Run k-means on 2 × cluster count singular dimensions instead of the full term space.', group: 'Matrix model' },
      { path: 'seed', type: 'integer', min: 0, max: 2147483647, label: 'Random seed', description: 'Seed for k-means seeding and the SVD start vector; the same seed gives the same clusters.', group: 'Clusters' },
      ...MATRIX_ATTRIBUTES,
      ...PREPROCESSING_ATTRIBUTES,
      ...labelFilterAttributes('preprocessing.labelFilters.', false),
    ],
  },
});

/** Aliases accepted for algorithm names. */
export const ALGORITHM_ALIASES = Object.freeze({
  lingo: 'lingo',
  stc: 'stc',
  'suffix-tree': 'stc',
  bkm: 'bkm',
  kmeans: 'bkm',
  'k-means': 'bkm',
  'bisecting-kmeans': 'bkm',
  'bisecting k-means': 'bkm',
});

export function getAlgorithm(name) {
  const id = ALGORITHM_ALIASES[String(name || 'lingo').toLowerCase()];
  if (!id) throw new Error('Unknown algorithm "' + name + '". Known: lingo, stc, bkm');
  return ALGORITHMS[id];
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

function deepMerge(base, extra) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  if (!extra || typeof extra !== 'object') return out;
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export { getPath, setPath, deepMerge };

/**
 * Merges overrides into the algorithm defaults and validates every
 * described attribute (clamping numbers, checking enums). Overrides may be
 * nested objects or flat dotted paths: { 'matrixBuilder.maxWordDf': 0.8 }.
 */
export function resolveParameters(algorithmName, overrides = {}) {
  const algo = getAlgorithm(algorithmName);
  const nested = {};
  for (const [k, v] of Object.entries(overrides || {})) {
    if (k.indexOf('.') >= 0) setPath(nested, k, v);
    else nested[k] = v;
  }
  const warnings = [];
  // Names that match no parameter of this algorithm are reported and dropped.
  const known = new Set(algo.attributes.map((a) => a.path));
  const unknown = [];
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? prefix + '.' + k : k;
      const def = getPath(algo.defaults, path);
      if (v && typeof v === 'object' && !Array.isArray(v) && def && typeof def === 'object') walk(v, path);
      else if (def === undefined && !known.has(path)) unknown.push(path);
    }
  };
  walk(nested, '');
  for (const path of unknown) {
    warnings.push(path + ': not a parameter of ' + algo.name + ', ignored');
    const keys = path.split('.');
    const parent = keys.length > 1 ? getPath(nested, keys.slice(0, -1).join('.')) : nested;
    if (parent && typeof parent === 'object') delete parent[keys[keys.length - 1]];
  }
  const params = deepMerge(JSON.parse(JSON.stringify(algo.defaults)), nested);
  for (const a of algo.attributes) {
    let v = getPath(params, a.path);
    const def = getPath(algo.defaults, a.path);
    if (v === undefined) continue;
    if (a.type === 'boolean') {
      if (typeof v !== 'boolean') { v = v === 'true' || v === 1 || v === '1' ? true : v === 'false' || v === 0 || v === '0' ? false : !!v; }
    } else if (a.type === 'integer' || a.type === 'number') {
      let n = Number(v);
      if (!Number.isFinite(n)) { warnings.push(a.path + ': not a number, using default'); n = def; }
      if (a.type === 'integer') n = Math.round(n);
      if (a.min != null && n < a.min) { warnings.push(a.path + ': raised to minimum ' + a.min); n = a.min; }
      if (a.max != null && n > a.max) { warnings.push(a.path + ': lowered to maximum ' + a.max); n = a.max; }
      v = n;
    } else if (a.type === 'enum') {
      if (!a.options.includes(v)) { warnings.push(a.path + ': unknown value "' + v + '", using "' + def + '"'); v = def; }
    }
    setPath(params, a.path, v);
  }
  return { params, warnings };
}
