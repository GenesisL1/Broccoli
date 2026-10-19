/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Public API. Search results clustering (Lingo, STC, Bisecting k-means)
 * with PubMed E-utilities integration, for the browser, with no server
 * and no build step.
 */

export { VERSION, cluster, listAlgorithms, normalizeDocuments, PRESETS } from './engine/engine.js';
export { resolveParameters, getAlgorithm, ALGORITHMS } from './engine/attributes.js';
export { createClusterer, installWorker, setBundleSource } from './engine/worker.js';

export { registerLanguage, getLanguage, listLanguages, wordStemmer, isBuiltInLanguage } from './text/language.js';
export { tokenize, tokenizeToArray, prepareText } from './text/tokenizer.js';
export { stemEnglish } from './text/stemmer-english.js';
export {
  stemGerman, stemFrench, stemSpanish, stemItalian, stemPortuguese, stemDutch, stemRussian,
} from './text/stemmers-snowball.js';
export { highlightSpans, highlightHtml, escapeHtml } from './text/highlight.js';
export { STOPWORDS, STOPLABELS, BIOMEDICAL_STOPWORDS, BIOMEDICAL_STOPLABELS } from './text/lexicon-english.js';

export { preprocess, contextStats } from './preprocessing/pipeline.js';
export { formatLabel } from './preprocessing/labels.js';

export { lingo, LINGO_DEFAULTS } from './algorithms/lingo.js';
export { stc, STC_DEFAULTS } from './algorithms/stc.js';
export { bisectingKMeans, BKM_DEFAULTS } from './algorithms/bisecting-kmeans.js';
export { TERM_WEIGHTINGS } from './algorithms/vsm.js';

export { DenseMatrix, SparseMatrix } from './matrix/matrix.js';
export {
  factorize, partialSvd, nmfEuclidean, nmfKullbackLeibler, localNmf, kMeansFactorization,
  sphericalKMeans, lanczos, FACTORIZATIONS,
} from './matrix/factorization.js';
export { symmetricEigen } from './matrix/eigen.js';
export { suffixArray, lcpArray, forEachLcpInterval } from './util/suffix-array.js';
export { BitSet } from './util/bitset.js';
export { createRandom } from './util/random.js';

export { PubMedClient, EutilsError, searchPubMed, EUTILS_BASE, PUBMED_SORTS, DATE_TYPES } from './pubmed/eutils.js';
export {
  parsePubmedXml, parseSearchXml, parseSpellXml, toDocuments, formatAuthors, uninvertMesh, MESH_CHECK_TAGS,
} from './pubmed/records.js';
export { parseXml } from './pubmed/xml.js';
export { toRis, toBibtex, toCsv, toJson } from './pubmed/export.js';
