/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * The public clustering entry point: normalizes documents, resolves
 * parameters, runs the chosen algorithm and returns plain-JSON results.
 */

import { getLanguage } from '../text/language.js';
import { lingo } from '../algorithms/lingo.js';
import { stc } from '../algorithms/stc.js';
import { bisectingKMeans } from '../algorithms/bisecting-kmeans.js';
import { getAlgorithm, resolveParameters, deepMerge } from './attributes.js';
import { now } from '../preprocessing/context.js';

export const VERSION = '1.3.0';

const RUNNERS = { lingo, stc, bkm: bisectingKMeans };

// Fields clustered by default, in this order, when documents are objects.
const DEFAULT_FIELDS = ['title', 'snippet', 'abstract', 'content', 'summary', 'description', 'body', 'text', 'terms', 'keywords'];
// When none of those exist, every other text field is used, except these.
const NON_TEXT_FIELD = /^(?:_?id|uid|uuid|pmid|pmcid|doi|isbn|issn|url|uri|href|links?|date|year|time|created|updated|timestamp|score|rank|lang|language|type|kind)$/i;

/**
 * Presets: named bundles of options. "abstracts" is tuned for scientific
 * abstracts such as PubMed records.
 */
export const PRESETS = Object.freeze({
  default: { description: 'The algorithms\' own defaults.' },
  abstracts: {
    description: 'Scientific abstracts: non-negative factorization, label generalization, biomedical stop words and stop labels.',
    extras: ['biomedical'],
    parameters: {
      lingo: {
        desiredClusterCount: 20,
        'matrixReducer.factorizationFactory': 'nmf-ed',
        'matrixReducer.factorizationQuality': 'medium',
        'matrixBuilder.maximumMatrixSize': 1000000,
        'clusterBuilder.labelGeneralization': 0.85,
      },
      stc: {
        ignoreWordIfInHigherDocsPercent: 0.3,
        singleTermBoost: 0.2,
        maxWordsPerLabel: 6,
        maxClusters: 20,
      },
      bkm: {},
    },
  },
});

function textOf(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(' ');
  return String(value);
}

/**
 * Normalizes input documents into field arrays.
 * documents: strings, or objects with string (or string array) fields. Without
 * `fields`, the familiar text fields are used (title, snippet, abstract,
 * content, summary, description, body, text, terms, keywords); objects with
 * none of them contribute all their other text fields.
 */
export function normalizeDocuments(documents, fields, titleField) {
  const list = Array.isArray(documents) ? documents : [];
  let fieldNames = fields && fields.length ? fields.slice() : null;
  if (!fieldNames) {
    const seen = new Set();
    for (const d of list) {
      if (d && typeof d === 'object') for (const f of DEFAULT_FIELDS) if (d[f] != null && d[f] !== '') seen.add(f);
    }
    fieldNames = DEFAULT_FIELDS.filter((f) => seen.has(f));
    if (fieldNames.length === 0) {
      // No familiar field names: take any field holding text.
      const other = new Set();
      for (const d of list) {
        if (!d || typeof d !== 'object') continue;
        for (const [k, v] of Object.entries(d)) {
          if (NON_TEXT_FIELD.test(k)) continue;
          if (typeof v === 'string' ? /\p{L}/u.test(v) : Array.isArray(v) && v.some((x) => typeof x === 'string')) other.add(k);
        }
      }
      fieldNames = [...other].slice(0, 31);
    }
    if (fieldNames.length === 0) fieldNames = ['text'];
  }
  if (fieldNames.length > 31) throw new Error('At most 31 fields can be clustered');
  const docs = list.map((d) => {
    if (typeof d === 'string') return fieldNames.map((f, i) => (i === 0 ? d : ''));
    if (!d || typeof d !== 'object') return fieldNames.map(() => '');
    return fieldNames.map((f) => textOf(d[f]));
  });
  let title = titleField === undefined ? fieldNames.indexOf('title') : titleField === null ? -1 : fieldNames.indexOf(titleField);
  return { documents: docs, fieldNames, titleField: title };
}

