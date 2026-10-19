# Notices and credits

Broccoli, a GenesisL1 in-house open-source search results clustering engine,
is © 2026 Decentralized Science Labs LLC and released under the MIT License
(see `LICENSE`). It is an independent implementation, written from the
published descriptions of the methods below. The notes credit the work it
is based on and the material it ships with.

## Algorithms

Clustering, implemented from the published descriptions:

- Lingo: S. Osiński, J. Stefanowski, D. Weiss. "Lingo: Search Results
  Clustering Algorithm Based on Singular Value Decomposition." Intelligent
  Information Processing and Web Mining (IIS) 2004; S. Osiński. "Improving
  Quality of Search Results Clustering with Approximate Matrix
  Factorisations." ECIR 2006.
- Suffix Tree Clustering: O. Zamir, O. Etzioni. "Web Document Clustering: A
  Feasibility Demonstration." SIGIR 1998.
- Bisecting k-means: M. Steinbach, G. Karypis, V. Kumar. "A Comparison of
  Document Clustering Techniques." KDD Workshop on Text Mining 2000.
- Phrase discovery with suffix arrays: D. Zhang, Y. Dong. "Semantic,
  Hierarchical, Online Clustering of Web Search Results." APWeb 2004;
  G. Nong, S. Zhang, W. H. Chan. "Linear Suffix Array Construction by Almost
  Pure Induced-Sorting." DCC 2009 (SA-IS); T. Kasai et al. "Linear-Time
  Longest-Common-Prefix Computation in Suffix Arrays and Its Applications."
  CPM 2001; M. I. Abouelhoda, S. Kurtz, E. Ohlebusch. "Replacing suffix trees
  with enhanced suffix arrays." Journal of Discrete Algorithms 2004.
- Matrix factorizations: D. D. Lee, H. S. Seung. "Algorithms for Non-negative
  Matrix Factorization." NIPS 2000; S. Z. Li et al. "Learning Spatially
  Localized, Parts-Based Representation." CVPR 2001 (local NMF);
  C. Boutsidis, E. Gallopoulos. "SVD based initialization: A head start for
  nonnegative matrix factorization." Pattern Recognition 2008 (NNDSVD);
  the Lanczos method with full reorthogonalization (C. Lanczos 1950;
  G. H. Golub, C. F. Van Loan, "Matrix Computations"); I. S. Dhillon,
  D. S. Modha. "Concept Decompositions for Large Sparse Text Data Using
  Clustering." Machine Learning 2001 (spherical k-means); D. Arthur,
  S. Vassilvitskii. "k-means++: The Advantages of Careful Seeding." SODA 2007.

Behind the maps of the search page:

