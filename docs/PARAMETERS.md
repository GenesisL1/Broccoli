# Algorithm parameters

Every parameter can be passed to `Broccoli.cluster(documents, { algorithm, parameters })`
either nested (`{ matrixBuilder: { titleWordsBoost: 3 } }`) or as a dotted path
(`{ 'matrixBuilder.titleWordsBoost': 3 }`). Numbers are clamped to the range
shown; unknown names and invalid choices are reported in `result.warnings`.
The same descriptors are available at run time from `Broccoli.listAlgorithms()`,
which is what the settings panel of the search page is built from.

Presets (`options.preset`) change a few defaults:

- **default**: The algorithms' own defaults.
- **abstracts**: Scientific abstracts: non-negative factorization, label generalization, biomedical stop words and stop labels. (lingo: `desiredClusterCount = 20`, `matrixReducer.factorizationFactory = nmf-ed`, `matrixReducer.factorizationQuality = medium`, `matrixBuilder.maximumMatrixSize = 1000000`, `clusterBuilder.labelGeneralization = 0.85`; stc: `ignoreWordIfInHigherDocsPercent = 0.3`, `singleTermBoost = 0.2`, `maxWordsPerLabel = 6`, `maxClusters = 20`; language extras: `biomedical`)

## Lingo (`lingo`)

Label-first clustering: matrix factorization finds concepts, then the best phrase is picked for each. Overlapping clusters with descriptive labels.

| Parameter | Default | Range or choices | Description |
|---|---|---|---|
| `desiredClusterCount` | `30` | 2 – 100 | **Desired cluster count.** Number of concepts to look for; the actual cluster count grows with it and with the square root of the number of documents. |
| `scoreWeight` | `0` | 0 – 1 | **Size–score balance.** 0 orders clusters by size only, 1 by label score only. |
| `clusterBuilder.phraseLabelBoost` | `1.5` | 0 – 10 | **Phrase label boost.** Weight of multi-word labels relative to single words. |
| `clusterBuilder.phraseLengthPenaltyStart` | `8` | 2 – 8 | **Phrase length penalty start.** Phrases of this many words or more are penalized. |
| `clusterBuilder.phraseLengthPenaltyStop` | `8` | 2 – 8 | **Phrase length penalty stop.** Phrases of this many words or more are never used as labels. |
| `clusterBuilder.clusterMergingThreshold` | `0.7` | 0 – 1 | **Cluster merging threshold.** Clusters sharing at least this fraction of the larger cluster's documents are merged. Lower values merge more. |
| `clusterBuilder.labelGeneralization` | `0` | 0 – 1 | **Label generalization.** Broccoli addition: switch to a shorter phrase inside the chosen label when it scores at least this share as well and covers at least twice the documents. 0 turns it off. |
| `clusterBuilder.labelAssigner` | `unique` | `unique`, `simple` | **Label assignment.** "unique" gives every concept a different label (greedy); "simple" lets concepts share one. |
| `matrixBuilder.termWeighting` | `log-tfidf` | `log-tfidf`, `linear-tfidf`, `tf` | **Term weighting.** How terms are weighted in the term-document matrix. |
| `matrixBuilder.titleWordsBoost` | `2` | 0 – 10 | **Title word boost.** Multiplier for a term's weight in a document whose title contains it. |
| `matrixBuilder.maxWordDf` | `0.9` | 0 – 1 | **Maximum word document frequency.** Words found in a larger fraction of the documents are left out of the matrix (e.g. 0.9 drops words present in over 90% of the documents). |
| `matrixBuilder.maximumMatrixSize` | `2500000` | 1000 – 50000000 | **Maximum matrix size.** Upper bound on rows × documents of the term-document matrix; the heaviest terms are kept. |
| `matrixReducer.factorizationFactory` | `svd` | `svd`, `nmf-ed`, `nmf-kl`, `lnmf`, `kmeans` | **Factorization.** Partial SVD (classic Lingo), non-negative factorizations (Euclidean, Kullback–Leibler, local) or k-means. |
| `matrixReducer.factorizationQuality` | `high` | `low`, `medium`, `high` | **Factorization quality.** Iteration budget of the iterative factorizations (15 / 30 / 50). |
| `matrixReducer.initialization` | `nndsvd` | `nndsvd`, `random` | **NMF initialization.** Starting point of the non-negative factorizations. |
| `matrixReducer.seed` | `24301` | 0 – 2147483647 | **Random seed.** Seed for the randomized steps (random NMF initialization, k-means, Lanczos start); the same seed gives the same clusters. |
| `preprocessing.wordDfThreshold` | `1` | 1 – 100 | **Word document frequency threshold.** Ignore words found in fewer documents. |
| `preprocessing.phraseDfThreshold` | `1` | 1 – 100 | **Phrase document frequency threshold.** Ignore phrases found in fewer documents. |
| `preprocessing.maxPhraseLength` | `8` | 2 – 8 | **Maximum phrase length.** Longest phrase (in words) considered as a label. |
| `preprocessing.documentAssigner.exactPhraseAssignment` | `false` | true, false | **Exact phrase assignment.** Assign a phrase cluster only the documents containing the exact phrase. Off: any document containing all of its words. |
| `preprocessing.documentAssigner.minClusterSize` | `2` | 1 – 100 | **Minimum cluster size.** Smallest number of documents in a cluster. |
| `preprocessing.labelFilters.queryLabelFilter` | `true` | true, false | **Query label filter.** Drop labels made only of query words. |
| `preprocessing.labelFilters.stopWordLabelFilter` | `true` | true, false | **Stop word label filter.** Drop labels that start or end with a stop word. |
| `preprocessing.labelFilters.numericLabelFilter` | `true` | true, false | **Numeric label filter.** Drop labels that start with a number or a quantity ("2-year"), or end with a number. |
| `preprocessing.labelFilters.genitiveLabelFilter` | `true` | true, false | **Genitive label filter.** Drop labels that end in a possessive ("Crohn's"). |
| `preprocessing.labelFilters.stopLabelFilter` | `true` | true, false | **Stop label filter.** Drop labels matching the language stop label patterns. |
| `preprocessing.labelFilters.minLengthLabelFilter` | `true` | true, false | **Minimum length filter.** Drop labels shorter than the minimum length. |
| `preprocessing.labelFilters.minLength` | `3` | 1 – 20 | **Minimum label length.** Minimum number of characters in a label. |
| `preprocessing.labelFilters.completeLabelFilter` | `true` | true, false | **Truncated label filter.** Drop labels that nearly always occur inside a longer label ("Carlo" in "Monte Carlo"). |
| `preprocessing.labelFilters.labelOverrideThreshold` | `0.65` | 0 – 1 | **Truncated label threshold.** A label is dropped when a longer label containing it occurs at least this fraction as often. Lower values remove more labels. |

