/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Public API. Search results clustering (Lingo, STC, Bisecting k-means)
 * for the browser, with no server and no build step, and search sources
 * that bring records in from any search API: PubMed, Europe PMC, preprints,
 * arXiv, OpenAlex, Crossref, DOAJ, ClinicalTrials.gov, DataCite,
 * INSPIRE-HEP and Wikipedia are built in, and your own take a few lines.
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
export { parsePubmedXml, parseSearchXml, parseSpellXml } from './pubmed/records.js';
export { parseXml } from './pubmed/xml.js';
export { toRis, toBibtex, toCsv, toJson } from './pubmed/export.js';

export {
  defineSource, registerSource, unregisterSource, getSource, listSources, searchSource,
} from './sources/registry.js';
export { SourceError, createRequester, buildUrl } from './sources/http.js';
export {
  makeRecord, toDocuments, formatAuthors, uninvertMesh, MESH_CHECK_TAGS, RECORD_TYPES, makeDate, parseIsoDate,
  normalizeDoi, parseDisplayName, parseInvertedName, nameFromParts, initialsOf, standardLinks, safeUrl, doiUrl,
} from './sources/records.js';
export { markupToText, markupToSafeHtml, markupSections, decodeHtmlEntities, unescapeMarkdown } from './sources/markup.js';
export { jsonSource, getPath } from './sources/json-source.js';
export { BUILTIN_SOURCES } from './sources/builtin.js';
export { pubmedSource, pubmedTerm, pubmedRecord, notableTypes, NOTABLE_TYPES } from './sources/pubmed.js';
export { europePmcSource, preprintsSource, europePmcRecord, europePmcQuery } from './sources/europepmc.js';
export { openAlexSource, arxivSource, openAlexRecord, openAlexFilter, uninvertAbstract, arxivIdOf } from './sources/openalex.js';
export { crossrefSource, crossrefRecord, crossrefFilter } from './sources/crossref.js';
export { doajSource, doajRecord, doajQuery, doajEscape } from './sources/doaj.js';
export { clinicalTrialsSource, trialRecord, trialsAdvancedFilter, phaseLabel } from './sources/clinicaltrials.js';
export { dataciteSource, dataciteRecord, dataciteTypes } from './sources/datacite.js';
export { inspireSource, inspireRecord, inspireQuery } from './sources/inspire.js';
export { wikipediaSource, wikipediaRecord, wikipediaUrl, WIKIPEDIA_LANGUAGES } from './sources/wikipedia.js';
export { arxivApiSource, arxivEntryRecord, parseArxivFeed, arxivSearchQuery, arxivIdFromUrl } from './sources/arxiv.js';
