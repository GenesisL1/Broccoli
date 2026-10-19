/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Cluster label candidates: words and phrases that survive the label
 * filters, and the documents each candidate is assigned to.
 */

import { BitSet } from '../util/bitset.js';
import {
  TF_COMMON_WORD, TF_QUERY_WORD, TYPE_MASK, TT_NUMERIC,
} from '../text/token-types.js';
import { compileLabelFilters } from './dictionaries.js';

export const DEFAULT_LABEL_FILTERS = Object.freeze({
  queryLabelFilter: true,
  stopWordLabelFilter: true,
  numericLabelFilter: true,
  genitiveLabelFilter: true,
  stopLabelFilter: true,
  minLengthLabelFilter: true,
  minLength: 3,
  completeLabelFilter: true,
  labelOverrideThreshold: 0.65,
});

const QUANTITY_COMPOUND = /^\p{N}[\p{N}.,]*-\p{Ll}/u;
const NUMBER_RANGE = /^[\p{N}.,%]+(?:-[\p{N}.,%]+)*$/u;

/** Word indices of a feature (feature < W: word; otherwise phrase W + p). */
export function featureWords(ctx, feature) {
  const W = ctx.words.count;
  return feature < W ? [feature] : ctx.phrases.wordIndices[feature - W];
}

/** Stem indices of a feature. */
export function featureStems(ctx, feature) {
  const W = ctx.words.count;
  if (feature < W) return [ctx.words.stemIndex[feature]];
  return ctx.phrases.stemIndices[feature - W];
}

/** Lower-cased text of a feature (words joined by spaces). */
export function featureText(ctx, feature) {
  const words = featureWords(ctx, feature);
  let s = '';
  for (let i = 0; i < words.length; i++) s += (i ? ' ' : '') + ctx.words.lower[words[i]];
  return s;
}

function isMixedCase(image) {
  // Any upper-case letter after the first character ("mRNA", "HIV",
  // "SARS-CoV-2"), or a single upper-case letter ("vitamin A").
  return /\p{Lu}/u.test(image.slice(1)) || /^\p{Lu}$/u.test(image);
}

function capitalize(image) {
  if (!image) return image;
  const first = String.fromCodePoint(image.codePointAt(0));
  return first.toUpperCase() + image.slice(first.length);
}

/**
 * Formats a word sequence as a label. `images` are the original spellings,
 * `common` tells which words are stop words.
 * style: "title" (Title Case; stop words inside stay as written),
 *        "sentence" (first word capitalized, the others in their usual spelling,
 *        so "Treatment of Alzheimer disease") or "original".
 */
export function formatWords(images, common, style = 'title') {
  const parts = new Array(images.length);
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (style === 'original' || isMixedCase(img)) {
      parts[i] = img;
    } else if (style === 'sentence') {
      parts[i] = i === 0 ? capitalize(img) : img;
    } else if (common[i] && i > 0 && i < images.length - 1) {
      parts[i] = img;
    } else {
      parts[i] = capitalize(img);
    }
  }
  return parts.join(' ');
}

/** Formats a feature (word or phrase) as a human-readable label. */
export function formatLabel(ctx, feature, style = 'title') {
  const W = ctx.words.count;
  const ws = featureWords(ctx, feature);
  const images = feature < W ? [ctx.words.image[feature]] : ctx.phrases.images[feature - W];
  const common = Array.from(ws, (w) => (ctx.words.type[w] & TF_COMMON_WORD) !== 0);
  return formatWords(images, common, style);
}

/** True if a word image looks like a number or a quantity ("2-year", "10-20"). */
function isNumericWord(ctx, w) {
  if ((ctx.words.type[w] & TYPE_MASK) === TT_NUMERIC) return true;
  const lw = ctx.words.lower[w];
  return NUMBER_RANGE.test(lw) || QUANTITY_COMPOUND.test(lw);
}

/**
 * Creates a predicate deciding whether a word sequence (word indices) may
 * be used as a cluster label, applying the enabled label filters except the
 * truncated-label filter (which needs all candidates at once).
 */
export function createLabelAcceptor(ctx, options = {}) {
  const cfg = Object.assign({}, DEFAULT_LABEL_FILTERS, options.labelFilters || {});
  const { words, language } = ctx;
  const stopLabelPatterns = [];
  if (cfg.stopLabelFilter) {
    stopLabelPatterns.push(...language.stoplabels);
    for (const name of options.extras || []) {
      const extra = language.extras[name];
      if (extra) stopLabelPatterns.push(...extra.stoplabels);
    }
  }
  const customLabelFilter = compileLabelFilters(options.dictionaryLabelFilters);
  const wt = words.type;

  return (ws) => {
    const first = ws[0], last = ws[ws.length - 1];
    if (cfg.stopWordLabelFilter && ((wt[first] & TF_COMMON_WORD) || (wt[last] & TF_COMMON_WORD))) return false;
    if (cfg.queryLabelFilter && ctx.queryStems.size > 0) {
      let allQuery = true;
      for (const w of ws) {
        if ((wt[w] & TF_COMMON_WORD) !== 0) continue;
        if ((wt[w] & TF_QUERY_WORD) === 0) { allQuery = false; break; }
      }
      if (allQuery) return false;
    }
    if (cfg.numericLabelFilter && (isNumericWord(ctx, first) || ((words.type[last] & TYPE_MASK) === TT_NUMERIC))) return false;
    if (cfg.genitiveLabelFilter) {
      const ll = words.lower[last];
      if (ll.endsWith("'s") || ll.endsWith("s'")) return false;
    }
    let text = words.lower[ws[0]];
    for (let i = 1; i < ws.length; i++) text += ' ' + words.lower[ws[i]];
    if (cfg.minLengthLabelFilter && [...text].length < cfg.minLength) return false;
    for (let i = 0; i < stopLabelPatterns.length; i++) if (stopLabelPatterns[i].test(text)) return false;
    if (customLabelFilter && customLabelFilter(text)) return false;
    return true;
  };
}

