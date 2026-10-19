<!-- SPDX-License-Identifier: MIT · Copyright (c) 2026 Decentralized Science Labs LLC -->
# Broccoli: how it reads, clusters and draws

**Broccoli** is a JavaScript library by Decentralized Science Labs, released
under the MIT License. It groups search results into labelled topics on the
reader's own device, with Lingo, Suffix Tree Clustering (STC) or bisecting
k-means, and draws the topics as zoomable maps. It also contains a client for
NCBI's E-utilities, a reader for PubMed records and exports for reference
managers, and a PubMed search page built on all of it. This guide describes
version 1.3.0.

It explains how Broccoli reads text, how each algorithm finds and names
topics, how the maps are laid out and coloured, how the search page puts the
parts together, and where the limits lie. Every number is the code's own
default or a value the search page sets; where the two differ, both are
given.

## What Broccoli is and is not

Broccoli clusters **result sets**: the hundreds or few thousands of records a
search returns. It finds topics in the words those records share, as repeated
phrases and as terms that occur together. The clustering runs in the
browser, in a Web Worker when one can be started, and needs no server: the
requests go from the browser to NCBI, or to a proxy you run. Its randomised
steps draw from a
seeded generator, so the same records with the same settings always give the
same topics, and the same topics the same map.

| Broccoli is | Broccoli is not |
|---|---|
| a lexical clusterer: topics come from shared words and phrases | a semantic model: there are no embeddings and no language model, so synonyms that share no word stay apart |
| a labeller: every topic is named with words from its records | a summariser: it writes no text of its own |
| a PubMed client that calls NCBI's E-utilities from the browser | a search engine: it indexes nothing and ranks no records; PubMed chooses and orders them |

Lingo and STC may place a record in several topics; bisecting k-means places
every record it can in exactly one. Broccoli holds records only in the page's
memory.

## Files

Each script sets one global name.

| File | Size | Global | Role |
|---|---|---|---|
| `dist/broccoli.js` | 299 KB | `Broccoli` | the core: text processing, the three algorithms, the clustering engine and its worker, label highlighting, the PubMed client, record reader and exports (`dist/broccoli.mjs` is the same as an ES module) |
| `app/views.js` | 96 KB | `BroccoliViews` | the canvas maps (organic treemap, bubbles, radial) with their layouts, zoom, labels and keyboard |
| `app/florets.js` | 11 KB | `BroccoliFlorets` | the florets map, in SVG |
| `app/colors.js` | 10 KB | `BroccoliColors` | the palette, its tiers in OKLCH, contrast, the theme |
| `app/app.js` | 68 KB | `BroccoliApp` | the search page: settings, the topic tree, the address, records and exports |

`dist/broccoli.js` is built from the modules in `src/` by `tools/build.py`,
and keeps them as named sections for text, preprocessing, utilities,
matrices, the algorithms, the engine and PubMed.

## From records to a map

1. **Search.** The page asks PubMed for the PMIDs of a query (ESearch) and
   fetches the records in batches of 200 by POST (EFetch), from the browser
   or through a proxy.
2. **Documents.** Each record becomes an article (title, abstract, authors,
   journal, identifiers, MeSH headings, keywords and more), and each article a
   document with the fields `title`, `abstract` and, with *Use MeSH headings
   and author keywords*, `terms`.
3. **Clustering.** `cluster(documents, options)` runs in a Web Worker: it
   resolves the parameters, reads the text, runs the algorithm and adds a
   group for the records no topic holds.
4. **The tree.** The search is the root and the topics its children; opening
   a topic clusters its records again.
5. **The map.** `app/views.js` or `app/florets.js` draws the open level,
   the **focus**, in colours from `app/colors.js`.

`cluster()` returns plain JSON:

```
{ algorithm, language, documentCount,
  clusters: [ { id, label, labels, size, score, documents, merged?, other? } ],
  unclustered, stats, timings, parameters, warnings, version }
```

`documents` are indices into the input. `labels` holds one phrase for Lingo,
up to three for STC and the top terms for k-means; `merged` lists the labels
of Lingo topics folded into this one.

## Reading the text

### Documents and fields

A document is a string or an object of text fields, at most 31 of them (each
word records its fields as bits of a 32-bit mask). The search page names
`title` and `abstract`, and `terms` with MeSH; the title field matters to the matrix
models, which weight a word up in a record whose title contains it. In
`terms`, MeSH check tags (Humans, Male, Female, the age groups and the like)
are left out, a heading inverted once is put in natural order ("Diabetes
Mellitus, Type 2" becomes "Type 2 Diabetes Mellitus"), and headings are
joined by semicolons, so that no phrase runs from one into the next.

### Tokens

Text is put in Unicode normal form C, without soft hyphens and zero-width
characters. The tokeniser reads Latin, Greek and Cyrillic script and tries
these patterns, in order, at every position:

| Token | Examples | Becomes |
|---|---|---|
| URL, DOI or e-mail address | `https://…`, `nature.com`, `10.1000/xyz123`, `name@example.org` | a separator |
| dotted acronym | U.S., e.g. | a word |
| number | 12, 3.5, 1,000, 95%, 10–20 | a word, marked numeric |
| word | p53, mRNA, IL-6, COVID-19, CD4+, TNF-α, Crohn's | a word, marked hyphenated when it holds a hyphen |
| any other character | , ; ( ) . ! ? … | a separator; . ! ? and … end a sentence |

A word is a run of letters, digits, combining marks and underscores, joined by
hyphens or apostrophes, with any plus signs after it; dash-like hyphens
become "-". "2-year" is a word, not a number. Every field ends with a
separator, so no phrase crosses from a title into its abstract.

### Words and stems

Tokens that differ only in case are one word, written in its most frequent
spelling (a capital at the start of a sentence counts only when there is no
other occurrence). Words with the same stem share one entry. The English
stemmer is Porter2 (Snowball English), written from Martin Porter's published
description with its later revisions. Around it, Broccoli protects
scientific terms:

- a word in capitals is not stemmed, but a plural *s* after a core in capitals
  goes: "SNPs" and "SNP" share a stem, as do "mRNAs" and "mRNA";
- a word with a digit (p53, IL-6, COVID-19) is not stemmed;
- in a hyphenated word only the last part, when all lower-case letters, is
  stemmed: "drug-resistant" and "drug-resistance" both become "drug-resist";
- a possessive ('s, s') goes first, so "Crohn's" and "Crohn" share a stem.

The search page clusters in English, the default. The library also has Snowball
stemmers, stop lists and a name for *Other topics* in German, French, Spanish,
Italian, Portuguese, Dutch and Russian, and `none`, with no language
processing.

### Stop words and query words

A **stop word** comes from the language's list (531 English function words,
pronouns, auxiliaries, adverbs and numbers in words), from a language extra or
from the visitor's list. It may sit inside a phrase ("quality of life") but
never starts or ends a label. The search page adds the **biomedical** extra
unless
*Ignore scientific boilerplate* is off: 140 reporting verbs and discourse
words that carry no topic in an abstract (aim, findings, results,
significant, associated and the like). *Extra stop words* are globs, one a
line: `covid*` catches covid, covid-19 and covid19.