## STC (`stc`)

Suffix Tree Clustering: shared phrases form base clusters, which merge when their documents overlap. Fast, phrase-based, multi-phrase labels.

| Parameter | Default | Range or choices | Description |
|---|---|---|---|
| `maxClusters` | `15` | 1 – 200 | **Maximum clusters.** Number of clusters returned. |
| `mergeThreshold` | `0.6` | 0 – 1 | **Base cluster merge threshold.** Base clusters are merged when each shares more than this fraction of its documents with the other. |
| `minBaseClusterScore` | `2` | 0 – 100 | **Minimum base cluster score.** Base clusters scoring lower are discarded. |
| `minBaseClusterSize` | `2` | 1 – 100 | **Minimum base cluster size.** Minimum number of documents per base cluster. |
| `maxBaseClusters` | `300` | 1 – 5000 | **Maximum base clusters.** Only the highest-scoring base clusters take part in merging. |
| `documentCountBoost` | `1` | 0 – 3 | **Document count boost.** Exponent on the document count in the base cluster score. |
| `optimalPhraseLength` | `3` | 1 – 8 | **Optimal label length.** Phrase length (content words) with the highest score. |
| `optimalPhraseLengthDev` | `2` | 0.5 – 10 | **Label length tolerance.** How quickly longer or shorter phrases lose score. |
| `singleTermBoost` | `0.5` | 0 – 2 | **Single term boost.** Length factor of one-word base clusters (0 uses the length curve). |
| `maxWordsPerLabel` | `4` | 1 – 8 | **Maximum words per label.** Longest phrase (in words) a base cluster may have. |
| `maxPhrases` | `3` | 1 – 10 | **Maximum phrases per label.** How many base cluster phrases describe a cluster. |
| `maxPhraseOverlap` | `0.6` | 0 – 1 | **Maximum phrase overlap.** Phrases sharing more of their words with a phrase already in the label are skipped. |
| `mostGeneralPhraseCoverage` | `0.5` | 0 – 1 | **Minimum phrase coverage.** Additional label phrases must cover at least this fraction of the cluster. |
| `ignoreWordIfInHigherDocsPercent` | `0.9` | 0 – 1 | **Maximum word-document ratio.** Words in a larger fraction of the documents do not count towards a phrase. |
| `ignoreWordIfInFewerDocs` | `2` | 1 – 100 | **Minimum word-document count.** Words in fewer documents do not count towards a phrase. |
| `mergeStemEquivalentBaseClusters` | `true` | true, false | **Merge stem-equivalent base clusters.** Treat phrases with the same content stems as one base cluster. |
| `preprocessing.wordDfThreshold` | `1` | 1 – 100 | **Word document frequency threshold.** Ignore words found in fewer documents. |
| `preprocessing.labelFilters.queryLabelFilter` | `true` | true, false | **Query label filter.** Drop labels made only of query words. |
| `preprocessing.labelFilters.stopWordLabelFilter` | `true` | true, false | **Stop word label filter.** Drop labels that start or end with a stop word. |
| `preprocessing.labelFilters.numericLabelFilter` | `true` | true, false | **Numeric label filter.** Drop labels that start with a number or a quantity ("2-year"), or end with a number. |
| `preprocessing.labelFilters.genitiveLabelFilter` | `true` | true, false | **Genitive label filter.** Drop labels that end in a possessive ("Crohn's"). |
| `preprocessing.labelFilters.stopLabelFilter` | `true` | true, false | **Stop label filter.** Drop labels matching the language stop label patterns. |
| `preprocessing.labelFilters.minLengthLabelFilter` | `true` | true, false | **Minimum length filter.** Drop labels shorter than the minimum length. |
| `preprocessing.labelFilters.minLength` | `3` | 1 – 20 | **Minimum label length.** Minimum number of characters in a label. |