- Voronoi treemaps: M. Balzer, O. Deussen. "Voronoi Treemaps." IEEE
  InfoVis 2005; laid out as power diagrams (F. Aurenhammer, "Power diagrams:
  properties, algorithms and applications." SIAM Journal on Computing 1987),
  clipped with the polygon clipping of I. E. Sutherland and G. W. Hodgman
  ("Reentrant polygon clipping." Communications of the ACM 1974) and relaxed
  towards centroids (S. P. Lloyd, "Least squares quantization in PCM." IEEE
  Transactions on Information Theory 1982).
- Squarified treemaps, the fallback layout: M. Bruls, K. Huizing,
  J. J. van Wijk. "Squarified Treemaps." Data Visualization 2000
  (Proceedings of VisSym).
- Smooth zooming: J. J. van Wijk, W. A. A. Nuij. "Smooth and efficient
  zooming and panning." IEEE InfoVis 2003.
- The sunflower spiral of the florets map: H. Vogel. "A better way to
  construct the sunflower head." Mathematical Biosciences 1979.
- The palette's colour space: B. Ottosson. "A perceptual color space for
  image processing" (OKLab), 2020. Contrast follows WCAG 2.0 (W3C, 2008).
- The circle packing (each circle placed touching two others where the
  packing keeps the map's shape, then all grown together while they fit), the
  radial layout and the morphing of shapes between zoom levels were written
  for Broccoli.

## JAMA

The symmetric eigensolver in `src/matrix/eigen.js` (Householder
tridiagonalization and the QL algorithm) is ported from JAMA, the Java Matrix
Package by The MathWorks and the National Institute of Standards and
Technology, which was released to the public domain. JAMA's routines derive
from the EISPACK Fortran subroutines.

## Snowball stemmers

The English (Porter2), German, French, Spanish, Italian, Portuguese, Dutch
(Porter variant) and Russian stemmers implement the algorithms published by
Martin Porter and the Snowball project at https://snowballstem.org/ (BSD
licensed). They were written from the algorithm descriptions and checked
word for word against the Snowball reference vocabularies, which are not
included here. No Snowball code is included.

## Word lists

The stop word and stop label lists in `src/text/lexicon-*.js` were compiled
for Broccoli.

## Fonts

The search page bundles subsets of two typefaces, both under the SIL Open
Font License 1.1 (license texts in `app/fonts/`):

- Newsreader, by Production Type.
- Atkinson Hyperlegible, by the Braille Institute of America.

## Data sources

The search sources call public APIs from the reader's browser. Broccoli is
not affiliated with or endorsed by any of the services below. Their records
stay subject to their own terms, and abstracts may be protected by the
copyright of their publishers.

- **PubMed** through the NCBI E-utilities API, a service of the National
  Center for Biotechnology Information at the U.S. National Library of
  Medicine. Use is subject to NCBI's usage guidelines
  (https://www.ncbi.nlm.nih.gov/books/NBK25497/) and disclaimer
  (https://www.ncbi.nlm.nih.gov/home/about/policies/).
- **Europe PMC**, run by EMBL's European Bioinformatics Institute, through
  its REST API (https://europepmc.org/RestfulWebService); the Preprints
  source uses the same API.
- **ClinicalTrials.gov**, a service of the U.S. National Library of
  Medicine, through its API version 2
  (https://clinicaltrials.gov/data-api/api).
- **OpenAlex**, by OurResearch, whose data are released under CC0
  (https://openalex.org/). The arXiv source reads arXiv's papers from the
  OpenAlex index.
- **arXiv**: the arXiv API source follows arXiv's API terms of use
  (https://info.arxiv.org/help/api/tou.html), including one request every
  three seconds, and links to arXiv's abstract pages. arXiv's descriptive
  metadata are available under CC0. Thank you to arXiv for use of its open
  access interoperability.
- **Crossref**, through its REST API
  (https://www.crossref.org/documentation/retrieve-metadata/rest-api/).
- **DOAJ**, the Directory of Open Access Journals, through its search API
  (https://doaj.org/api/docs).
- **DataCite**, through its REST API (https://support.datacite.org/docs/api).
- **INSPIRE-HEP**, run by a collaboration of high-energy physics
  laboratories, through its REST API
  (https://github.com/inspirehep/rest-api-doc).
- **Wikipedia**, through the MediaWiki action API of the Wikimedia
  Foundation (https://www.mediawiki.org/wiki/API:Search). Wikipedia text is
  available under the Creative Commons Attribution-ShareAlike licence; the
  search page links every result to its page.

The API responses in `tests/fixtures/` are hand-written examples in each
API's format and describe fictional records. The screenshots in
`docs/images/` show the topics Broccoli found in a PubMed search for
`longevity[tiab] AND (aging[tiab] OR ageing[tiab])` with abstracts.
The search results in `examples/basic.html` and `examples/map.html` are
short texts written for the examples.

## Names

Broccoli is part of the GenesisL1 ecosystem. "GenesisL1", "GL1X" and
"Broccoli" name projects of that ecosystem; the MIT License covers the code
and grants no rights to names or marks. The names of the data sources above
belong to their owners, and neither Broccoli nor GenesisL1 is affiliated
with or endorsed by them.