The query is a **hint**, not a filter: stripped of PubMed's syntax (field
tags, AND, OR, NOT, quotes, parentheses, wildcards), its words mark every word
of the records with the same stem or spelling. A label made only of query
words is dropped: a search for lysozyme gives no topic "Lysozyme".

### Phrases

Lingo names topics with phrases and STC builds topics from them; both find
repeated phrases the same way. The stemmed words of all records become one
sequence of integers, with a fresh number, used nowhere else, for every run of
separators, so that no phrase crosses punctuation or a field boundary. Its
suffix array is built with SA-IS (Nong, Zhang and Chan, 2009), the
longest-common-prefix (LCP) array with Kasai's algorithm (Kasai et al., 2001),
and the LCP intervals are visited bottom-up (Abouelhoda, Kurtz and Ohlebusch,
2004), all in linear time. Each interval is an internal node of the records'
suffix tree: a phrase that occurs at least twice and is right-complete (not
always followed by the same word). After Zhang and Dong (2004), a phrase that
always follows the same content word gives way to the longer phrase. A phrase
may not start with a stop word, and trailing stop words are cut off. Lingo
keeps phrases of 2 to 8 words (`maxPhraseLength`); STC takes single words
too.

### Label candidates

A word or phrase must pass these filters, all on by default, to name a topic:

| Filter | Drops |
|---|---|
| stop word | labels that start or end with a stop word |
| query | labels made only of query words |
| numeric | labels that start with a number or a quantity ("2-year", "10-20") or end with a number |
| genitive | labels that end in a possessive ("Crohn's") |
| minimum length | labels shorter than 3 characters (`minLength`) |
| stop labels | labels matching a pattern of the language or of an extra |
| *Extra stop labels* | the visitor's label globs, where `*` alone stands for any number of words |
| truncated (Lingo) | a label inside a longer candidate that occurs at least 0.65 times as often (`labelOverrideThreshold`), such as "Carlo" in "Monte Carlo" |

The biomedical stop labels reject the generic nouns of abstracts
("patients", "results"), statistical and trial boilerplate ("odds ratio",
"double-blind"), populations ("patients with …"), "risk of X" forms (the
topic is X) and clause fragments ("patients were randomized"). Labels are
written in Title Case, Sentence case or as written (*Label style*); a word in
mixed case (mRNA, SARS-CoV-2) always keeps its spelling.

### Term weights and the matrix

Lingo and bisecting k-means describe each record as a vector of term weights.
With N records, a term t that occurs tf times in record d, and in df records
in all, weighs:

```
w(t, d) = ln(1 + tf) × ln(N / df)        log-tfidf (the default)
w(t, d) = tf × ln(N / df)                linear-tfidf
w(t, d) = tf                             tf
```

The weight is doubled (`titleWordsBoost` 2) when t is in the title of d;
terms in more than 90% of the records are left out (`maxWordDf` 0.9). The
rows are only terms that could name a topic (the content words of Lingo's
label candidates, the single-word candidates for k-means), ranked by total
weight, and ⌊`maximumMatrixSize` / N⌋ of them are kept: for 2,000 records,
500 with the search page's Lingo (1,000,000 cells), 1,250 with the library
default (2,500,000). Each column is scaled to unit length, so the dot product of two
records is their cosine.

## Lingo

Lingo (Osiński, Stefanowski and Weiss, 2004) looks for the **labels** first:
it finds the main concepts of the records, picks for each the candidate that
expresses it best, and only then gathers the records that contain the label.
Its labels are readable phrases, and a record may sit in several topics.

### Concepts

The number of concepts grows with the square root of the number of records:

```
k = min( ⌊desiredClusterCount / 10 × √N⌋, rows of the matrix, N )
```

| Records N | Library (30) | Search page, topics (20) | Search page, subtopics (15) |
|---|---|---|---|
| 50 | 21 | 14 | 10 |
| 100 | 30 | 20 | 15 |
| 200 | 42 | 28 | 21 |
| 500 | 67 | 44 | 33 |
| 2,000 | 134 | 89 | 67 |

k bounds the number of topics: concepts that pick the same label collapse,
and topics that share most of their records merge.

### Factorisations

