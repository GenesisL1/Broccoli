/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Europe PMC: life-science literature (PubMed, PubMed Central, Agricola,
 * patents, theses) and preprints from bioRxiv, medRxiv, Research Square,
 * SSRN and other servers, through its REST search API, with abstracts.
 * https://europepmc.org/RestfulWebService
 */

import { buildUrl } from './http.js';
import { markupSections, markupToText, markupToSafeHtml } from './markup.js';
import { parseIsoDate, makeDate, pmidLink, pmcLink, doiLink } from './records.js';
import { notableTypes } from './pubmed.js';

export const EUROPEPMC_SEARCH = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

const SORTS = { relevance: undefined, date: 'P_PDATE_D desc', cited: 'CITED desc' };

const TYPES = { PPR: 'preprint', ETH: 'thesis', NBK: 'book', HIR: 'report', PAT: 'other' };

function list(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** The Europe PMC query with filters and years as clauses. */
export function europePmcQuery(query, req, extra) {
  const f = req.filters || {};
  const clauses = [];
  if (f.abstracts) clauses.push('HAS_ABSTRACT:Y');
  if (f.open) clauses.push('OPEN_ACCESS:Y');
  if (f.reviews) clauses.push('PUB_TYPE:"review"');
  if (f.peer) clauses.push('NOT SRC:PPR');
  if (extra) clauses.push(extra);
  if (req.from || req.to) clauses.push('PUB_YEAR:[' + (req.from || 1000) + ' TO ' + (req.to || 3000) + ']');
  return clauses.length ? '(' + query + ') AND ' + clauses.join(' AND ') : query;
}

/** One Europe PMC result (resultType=core) as a record. */
export function europePmcRecord(r) {
  const src = r.source || 'MED';
  const isPreprint = src === 'PPR';
  const ji = r.journalInfo || {};
  const j = ji.journal || {};
  const server = (r.bookOrReportDetails && r.bookOrReportDetails.publisher) || null;
  const authors = list(r.authorList && r.authorList.author).map((a) => {
    if (a.collectiveName) return { collective: a.collectiveName };
    const orcid = a.authorId && String(a.authorId.type).toUpperCase() === 'ORCID' ? a.authorId.value : null;
    if (!a.lastName && a.fullName) return { lastName: a.fullName, foreName: null, initials: null, orcid };
    return { lastName: a.lastName || null, foreName: a.firstName || null, initials: a.initials || null, orcid };
  });
  const types = list(r.pubTypeList && r.pubTypeList.pubType).map(String);
  const sections = markupSections(r.abstractText || '');
  const year = parseInt(r.pubYear, 10) || parseInt(ji.yearOfPublication, 10) || null;
  const printed = parseIsoDate(ji.printPublicationDate);
  const pubDate = ji.dateOfPublication && year
    ? makeDate(year, (printed && printed.year === year && printed.month) || ji.monthOfPublication, printed && printed.year === year ? printed.day : null, String(ji.dateOfPublication).trim())
    : parseIsoDate(r.firstPublicationDate) || (year ? makeDate(year) : null);
  const url = 'https://europepmc.org/article/' + src + '/' + r.id;
  const pmid = r.pmid || (src === 'MED' ? r.id : null);
  const tags = isPreprint ? ['Preprint'] : notableTypes(types);
  if (isPreprint && r.versionNumber) tags.push('Version ' + r.versionNumber);
  return {
    source: 'europepmc',
    id: src + ':' + r.id,
    type: TYPES[src] || (notableTypes(types).indexOf('Review') >= 0 ? 'review' : 'article'),
    title: markupToText(r.title || ''),
    titleHtml: markupToSafeHtml(r.title || ''),
    abstractSections: sections,
    authors,
    authorString: authors.length ? undefined : (r.authorString || '').replace(/\.$/, ''),
    journal: {
      title: j.title || (isPreprint ? server : null),
      isoAbbreviation: j.isoabbreviation || j.medlineAbbreviation || null,
      issn: j.issn || j.essn || null,
      volume: ji.volume || null,
      issue: ji.issue || null,
      pages: r.pageInfo || null,
    },
    publisher: server,
    year: year || (pubDate && pubDate.year),
    pubDate,
    doi: r.doi || null,
    pmid,
    pmcid: r.pmcid || null,
    url,
    links: [
      { label: 'Europe PMC', text: src + ':' + r.id, url },
      pmidLink(pmid),
      pmcLink(r.pmcid),
      doiLink(r.doi),
    ].filter(Boolean),
    keywords: list(r.keywordList && r.keywordList.keyword),
    mesh: list(r.meshHeadingList && r.meshHeadingList.meshHeading).map((m) => ({
      descriptor: m.descriptorName,
      major: m.majorTopic_YN === 'Y',
      qualifiers: list(m.meshQualifierList && m.meshQualifierList.meshQualifier).map((q) => ({ name: q.qualifierName, major: q.majorTopic_YN === 'Y' })),
    })).filter((m) => m.descriptor),
    publicationTypes: types,
    tags,
    languages: r.language ? [r.language] : [],
    openAccess: r.isOpenAccess === 'Y',
    citedBy: r.citedByCount != null ? +r.citedByCount : null,
  };
}

function europePmcPage(extra) {
  return async function fetchPage(req, page) {
    const url = buildUrl(EUROPEPMC_SEARCH, {
      query: europePmcQuery(req.query, req, extra),
      resultType: 'core',
      format: 'json',
      synonym: req.settings.synonyms === false ? 'false' : 'true',
      pageSize: page.size,
      cursorMark: page.cursor || '*',
      sort: SORTS[req.sort],
    });
    const json = await req.request.json(url, { signal: req.signal });
    const results = list(json.resultList && json.resultList.result);
    const next = json.nextCursorMark && json.nextCursorMark !== (page.cursor || '*') ? json.nextCursorMark : null;
    return { total: parseInt(json.hitCount, 10) || 0, records: results.map(europePmcRecord), cursor: results.length ? next : null };
  };
}

export const europePmcSource = {
  id: 'europepmc',
  name: 'Europe PMC',
  description: 'Life-science literature from PubMed, PubMed Central, Agricola, patents and theses, plus preprints, through the Europe PMC REST API.',
  homepage: 'https://europepmc.org/',
  docs: 'https://europepmc.org/RestfulWebService',
  terms: 'https://europepmc.org/Copyright',
  group: 'Biomedicine',
  service: 'europepmc',
  kinds: ['article', 'preprint', 'review', 'thesis', 'book'],
  idLabel: 'Europe PMC',
  syntax: 'Europe PMC syntax: fields such as TITLE:, AUTH:, ABSTRACT:, and AND, OR, NOT.',
  placeholder: 'tau propagation neurodegeneration',
  examples: [
    ['tau propagation neurodegeneration', 30], ['antibiotic tolerance persister cells', 26], ['mitochondrial dynamics aging', 24],
    ['single-cell RNA-seq atlas kidney', 21], ['phage therapy', 19], ['microplastics human health', 17], ['circadian clock metabolism', 15],
    ['malaria vaccine efficacy', 13], ['ferroptosis cancer', 11],
  ],
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'date', label: 'Most recent' }, { id: 'cited', label: 'Most cited' }],
  filters: [
    { id: 'abstracts', label: 'Only records with an abstract', help: 'Records without one have only a title to cluster on.', default: true },
    { id: 'open', label: 'Open access only' },
    { id: 'peer', label: 'Leave out preprints' },
    { id: 'reviews', label: 'Reviews only' },
  ],
  keywordsLabel: 'Keywords',
  years: true,
  biomedical: true,
  maxLimit: 2000,
  defaultLimit: 200,
  pageSize: 250,
  rateLimit: 5,
  fetchPage: europePmcPage(null),
};

