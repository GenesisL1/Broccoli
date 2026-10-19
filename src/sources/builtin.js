/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * The built-in sources, registered in the order a search page lists them.
 * Every one of them answers requests from web pages (CORS) except the
 * arXiv API, which is registered with browser: false.
 */

import { registerSource } from './registry.js';
import { pubmedSource } from './pubmed.js';
import { europePmcSource, preprintsSource } from './europepmc.js';
import { openAlexSource, arxivSource } from './openalex.js';
import { crossrefSource } from './crossref.js';
import { doajSource } from './doaj.js';
import { clinicalTrialsSource } from './clinicaltrials.js';
import { dataciteSource } from './datacite.js';
import { inspireSource } from './inspire.js';
import { wikipediaSource } from './wikipedia.js';
import { arxivApiSource } from './arxiv.js';

export const BUILTIN_SOURCES = Object.freeze([
  pubmedSource, europePmcSource, clinicalTrialsSource, preprintsSource, arxivSource, openAlexSource, crossrefSource,
  doajSource, dataciteSource, inspireSource, wikipediaSource, arxivApiSource,
].map(registerSource));