## Bisecting k-means (`bkm`)

Repeatedly splits the largest cluster in two with k-means. Every document lands in exactly one cluster; labels are top centroid terms.

| Parameter | Default | Range or choices | Description |
|---|---|---|---|
| `clusterCount` | `25` | 2 – 200 | **Cluster count.** Number of clusters to create. |
| `maxIterations` | `15` | 1 – 200 | **Maximum k-means iterations.** Iterations per split. |
| `partitionCount` | `2` | 2 – 10 | **Partitions per split.** Number of parts a cluster is split into. |
| `minClusterSize` | `2` | 1 – 100 | **Minimum cluster size.** A cluster is split only if every part keeps at least this many documents (1 splits down to single documents). |
| `labelCount` | `3` | 1 – 10 | **Label count.** Number of centroid terms in each label. |
| `useDimensionalityReduction` | `true` | true, false | **Dimensionality reduction.** Run k-means on 2 × cluster count singular dimensions instead of the full term space. |
| `seed` | `24301` | 0 – 2147483647 | **Random seed.** Seed for k-means seeding and the SVD start vector; the same seed gives the same clusters. |
| `matrixBuilder.termWeighting` | `log-tfidf` | `log-tfidf`, `linear-tfidf`, `tf` | **Term weighting.** How terms are weighted in the term-document matrix. |
| `matrixBuilder.titleWordsBoost` | `2` | 0 – 10 | **Title word boost.** Multiplier for a term's weight in a document whose title contains it. |
| `matrixBuilder.maxWordDf` | `0.9` | 0 – 1 | **Maximum word document frequency.** Words found in a larger fraction of the documents are left out of the matrix (e.g. 0.9 drops words present in over 90% of the documents). |
| `matrixBuilder.maximumMatrixSize` | `2500000` | 1000 – 50000000 | **Maximum matrix size.** Upper bound on rows × documents of the term-document matrix; the heaviest terms are kept. |
| `preprocessing.wordDfThreshold` | `1` | 1 – 100 | **Word document frequency threshold.** Ignore words found in fewer documents. |
| `preprocessing.labelFilters.queryLabelFilter` | `true` | true, false | **Query label filter.** Drop labels made only of query words. |
| `preprocessing.labelFilters.stopWordLabelFilter` | `true` | true, false | **Stop word label filter.** Drop labels that start or end with a stop word. |
| `preprocessing.labelFilters.numericLabelFilter` | `true` | true, false | **Numeric label filter.** Drop labels that start with a number or a quantity ("2-year"), or end with a number. |
| `preprocessing.labelFilters.genitiveLabelFilter` | `true` | true, false | **Genitive label filter.** Drop labels that end in a possessive ("Crohn's"). |
| `preprocessing.labelFilters.stopLabelFilter` | `true` | true, false | **Stop label filter.** Drop labels matching the language stop label patterns. |
| `preprocessing.labelFilters.minLengthLabelFilter` | `true` | true, false | **Minimum length filter.** Drop labels shorter than the minimum length. |
| `preprocessing.labelFilters.minLength` | `3` | 1 – 20 | **Minimum label length.** Minimum number of characters in a label. |