export const preprintsSource = {
  id: 'preprints',
  name: 'Preprints',
  description: 'Preprints from bioRxiv, medRxiv, Research Square, SSRN, Preprints.org and more, as indexed by Europe PMC.',
  homepage: 'https://europepmc.org/',
  docs: 'https://europepmc.org/RestfulWebService',
  terms: 'https://europepmc.org/Copyright',
  group: 'Preprints',
  service: 'europepmc',
  kinds: ['preprint'],
  idLabel: 'Europe PMC',
  syntax: 'Europe PMC syntax: fields such as TITLE:, AUTH:, ABSTRACT:, and AND, OR, NOT.',
  placeholder: 'long read sequencing structural variants',
  examples: [
    ['long read sequencing structural variants', 28], ['protein language models', 26], ['SARS-CoV-2 evolution', 24],
    ['spatial transcriptomics', 21], ['organoids drug screening', 18], ['wastewater surveillance', 16], ['AlphaFold structure prediction', 14],
    ['microbiome infant development', 12], ['brain organoids', 10],
  ],
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'date', label: 'Most recent' }],
  filters: [
    { id: 'abstracts', label: 'Only preprints with an abstract', default: true },
  ],
  keywordsLabel: 'Keywords',
  years: true,
  biomedical: true,
  maxLimit: 2000,
  defaultLimit: 200,
  pageSize: 250,
  rateLimit: 5,
  fetchPage: europePmcPage('SRC:PPR'),
};