The concepts are the leading factors of the term–document matrix A (terms ×
records), found by one of five methods (`factorizationFactory`). Each gives up
to k unit-length concept vectors over the terms, strongest first, turned so
that their largest entry is positive. Non-negative factorisations in Lingo follow
Osiński (2006).

| Method | Concepts | Strength |
|---|---|---|
| `svd` (library default, classic Lingo) | the leading left singular vectors of A | singular value |
| `nmf-ed` (search page) | non-negative A ≈ U Vᵀ by Euclidean distance (Lee and Seung, 2001) | ‖Uⱼ‖ × ‖Vⱼ‖ |
| `nmf-kl` | the same by Kullback–Leibler divergence (Lee and Seung, 2001) | ‖Uⱼ‖ × ‖Vⱼ‖ |
| `lnmf` | local NMF (Li, Hou, Zhang and Cheng, 2001) | ‖Uⱼ‖ × ‖Vⱼ‖ |
| `kmeans` | spherical k-means centroids of the records | cluster size |

**Partial SVD.** When d = min(rows, N) is at most 160, or at most 2k + 20,
the smaller Gram matrix (A Aᵀ, or Aᵀ A with U = A V) is decomposed by
Householder tridiagonalisation and the QL algorithm, ported from the
public-domain JAMA package. Otherwise the Lanczos process (Lanczos, 1950)
runs on the Gram operator with full reorthogonalisation from a seeded random
start, with 4k + 40 steps, doubled up to three times until every Ritz pair's
residual bound is below 10⁻⁸ of the largest eigenvalue. Directions with a
singular value below 10⁻⁷ of the largest are dropped.

**NMF.** The non-negative methods start from NNDSVD (Boutsidis and
Gallopoulos, 2008): the positive parts of the leading singular pairs, zeros
filled with the mean of A. The Euclidean method then applies Lee and Seung's
updates for 15, 30 or 50 iterations (`factorizationQuality` low, medium or
high; the search page uses medium):

```
U ← U ⊙ (A V) ⊘ (U VᵀV + ε)
V ← V ⊙ (AᵀU) ⊘ (V UᵀU + ε)        ε = 10⁻⁹
```

The Kullback–Leibler and local methods use their own multiplicative rules on
the ratio A ⊘ (U Vᵀ), computed only where A is not zero.

### Naming the concepts

Each candidate gets a score for each concept j, the cosine between its term
vector and the concept vector uⱼ:

```
word t:     score(t, j) = uⱼ[t]
phrase p:   score(p, j) = 1.5 × penalty(|p|) × Σₜ g(t) uⱼ[t] / √(Σₜ g(t)²)
            g(t) = ln(1 + tf(t)) × ln(N / df(t)) over all records, content words of p
```

1.5 is `phraseLabelBoost`. The length penalty is 1 below
`phraseLengthPenaltyStart` words and 0 from `phraseLengthPenaltyStop` on;
both are 8, so phrases of 8 words never name a topic. With the default
`labelAssigner`, **unique**, each concept's k best candidates with a positive
score are pooled, sorted and taken greedily, so that no two concepts share a
label; with **simple**, concepts that pick the same candidate become one
topic.

**Label generalisation** is Broccoli's own addition, off in the library and
0.85 on the search page (`labelGeneralization`). A concept trades its label for a free
shorter phrase inside it that scores at least 0.85 times as well and covers
at least twice as many records (the one covering most, if several). It keeps
a quirk of the factorisation from turning a large topic into a narrow one:
"Breast Cancer" (59 records) rather than "Breast Cancer Screening" (4), in
the code's own example.

### Records and merging

A topic holds every record that contains its label: for a word, its stem; for
a phrase, all of its content-word stems, anywhere in the record (only the
phrase itself with `exactPhraseAssignment`). Candidates with fewer than 2
records (`minClusterSize`) are dropped before scoring. Two topics merge when
they share at least 70% of the larger one's records
(`clusterMergingThreshold`):

```
|A ∩ B| / max(|A|, |B|) ≥ 0.7
```

Merging is transitive (a union–find over all pairs). A merged topic keeps its
best-scoring member's label, takes the union of the records and lists the
other labels in `merged` ("Also covers …" on the page). Topics are ordered by
size^(1 − w) × score^w, with `scoreWeight` w = 0: by size.

### Lingo parameters

| Parameter | Library | Search page |
|---|---|---|
| `desiredClusterCount` | 30 | 20; 15 inside a topic |
| `scoreWeight` | 0 | 0 |
| `clusterBuilder.phraseLabelBoost` | 1.5 | 1.5 |
| `clusterBuilder.phraseLengthPenaltyStart`, `phraseLengthPenaltyStop` | 8, 8 | 8, 8 |
| `clusterBuilder.clusterMergingThreshold` | 0.7 | 0.7 |
| `clusterBuilder.labelAssigner` | unique | unique |
| `clusterBuilder.labelGeneralization` | 0 (off) | 0.85 |
| `matrixBuilder.termWeighting` | log-tfidf | log-tfidf |
| `matrixBuilder.titleWordsBoost`, `maxWordDf` | 2, 0.9 | 2, 0.9 |
| `matrixBuilder.maximumMatrixSize` | 2,500,000 | 1,000,000 |
| `matrixReducer.factorizationFactory` | svd | nmf-ed |
| `matrixReducer.factorizationQuality` | high (50 iterations) | medium (30) |
| `matrixReducer.initialization`, `seed` | nndsvd, 24301 (0x5eed) | the same |
| `preprocessing.wordDfThreshold`, `phraseDfThreshold`, `maxPhraseLength` | 1, 1, 8 | the same |
| `preprocessing.documentAssigner.exactPhraseAssignment`, `minClusterSize` | off, 2 | the same |
| `preprocessing.labelFilters` | all on, `minLength` 3, `labelOverrideThreshold` 0.65 | the same |