/**
 * Builds ctx.labels: the candidate features (single words first, then
 * phrases) that pass the enabled label filters.
 */
export function buildLabelCandidates(ctx, options = {}) {
  const cfg = Object.assign({}, DEFAULT_LABEL_FILTERS, options.labelFilters || {});
  const { stems, phrases } = ctx;
  const W = ctx.words.count;
  const acceptWords = createLabelAcceptor(ctx, options);
  const accept = (feature, ws) => acceptWords(ws);

  const wordCandidates = [];
  for (let s = 0; s < stems.count; s++) {
    const w = stems.mostFrequentWord[s];
    if (w >= 0 && accept(w, [w])) wordCandidates.push(w);
  }
  wordCandidates.sort((a, b) => a - b);

  const phraseCandidates = [];
  if (phrases) {
    for (let p = 0; p < phrases.count; p++) {
      if (accept(W + p, phrases.wordIndices[p])) phraseCandidates.push(W + p);
    }
  }

  let candidates = wordCandidates.concat(phraseCandidates);

  if (cfg.completeLabelFilter && phraseCandidates.length > 0) {
    candidates = removeTruncatedLabels(ctx, candidates, cfg.labelOverrideThreshold);
  }

  let firstPhraseIndex = candidates.length;
  for (let i = 0; i < candidates.length; i++) if (candidates[i] >= W) { firstPhraseIndex = i; break; }

  ctx.labels = {
    count: candidates.length,
    featureIndex: Int32Array.from(candidates),
    firstPhraseIndex,
    documents: null,
  };
}

/**
 * Removes "truncated" labels: a label is dropped when a longer candidate
 * containing it as a contiguous sub-phrase occurs at least
 * `threshold` times as often as the label itself ("Carlo" in "Monte Carlo").
 */
function removeTruncatedLabels(ctx, candidates, threshold) {
  const W = ctx.words.count;
  const freq = (f) => (f < W ? ctx.stems.tf[ctx.words.stemIndex[f]] : ctx.phrases.tf[f - W]);
  const keyOf = (stemsArr, from, to) => {
    let k = '';
    for (let i = from; i < to; i++) k += (i > from ? ',' : '') + stemsArr[i];
    return k;
  };
  const byKey = new Map();
  for (const f of candidates) {
    const st = featureStems(ctx, f);
    byKey.set(keyOf(st, 0, st.length), f);
  }
  const maxSuper = new Map();
  for (const f of candidates) {
    if (f < W) continue;
    const st = featureStems(ctx, f);
    const L = st.length;
    const fq = freq(f);
    for (let len = 1; len < L; len++) {
      for (let from = 0; from + len <= L; from++) {
        const sub = byKey.get(keyOf(st, from, from + len));
        if (sub === undefined) continue;
        const prev = maxSuper.get(sub);
        if (prev === undefined || fq > prev) maxSuper.set(sub, fq);
      }
    }
  }
  return candidates.filter((f) => {
    const sup = maxSuper.get(f);
    return sup === undefined || sup < threshold * freq(f);
  });
}

/** Documents containing a stem, as a BitSet. */
export function stemDocuments(ctx, stem) {
  const set = new BitSet(ctx.documentCount);
  const list = ctx.stems.tfByDocument[stem];
  for (let i = 0; i < list.length; i += 3) set.set(list[i]);
  return set;
}

/**
 * Assigns documents to label candidates and drops candidates with fewer
 * than `minClusterSize` documents. With exactPhraseAssignment a phrase gets
 * only the documents containing the phrase itself; otherwise it gets every
 * document containing all of its content words.
 */
export function assignDocuments(ctx, options = {}) {
  const exact = !!options.exactPhraseAssignment;
  const minClusterSize = options.minClusterSize == null ? 2 : options.minClusterSize;
  const { words, phrases, labels } = ctx;
  const W = words.count;
  const N = ctx.documentCount;
  const keepFeatures = [];
  const keepDocs = [];
  const stemDocCache = new Map();
  const docsOfStem = (s) => {
    let b = stemDocCache.get(s);
    if (!b) { b = stemDocuments(ctx, s); stemDocCache.set(s, b); }
    return b;
  };

  for (let i = 0; i < labels.count; i++) {
    const f = labels.featureIndex[i];
    let docs;
    if (f < W) {
      docs = docsOfStem(words.stemIndex[f]).clone();
    } else if (exact) {
      docs = new BitSet(N);
      const list = phrases.tfByDocument[f - W];
      for (let j = 0; j < list.length; j += 2) docs.set(list[j]);
    } else {
      docs = null;
      const ws = phrases.wordIndices[f - W];
      for (const w of ws) {
        if ((words.type[w] & TF_COMMON_WORD) !== 0) continue;
        const d = docsOfStem(words.stemIndex[w]);
        if (docs === null) docs = d.clone();
        else docs.and(d);
      }
      if (docs === null) docs = new BitSet(N);
    }
    if (docs.cardinality() >= minClusterSize) {
      keepFeatures.push(f);
      keepDocs.push(docs);
    }
  }
  let firstPhraseIndex = keepFeatures.length;
  for (let i = 0; i < keepFeatures.length; i++) if (keepFeatures[i] >= W) { firstPhraseIndex = i; break; }
  ctx.labels = {
    count: keepFeatures.length,
    featureIndex: Int32Array.from(keepFeatures),
    firstPhraseIndex,
    documents: keepDocs,
  };
}
