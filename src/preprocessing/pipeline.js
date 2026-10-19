/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Preprocessing pipelines. The "basic" pipeline (tokens, words, stems, stop
 * words, query words) feeds STC and Bisecting k-means; the "complete"
 * pipeline adds phrase discovery, label candidates and document
 * assignment, which Lingo needs.
 */

import {
  createContext, tokenizeDocuments, normalizeCase, stemWords,
  markStopWords, markQueryWords, markTime, now,
} from './context.js';
import { extractPhrases } from './phrases.js';
import { buildLabelCandidates, assignDocuments } from './labels.js';

/**
 * options = {
 *   wordDfThreshold, phraseDfThreshold, maxPhraseLength,
 *   queryHint, extras: ['biomedical'], wordFilters, labelFilterDictionary,
 *   labelFilters: { queryLabelFilter, ..., labelOverrideThreshold },
 *   exactPhraseAssignment, minClusterSize,
 *   phrases: true|false, labels: true|false, onProgress
 * }
 */
export function preprocess(input, options = {}) {
  const ctx = createContext(input);
  const progress = options.onProgress || null;
  let t = now();
  if (progress) progress('tokenize', 0);
  tokenizeDocuments(ctx);
  t = markTime(ctx, 'tokenize', t);
  normalizeCase(ctx, options.wordDfThreshold || 1);
  t = markTime(ctx, 'caseNormalize', t);
  stemWords(ctx);
  t = markTime(ctx, 'stem', t);
  markStopWords(ctx, { extras: options.extras, wordFilters: options.wordFilters });
  markQueryWords(ctx, options.queryHint);
  t = markTime(ctx, 'stopWords', t);
  if (options.phrases) {
    if (progress) progress('phrases', 0);
    extractPhrases(ctx, {
      maxPhraseLength: options.maxPhraseLength,
      phraseDfThreshold: options.phraseDfThreshold,
    });
    t = markTime(ctx, 'phrases', t);
  }
  if (options.labels) {
    if (progress) progress('labels', 0);
    buildLabelCandidates(ctx, {
      labelFilters: options.labelFilters,
      extras: options.extras,
      dictionaryLabelFilters: options.labelFilterDictionary,
    });
    assignDocuments(ctx, {
      exactPhraseAssignment: options.exactPhraseAssignment,
      minClusterSize: options.minClusterSize,
    });
    t = markTime(ctx, 'labels', t);
  }
  return ctx;
}

/** Summary counts for diagnostics. */
export function contextStats(ctx) {
  return {
    documents: ctx.documentCount,
    tokens: ctx.tokens ? ctx.tokens.count : 0,
    words: ctx.words ? ctx.words.count : 0,
    stems: ctx.stems ? ctx.stems.count : 0,
    phrases: ctx.phrases ? ctx.phrases.count : 0,
    labelCandidates: ctx.labels ? ctx.labels.count : 0,
  };
}