## Suffix Tree Clustering (STC)

STC (Zamir and Etzioni, 1998) builds topics out of the phrases records share.
Broccoli finds the phrases with a suffix array instead of a suffix tree; the
LCP intervals are the tree's internal nodes, so the base clusters are the
same.

### Base clusters

Every repeated phrase of 1 to `maxWordsPerLabel` words that passes the label
filters is a **base cluster** of the records containing it, if it occurs in
at least `minBaseClusterSize` records and has at least one **counting word**:
a content word found in no more than `ignoreWordIfInHigherDocsPercent` of the
records and in at least `ignoreWordIfInFewerDocs` of them. The score favours
phrases of about three counting words found in many records
(`optimalPhraseLength` 3, `optimalPhraseLengthDev` 2):

```
score = f(L) × n^documentCountBoost      n = records, documentCountBoost = 1
f(L)  = singleTermBoost                  if L = 1 (0.5; 0.2 on the search page)
f(L)  = exp(−(L − 3)² / (2 × 2²))        otherwise
```

| Counting words L | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| f(L) | 0.5 (page 0.2) | 0.88 | 1 | 0.88 | 0.61 | 0.32 |
| records needed for the minimum score of 2 | 4 (page 10) | 3 | 2 | 3 | 4 | 7 |

Base clusters below `minBaseClusterScore` (2) are dropped. Phrases with the
same content stems ("clustering algorithm", "algorithms for clustering") are
one base cluster (`mergeStemEquivalentBaseClusters`), with the union of their
records and the better phrase. The 300 best (`maxBaseClusters`) go on.

### Merging and labels

Two base clusters are linked when each shares more than 60% of its records
with the other (`mergeThreshold`):

```
|A ∩ B| / |A| > 0.6   and   |A ∩ B| / |B| > 0.6
```

Each connected group becomes a topic, with the union of the records and the
sum of the scores. It is described by up to 3 of its phrases (`maxPhrases`),
best first, skipping a phrase inside a longer one of the topic that covers
at least 60% as many records, after the first a phrase covering less than
half of the topic (`mostGeneralPhraseCoverage`), and a phrase sharing more
than 60% of its stems (`maxPhraseOverlap`) or two stems in a row with one
already chosen. Topics are ranked by score, then size, and the first
`maxClusters` are kept.

### STC parameters

| Parameter | Library | Search page |
|---|---|---|
| `maxClusters` | 15 | 20; 12 inside a topic |
| `mergeThreshold` | 0.6 | 0.6 |
| `minBaseClusterScore`, `minBaseClusterSize`, `maxBaseClusters` | 2, 2, 300 | the same |
| `documentCountBoost`, `optimalPhraseLength`, `optimalPhraseLengthDev` | 1, 3, 2 | the same |
| `singleTermBoost` | 0.5 | 0.2 |
| `maxWordsPerLabel` | 4 | 6 |
| `maxPhrases`, `maxPhraseOverlap`, `mostGeneralPhraseCoverage` | 3, 0.6, 0.5 | the same |
| `ignoreWordIfInHigherDocsPercent` | 0.9 | 0.3 |
| `ignoreWordIfInFewerDocs` | 2 | 2 |
| `mergeStemEquivalentBaseClusters` | on | on |
| `preprocessing` | `wordDfThreshold` 1; label filters on (no truncated-label filter), `minLength` 3 | the same |

## Bisecting k-means

Bisecting k-means (Steinbach, Karypis and Kumar, 2000) splits first and names
afterwards. All records start in one group, and the largest group is split in
two, again and again, until there are `clusterCount` groups.

### Vectors and splits

The records are the columns of the term–document matrix, its rows the
single-word label candidates. When 2 × `clusterCount` is smaller than both the
number of records and the number of terms (`useDimensionalityReduction`), each
record is first projected onto the leading 2 × `clusterCount` left singular
vectors and scaled to unit length again. Records with no term cannot be placed
and go to *Other topics*.

The largest group of at least 2 × `minClusterSize` records that has not
failed before is split into `partitionCount` parts by spherical k-means. As in
Steinbach et al., five trial bisections run with different seeds, and the one
with the highest overall similarity is kept: the sum over its parts of
‖Σ x‖, the length of the part's summed unit vectors. A trial leaving a part
smaller than `minClusterSize` is rejected; a group with no valid trial is not
tried again.

**Spherical k-means** (Dhillon and Modha, 2001) works with cosines between
unit vectors. It is seeded by k-means++ (Arthur and Vassilvitskii, 2007) with
the distance 1 − cos: a random first centre, then each next one drawn with
probability proportional to the squared distance to the nearest centre.
Each iteration assigns every record to the centroid of largest cosine and
renormalises each centroid, until no record moves or for `maxIterations`.

### Labels

A topic's centroid is taken in the full term space, the sum of its records'
columns, and each term t is ranked by its weight there times how much more
common it is inside the topic C than outside it:

```
rank(t) = centroid(t) × max(0, inside(t) / |C| − outside(t) / (N − |C|))
```

inside(t) and outside(t) count the records with t in and out of C. The
`labelCount` best terms are the label; the score is the mean cosine between
the topic's records and its centroid. Topics are ordered by size.

### k-means parameters

| Parameter | Library | Search page |
|---|---|---|
| `clusterCount` | 25 | round(1.2 √N), from 4 to 30; from 3 to 12 inside a topic |
| `maxIterations`, `partitionCount`, `minClusterSize`, `labelCount` | 15, 2, 2, 3 | the same |
| `useDimensionalityReduction`, `seed` | on, 24301 (0x5eed) | the same |
| `matrixBuilder` | as Lingo's library defaults (2,500,000 cells) | the same |
| `preprocessing` | `wordDfThreshold` 1; label filters on, truncated-label filter off | the same |