/**
 * Clusters documents.
 *
 * options = {
 *   algorithm: 'lingo' | 'stc' | 'bkm',
 *   language: 'en' (or a language object),
 *   preset: 'default' | 'abstracts',
 *   queryHint: 'the query that produced the documents',
 *   fields: ['title', 'abstract'], titleField: 'title',
 *   parameters: { ...algorithm attribute overrides, nested or dotted },
 *   dictionaries: { wordFilters: [...], labelFilters: [...] },
 *   extras: ['biomedical'],          // optional language extras
 *   labelFormat: 'title' | 'sentence' | 'original',  // default: the language's ('title' for English)
 *   otherTopics: true,               // append an "Other topics" cluster
 *   otherTopicsLabel: 'Other topics', // its name (default: the language's)
 *   onProgress: (stage, fraction) => {}
 * }
 */
export function cluster(documents, options = {}) {
  const t0 = now();
  const algorithm = getAlgorithm(options.algorithm || 'lingo');
  const preset = PRESETS[options.preset || 'default'];
  if (!preset) throw new Error('Unknown preset "' + options.preset + '". Known: ' + Object.keys(PRESETS).join(', '));
  const presetParams = (preset.parameters && preset.parameters[algorithm.id]) || {};
  const { params, warnings } = resolveParameters(algorithm.id, Object.assign({}, presetParams, options.parameters || {}));
  const language = getLanguage(options.language || 'en');
  params.queryHint = options.queryHint || '';
  params.extras = options.extras || preset.extras || [];
  params.dictionaries = options.dictionaries || null;
  params.labelFormat = options.labelFormat || language.labelFormat || 'title';

  const normalized = normalizeDocuments(documents, options.fields, options.titleField);
  if (normalized.documents.length > 0 && !normalized.documents.some((d) => d.some((t) => t && /\S/.test(t)))) {
    warnings.push('The documents contain no text in the fields ' + normalized.fieldNames.join(', ') + '; name the fields to cluster with options.fields');
  }
  const input = Object.assign({ language }, normalized);
  const run = RUNNERS[algorithm.id];
  const out = run(input, params, { onProgress: options.onProgress });

  const N = normalized.documents.length;
  const assigned = new Uint8Array(N);
  const clusters = out.clusters.map((c, i) => {
    for (const d of c.documents) assigned[d] = 1;
    const entry = {
      id: i,
      label: c.labels.join(', '),
      labels: c.labels,
      size: c.documents.length,
      score: Math.round(c.score * 1e6) / 1e6,
      documents: c.documents,
    };
    if (c.merged && c.merged.length) entry.merged = c.merged;
    return entry;
  });
  const unclustered = [];
  for (let d = 0; d < N; d++) if (!assigned[d]) unclustered.push(d);
  if (options.otherTopics !== false && unclustered.length > 0) {
    const otherLabel = options.otherTopicsLabel || language.otherTopics || 'Other topics';
    clusters.push({
      id: clusters.length,
      label: otherLabel,
      labels: [otherLabel],
      size: unclustered.length,
      score: 0,
      documents: unclustered,
      other: true,
    });
  }
  return {
    algorithm: algorithm.id,
    language: language.code,
    documentCount: N,
    clusters,
    unclustered,
    stats: out.stats,
    timings: Object.assign({}, out.timings, { total: Math.round((now() - t0) * 10) / 10 }),
    parameters: params,
    warnings,
    version: VERSION,
  };
}

/** Lists algorithms with their defaults and attribute descriptors. */
export function listAlgorithms() {
  return ['lingo', 'stc', 'bkm'].map((id) => {
    const a = getAlgorithm(id);
    return { id: a.id, name: a.name, description: a.description, defaults: deepMerge({}, a.defaults), attributes: a.attributes };
  });
}