## Other topics and subtopics

**Other topics.** After any algorithm, the records no topic holds become one
more group, marked `other`: under Lingo and STC the records that contain none
of the final labels, under k-means those with no term in the matrix. The
search page calls it *Not in any topic*, or *Not in any subtopic* below the
top level, and draws it grey with a hatch.

**Overlap.** A Lingo or STC record that contains two labels sits in both
topics, so a level's sizes can add up to more than its records. The maps size
each topic by its share among its siblings.

**Subtopics.** `cluster()` returns one level; the search page builds the
tree. An opened
topic's records are clustered again with the same algorithm and settings,
but the labels on the way down join the query hint, so a subtopic is not
named after its parents, and fewer groups are asked for (the search page's
values in the tables above). A group of fewer than 8 records, or one six levels below
the search, is a leaf. So is a topic whose clustering leaves fewer than two
real subtopics once any group holding all its records is dropped; the maps
then show its records one by one. Meanwhile a second worker clusters the
topics of the new level (8 records or more) ahead of time, those of the
opened topic first, so most zooms find their subtopics ready.

## Parameters and presets

Every parameter has a type, bounds and a default in a table of attributes,
from which the search page builds its parameter settings. `resolveParameters` merges
a preset and the visitor's changes into the defaults, rounds integers,
clamps numbers to their bounds, checks choices and reports what it changed in
`warnings` (under *About this result*). The search page always uses the
`abstracts` preset: it adds the `biomedical` extra (left out when *Ignore
scientific boilerplate* is off) and sets the Lingo and STC values given for
it above. The library's presets are `default` and `abstracts`.

## The maps

The page shows one level of the tree, the focus, in one of four maps. The
treemap, bubbles and radial map share one canvas (`views.js`), drawn at the
screen's pixel density (up to 3×) and redrawn only while something changes;
the florets map is SVG (`florets.js`). Topics are sized by their records,
laid out largest first with *Other* last, and named wherever there is room.

### The organic treemap

The treemap is a Voronoi treemap (Balzer and Deussen, 2005): each topic is a
convex cell of a weighted power diagram clipped to its container, with an
area proportional to its records. It is built in eight steps.

1. **Container and targets.** The container is the stage, a rectangle 3 to
   7 px inside the canvas, or for subtopics their topic's cell. Coordinates
   are scaled so that its longer side is 1, to keep the solver well
   conditioned. Topic i of size nᵢ gets the target area
   Tᵢ = area × max(1, nᵢ) / Σⱼ max(1, nⱼ).
2. **Starting sites.** In a rectangle the sites start on a grid of about
   √(n × width / height) columns, largest topics first, each nudged 0.17 of a
   cell in a direction turning by the golden angle from site to site; in any
   other polygon, on Vogel's spiral around the centroid, largest in the
   middle. A zoom takes them from the previous map (step 7).
3. **The power diagram.** Each site sᵢ carries a weight wᵢ, and a point
   belongs to the site of smallest power distance (Aurenhammer, 1987):

   ```
   pow(x, i) = |x − sᵢ|² − wᵢ
   cell i    = { x : pow(x, i) ≤ pow(x, j) for every j }
   border    : 2 x · (sⱼ − sᵢ) = |sⱼ|² − |sᵢ|² + wᵢ − wⱼ
   ```

   Every border is a straight line, so a cell is its container clipped by
   n − 1 half-planes (Sutherland and Hodgman, 1974): a convex polygon. A
   larger weight pushes a cell's borders out; with equal weights the diagram
   is the ordinary Voronoi diagram.
4. **Balancing the areas.** The weights start at 0 and are solved by
   Newton's method. Raising wᵢ by δ moves the border with site j by
   δ / (2 dᵢⱼ), where dᵢⱼ = |sᵢ − sⱼ|, so a shared border of length lᵢⱼ gives

   ```
   ∂Aᵢ/∂wⱼ = −lᵢⱼ / (2 dᵢⱼ)        ∂Aᵢ/∂wᵢ = Σⱼ lᵢⱼ / (2 dᵢⱼ)
   ```

   a graph Laplacian over neighbouring cells (borders on the container's
   outline do not count). Each step solves J Δw = T − A by Gaussian
   elimination with partial pivoting, the largest topic's weight held at 0,
   since adding one constant to every weight changes nothing. The step is
   halved, up to 20 times, until every cell keeps more than 10⁻⁶ of its
   target and the loss Σ (Aᵢ − Tᵢ)² / Tᵢ falls. It stops when every cell is
   within 0.2% of its target, after 60 steps, or when no step helps.
5. **Relaxation.** Five times, every site moves three quarters of the way to
   its cell's centroid (Lloyd, 1982) and the weights are balanced again. This
   rounds the cells and gives the map its organic look.
6. **Checking.** A layout in which a cell has less than 5% of its target, or
   fewer than three corners, is rejected. At the top level the map then falls
   back on squarified rectangles (Bruls, Huizing and van Wijk, 2000); a topic
   whose subtopics cannot be laid out shows none inside.
7. **Nesting and zooming.** Inside every top-level cell, the topic's
   subtopics, once known, form a diagram of their own (steps 1 to 6), drawn
   when the cell has at least 5,200 px² and its centroid lies 30 px or more
   from every border. A zoom into a topic starts the new map's sites at the
   centroids of its subtopic cells as drawn, carried from the cell's bounding
   box to the stage, so each subtopic grows from its place.
8. **Morphing.** Every shape is kept as 48 points along its outline, its
   corners among them. Before a shape moves, its points are turned to start
   where they best match the old outline, so the morph does not twist; each
   point then moves in a straight line, eased, over 760 ms for a zoom and
   460 ms for other changes.

A topic whose subtopics are not yet known, or that has none, shows one dot
per record (up to 400) at the bottom of its cell. A focus without subtopics
shows its records as a **honeycomb**: equal hexagons, as large as fit (150 to
300 px across at most), each titled with its record where there is room.
Cells are filled with a gradient from their lighter tier to their fill and
parted by the stage colour; a name sits on the cell's centroid in the largest
type that fits (11.5 to 24 px), and a cell too small for a name shows its
record count. *Other* is hatched.

### Bubbles

Topics are circles with areas proportional to their records, packed in two
passes. Largest first, each circle goes where it touches two circles already
placed (or one), at the free spot that keeps the bounding box smallest for
the stage's proportions. Then all circles grow together by 3% at a time,
overlaps pushed apart and circles kept inside the stage; a step leaving an
overlap above 0.3 px is undone and the growth halved, down to 0.15%. A leaf's
records are equal circles on a hexagonal grid.

Each group's contents are packed into a stage-sized rectangle that, one
level up, sits inside the group's circle with its corners on the circle. A
zoom moves the camera until the circle encloses the stage, along the smooth
zoom-and-pan path of van Wijk and Nuij (2003) with ρ = √2, in 520 to
1,100 ms. A bubble of radius 40 px or more wears up to nine beads, its
subtopics. Bubbles are named from a radius of about 32 px and show their
record count below that. A click between the bubbles zooms out.

### Radial

The radial map is a sunburst. The focus is a disc at the centre; its topics
share the first ring, each with an angle proportional to its records among
its siblings, and their subtopics and sub-subtopics fill up to two more rings
within their parents' angles. The ring borders, as fractions of the radius,
are 0, 0.34 and 1 with one ring; 0, 0.29, 0.69 and 1 with two; 0, 0.25, 0.61,
0.85 and 1 with three. Labels run along the radius, upright on both halves,
in segments at least 26 px thick. A click on the centre zooms out; a zoom
spreads the opened segment over the whole circle.

### Florets

The florets map is a head of broccoli seen from above, in SVG. The search is
the dark centre; each topic is a floret on a stem, placed along an ellipse
around it from the top, clockwise, largest first. A floret's area is
proportional to its records. There are at most 28 florets (14, with labels
cut at 15 characters instead of 32, on a map narrower than 560 px); they
shrink together when they would not fit around the ellipse. Each record is a
bud on Vogel's sunflower spiral (Vogel, 1979), with one bud size for the
whole map, set by the largest floret:

```
ρₖ = c × √(k + 0.5)        θₖ = k × 137.5°  (π × (3 − √5))
```

A label goes outside its floret along the stem, else under or over it; one
that fits nowhere appears on hover and focus. A leaf is drawn as one floret
whose buds are its records.

## Colours

`colors.js` gives topics eight matte hues in a fixed order: blue, apricot,
teal, lavender, sage, rose, sky and sand, made for a white surface
(#ffffff, ink #090d12) and a near-black one (#11171f, ink #e9eef5), the
search page's stage in its light and dark themes. The
eight fills of a theme share one OKLab lightness (L ≈ 0.885 on the light
theme, 0.372 on the dark), so no topic looks heavier than its neighbours.
*Other* is a cool grey (#dce0e5, dark #33373c). Each hue has five tiers, all
but the fill and mark computed in OKLCH, the polar form of Ottosson's OKLab
(Ottosson, 2020); a colour outside sRGB loses chroma in 5% steps until it
fits.

| Tier | For | Light theme | Dark theme |
|---|---|---|---|
| fill | cells, bubbles, segments | from the palette | from the palette |
| top | the light end of a fill's gradient | L + 0.073 (at most 0.972), C × 0.42 | L + 0.04, C × 1.06 |
| edge | hover outlines | L 0.60, C × 1.6 within 0.02 to 0.085 | L 0.68, the same chroma |
| ink | names on a fill | the fill's hue at L 0.335 (L 0.925 on fills darker than L 0.6), C at most 0.052 | the same, C at most 0.032 |
| mark | beads, buds, swatches | from the palette, stronger | from the palette, stronger |

**Beyond eight topics** the hues return a step of lightness one way, then the
other: topics 9 to 16 are 0.045 darker on the light theme (0.05 lighter on
the dark), with chroma × 1.12 and hue +10°; topics 17 to 24 are 0.035 lighter
(darker on the dark theme), with chroma × 0.85 and hue −10°. The cycle
repeats after 24.

**By level.** The focus's topics wear their own fills, their subtopics quiet
variants of their topic's fill (six fixed shifts of lightness, hue and
chroma, the lightness kept within 0.80 to 0.94, or 0.28 to 0.46 on the dark
theme), and records three variants of the focus's fill in turn; the focus
and its parents fade to a wash. A topic's colour follows its place among its
siblings, so on zooming in its subtopics change from variants of its hue to
hues of their own, the colours moving with the shapes. Swatches, beads and
buds use the stronger mark tier, since fills are too soft at that size.

**Contrast.** Broccoli measures contrast as WCAG does, (L₁ + 0.05) / (L₂ +
0.05) of the relative luminances (W3C, 2008), and uses a fill's ink only if
it reaches 4.5:1, otherwise the plain ink. The comments of `colors.js` state
at least 6.9:1 on the eight fills and 5:1 on every other fill, variant and
gradient. Recomputed from the code for all 24 slots, their variants, the
washes and *Other*, against each fill and its gradient's top: at least 8.4:1
(light theme) and 6.9:1 (dark) on the eight fills, at least 6.8:1 and 5.06:1
on the rest, and the plain ink is never needed. The eight base marks have at
least 3.1:1 against the light surface and 3.95:1 against the dark; the
stepped marks of topics 9 to 24 go down to 2.75:1 (light) and 3.44:1 (dark),
and *Other*'s mark is 2.67:1 and 3.29:1. The comments
also state that the marks' order passes colour-blind checks. The library
holds no colour-vision simulation; the check, recomputed for this page,
simulates protanopia, deuteranopia and tritanopia at full severity
(Machado, Oliveira and Fernandes, 2009) and measures the OKLab distance
(ΔE × 100) between neighbouring marks of the order: at least 12.0 on the
light theme and 10.6 on the dark, both for deuteranopia, the worst case
(tritanopia 13.2 and 11.6); with normal vision neighbours differ by at least
22.1 and 20.1. Every topic is named, so colour
only tells neighbours apart. An explicit
`data-theme` on the page wins over the system's colour scheme; the search
page sets it from its *Theme* setting, and the maps redraw when it or the
system's scheme changes.

## Interaction

| To | Treemap, bubbles, radial | Florets |
|---|---|---|
| move between topics | arrow keys (right and down forward, left and up back, wrapping), Home, End | Tab |
| zoom in | a click, or Enter or Space on the chosen topic | a click, or Enter or Space |
| read a record | a click on it in a leaf's map: its abstract opens in the list | |
| zoom out | Escape or Backspace; a click between the bubbles or on the radial centre | Escape |

The path above the map, the *Zoom out* button and the browser's Back button
zoom out on every map. The canvas is one focusable element labelled with its
keys; a live region reads out each topic chosen with the keyboard ("3 of 12:
Breast Cancer, 59 records."). Hovering a topic shows its records, its share
of the focus and up to four subtopics. With *reduce motion* set in the
system, zooms, fades and blooms are off.

## The search page

### Loading

`index.html` loads five classic scripts in this order: `dist/broccoli.js`,
`app/colors.js`, `app/views.js`, `app/florets.js` and `app/app.js`. Under
CommonJS, `Broccoli` is `module.exports` instead of a global. The canvas maps
write their labels in `window.BroccoliFont` when a page sets it before
loading `app/views.js`, otherwise in Atkinson Hyperlegible, which the page
bundles with Newsreader (`app/fonts/`). Opened from disk, everything works,
with system fonts where a browser blocks web fonts on `file://` pages.

### Callbacks, events and workers

Broccoli has no event bus; its parts talk through callbacks:

| Part | Callback | Called |
|---|---|---|
| clusterer | `onProgress(stage, fraction)` | as a stage begins: `tokenize`, `phrases`, `labels`, `matrix`, `factorization`, `baseClusters`, `merge`, `clustering` (the fraction is always 0 in 1.3.0); the page shows a sentence for each |
| canvas maps | `onFocus(node)`, `onUp()` | a topic was chosen; zoom out was asked for |
| | `onRecord(doc, node)` | a record was chosen: the page opens its abstract in the list and scrolls to it |
| | `recordInfo(doc)`, `height(width)` | a record's title, journal and year; the map's height for a width |
| florets | `onSelect(id)`, `colorOf(cluster)` | a floret was chosen; a floret's colours |

`BroccoliViews.create(stage, options)` returns an object that takes
`setData(root, focus)`, `setFocus(node)`, `update()` when groups gain
subtopics, `setView(view)`, `refresh()` after a change of size or theme, and
`busyFor()`, the milliseconds until the running animation ends (the list of
records waits for it). Each node has an `id` (the root `t`, its third topic
`t.2`), `parent`, `depth`, `index` (which picks its colour), `label`,
`labels`, `merged`, `other`, `size`, `docs`, `children` and a `status`:
`idle`, `pending`, `ready` (with subtopics) or `leaf`.

`createClusterer()` starts a Web Worker from a Blob URL holding the
library's own source, which the single-file build records, so no other file
is fetched. The page posts `{type: 'cluster', id, documents, options}`; the
worker answers `progress`, then `result` or `error`. If workers are
unavailable or the worker fails, the same code runs on the page behind the
same promises. The page starts two clusterers, one for what a visitor waits
for and one for the look-ahead. It also follows `hashchange` and `popstate`,
window resizes and changes of the colour scheme.

### Settings and the address

The page keeps its settings in the browser (`localStorage`, under
`broccoli.settings.v1`): the number of records, the order, the algorithm, the
map style, the search filters, the text options, the parameters, the NCBI API
key, contact e-mail and E-utilities address, and the theme. Nothing else is
stored. The address's fragment holds the search and
the choices that decide the records and topics, so a link opens the same
view anywhere:

| Key | Holds | Left out when |
|---|---|---|
| `q` | the query | never |
| `n` | records, 100 to 2,000 | 200 |
| `sort` | `pub_date` for newest first | best match |
| `a` | `stc` or `bkm` | Lingo |
| `from`, `to` | years | not set |
| `f` | the filters on, comma-separated, or `none` | the defaults (records with an abstract) |
| `v` | `bubbles`, `radial` or `florets` | the treemap |
| `p` | the labels of the path to the open topic, separated by `\|` | at the top level |

A link carries its search: whatever it leaves out is the default, except the
map style, which stays the visitor's own unless the link names one.

## Performance and limits

| Limit | Value |
|---|---|
| records a search | 100 to 2,000; a link may ask for any number up to 2,000 |
| fields a document | 31 |
| ESearch | 10,000 records at most a request |
| EFetch | batches of 200 records (500 at most) |
| requests from the page | one every 349 ms without an API key, one every 115 ms with a key or through a proxy (NCBI allows 3 and 10 a second) |
| retries | 4 on 429 and server errors, after 0.6, 1.2, 2.4 and 4.8 s or as `Retry-After` asks; 2 on network errors; a 45 s timeout |
| subtopics | six levels below the search, groups of 8 or more records |
| drawn | 600 records a map, 400 dots a cell, 28 florets, 9 beads a bubble |

**Where the time goes.** Lingo's cost is mostly the factorisation (on the
search page, 30 NMF iterations, each a few products of the sparse matrix with
k columns);
STC compares at most 300 base clusters in pairs as bit sets; k-means runs five
trial bisections a split. All of it runs in workers, so the page stays
responsive; *About this result* gives the milliseconds a clustering took. On
the maps, the treemap's power diagrams cost the most: each evaluation clips
every cell by every other site, and each Newton step solves a dense linear
system, so the work grows with the cube of the number of cells. Each diagram
is therefore computed once per group and stage size and kept.

**What the topics can tell.** The clustering is lexical: records that say the
same thing in different words fall apart, and a word with two meanings joins
them. Records without an abstract are clustered on their title alone. Another
number of records, order or algorithm gives other topics.

## Licence

Broccoli is Copyright (c) 2026 Decentralized Science Labs LLC, under the MIT
License, whose text is in `LICENSE`. Its symmetric eigensolver follows the
public-domain JAMA reference implementation (The MathWorks and NIST), derived
from EISPACK. Its stemmers are written from the algorithm descriptions of
Martin Porter and the Snowball project; no Snowball code or vocabulary is
included. The stop word and stop label lists were compiled for Broccoli.
Records come from PubMed through NCBI's E-utilities. `NOTICE.md` credits the
papers each part is built on.

## References

- Abouelhoda MI, Kurtz S, Ohlebusch E (2004) Replacing suffix trees with
  enhanced suffix arrays. Journal of Discrete Algorithms 2.
- Arthur D, Vassilvitskii S (2007) k-means++: the advantages of careful
  seeding. In: Proceedings of the Eighteenth Annual ACM-SIAM Symposium on
  Discrete Algorithms (SODA 2007).
- Aurenhammer F (1987) Power diagrams: properties, algorithms and
  applications. SIAM Journal on Computing 16(1).
- Balzer M, Deussen O (2005) Voronoi treemaps. In: IEEE Symposium on
  Information Visualization (InfoVis 2005).
- Boutsidis C, Gallopoulos E (2008) SVD based initialization: a head start
  for nonnegative matrix factorization. Pattern Recognition 41.
- Bruls M, Huizing K, van Wijk JJ (2000) Squarified treemaps. In: Data
  Visualization 2000 (VisSym), Springer.
- Dhillon IS, Modha DS (2001) Concept decompositions for large sparse text
  data using clustering. Machine Learning 42.
- Kasai T, Lee G, Arimura H, Arikawa S, Park K (2001) Linear-time
  longest-common-prefix computation in suffix arrays and its applications.
  In: Combinatorial Pattern Matching (CPM 2001), Springer.
- Lanczos C (1950) An iteration method for the solution of the eigenvalue
  problem of linear differential and integral operators. Journal of
  Research of the National Bureau of Standards 45.
- Lee DD, Seung HS (2001) Algorithms for non-negative matrix factorization.
  Advances in Neural Information Processing Systems 13.
- Li SZ, Hou XW, Zhang HJ, Cheng QS (2001) Learning spatially localized,
  parts-based representation. In: IEEE Conference on Computer Vision and
  Pattern Recognition (CVPR 2001).
- Lloyd SP (1982) Least squares quantization in PCM. IEEE Transactions on
  Information Theory 28(2).
- Machado GM, Oliveira MM, Fernandes LAF (2009) A physiologically-based
  model for simulation of color vision deficiency. IEEE Transactions on
  Visualization and Computer Graphics 15(6).
- Nong G, Zhang S, Chan WH (2009) Linear suffix array construction by almost
  pure induced-sorting. In: Data Compression Conference (DCC 2009), IEEE.
- Osiński S (2006) Improving quality of search results clustering with
  approximate matrix factorisations. In: Advances in Information Retrieval
  (ECIR 2006), Springer.
- Osiński S, Stefanowski J, Weiss D (2004) Lingo: search results clustering
  algorithm based on singular value decomposition. In: Intelligent
  Information Processing and Web Mining (IIS 2004), Springer.
- Ottosson B (2020) A perceptual color space for image processing (OKLab).
  https://bottosson.github.io/posts/oklab/
- Porter M, the Snowball project. The English (Porter2) stemming algorithm
  and the Snowball stemmers. https://snowballstem.org/
- Sayers E (2010–) A general introduction to the E-utilities. In: Entrez
  Programming Utilities Help. National Center for Biotechnology Information.
  https://www.ncbi.nlm.nih.gov/books/NBK25497/
- Steinbach M, Karypis G, Kumar V (2000) A comparison of document clustering
  techniques. KDD Workshop on Text Mining.
- Sutherland IE, Hodgman GW (1974) Reentrant polygon clipping.
  Communications of the ACM 17.
- van Wijk JJ, Nuij WAA (2003) Smooth and efficient zooming and panning. In:
  IEEE Symposium on Information Visualization (InfoVis 2003).
- Vogel H (1979) A better way to construct the sunflower head. Mathematical
  Biosciences 44.
- W3C (2008) Web Content Accessibility Guidelines (WCAG) 2.0.
  https://www.w3.org/TR/WCAG20/
- Zamir O, Etzioni O (1998) Web document clustering: a feasibility
  demonstration. In: Proceedings of SIGIR '98, ACM.
- Zhang D, Dong Y (2004) Semantic, hierarchical, online clustering of web
  search results. In: Advanced Web Technologies and Applications (APWeb
  2004), Springer.
