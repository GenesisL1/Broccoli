/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * PubMed EFetch XML (PubmedArticleSet) → plain article objects, and
 * articles → documents for clustering.
 */

import { parseXml, child, children, path, pathAll, textContent, safeHtml } from './xml.js';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** MeSH check tags: demographic descriptors that say nothing about the topic. */
export const MESH_CHECK_TAGS = new Set([
  'humans', 'animals', 'male', 'female', 'infant', 'infant, newborn', 'child', 'child, preschool',
  'adolescent', 'adult', 'young adult', 'middle aged', 'aged', 'aged, 80 and over', 'pregnancy',
  'mice', 'rats', 'cattle', 'dogs', 'cats', 'swine', 'rabbits', 'guinea pigs', 'cricetinae',
  'chick embryo', 'in vitro techniques', 'history, ancient', 'history, medieval',
]);

function parseMonth(m) {
  if (!m) return null;
  const n = parseInt(m, 10);
  if (Number.isFinite(n)) return n >= 1 && n <= 12 ? n : null;
  return MONTHS[String(m).slice(0, 3).toLowerCase()] || null;
}

function parseDate(node) {
  if (!node) return null;
  const year = parseInt(textContent(child(node, 'Year')), 10);
  const month = parseMonth(textContent(child(node, 'Month')));
  const day = parseInt(textContent(child(node, 'Day')), 10);
  const medline = textContent(child(node, 'MedlineDate'));
  let y = Number.isFinite(year) ? year : null;
  if (y === null && medline) {
    const m = /(\d{4})/.exec(medline);
    if (m) y = parseInt(m[1], 10);
  }
  if (y === null) return null;
  const parts = [String(y)];
  const monthName = month ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1] : null;
  if (monthName) parts.push(monthName);
  if (monthName && Number.isFinite(day)) parts.push(String(day));
  return {
    year: y,
    month: month || null,
    day: Number.isFinite(day) ? day : null,
    text: medline && !Number.isFinite(year) ? medline : parts.join(' '),
  };
}

function cleanTitle(s) {
  // Translated titles come in square brackets: "[Title in English]."
  const m = /^\[(.*)\]\.?$/.exec(s);
  return m ? m[1] + (m[1].endsWith('.') ? '' : '.') : s;
}

function parseAuthors(list) {
  return children(list, 'Author').map((a) => {
    const collective = textContent(child(a, 'CollectiveName'));
    const orcidNode = children(a, 'Identifier').find((id) => (id.attrs.Source || '').toUpperCase() === 'ORCID');
    return {
      lastName: textContent(child(a, 'LastName')) || null,
      foreName: textContent(child(a, 'ForeName')) || null,
      initials: textContent(child(a, 'Initials')) || null,
      suffix: textContent(child(a, 'Suffix')) || null,
      collective: collective || null,
      affiliations: pathAll(a, 'AffiliationInfo/Affiliation').map(textContent).filter(Boolean),
      orcid: orcidNode ? textContent(orcidNode).replace(/^https?:\/\/orcid\.org\//, '') : null,
      equalContrib: a.attrs.EqualContrib === 'Y',
    };
  });
}

/** "Smith J, Doe AB, Roe C, et al." */
export function formatAuthors(authors, max = 3) {
  const names = authors.map((a) => a.collective || [a.lastName, a.initials].filter(Boolean).join(' ')).filter(Boolean);
  if (names.length <= max) return names.join(', ');
  return names.slice(0, max).join(', ') + ', et al.';
}

function parseAbstract(abstractNode) {
  if (!abstractNode) return { text: '', sections: [] };
  const sections = children(abstractNode, 'AbstractText').map((n) => ({
    label: n.attrs.Label || null,
    category: n.attrs.NlmCategory || null,
    text: textContent(n),
    html: safeHtml(n),
  })).filter((s) => s.text);
  return { text: sections.map((s) => s.text).join(' '), sections };
}

function parseMesh(list) {
  return children(list, 'MeshHeading').map((h) => {
    const d = child(h, 'DescriptorName');
    return {
      descriptor: textContent(d),
      ui: d ? d.attrs.UI || null : null,
      major: d ? d.attrs.MajorTopicYN === 'Y' : false,
      qualifiers: children(h, 'QualifierName').map((q) => ({ name: textContent(q), ui: q.attrs.UI || null, major: q.attrs.MajorTopicYN === 'Y' })),
    };
  }).filter((m) => m.descriptor);
}

function articleIds(pubmedData) {
  const ids = {};
  for (const id of pathAll(pubmedData, 'ArticleIdList/ArticleId')) {
    const type = (id.attrs.IdType || '').toLowerCase();
    if (type && !ids[type]) ids[type] = textContent(id);
  }
  return ids;
}

function parsePubmedArticle(node) {
  const citation = child(node, 'MedlineCitation');
  const article = child(citation, 'Article');
  const pmid = textContent(child(citation, 'PMID'));
  const titleNode = child(article, 'ArticleTitle');
  const vernacular = textContent(child(article, 'VernacularTitle'));
  const abs = parseAbstract(child(article, 'Abstract'));
  const journal = child(article, 'Journal');
  const issue = child(journal, 'JournalIssue');
  const pubDate = parseDate(child(issue, 'PubDate'));
  const articleDate = parseDate(child(article, 'ArticleDate'));
  const ids = articleIds(child(node, 'PubmedData'));
  const elocDoi = children(article, 'ELocationID').find((e) => (e.attrs.EIdType || '').toLowerCase() === 'doi');
  const authors = parseAuthors(child(article, 'AuthorList'));
  const keywords = pathAll(citation, 'KeywordList/Keyword').map(textContent).filter(Boolean);
  const history = pathAll(node, 'PubmedData/History/PubMedPubDate');
  const pubmedEntry = history.find((h) => h.attrs.PubStatus === 'pubmed') || history.find((h) => h.attrs.PubStatus === 'entrez');
  let title = cleanTitle(textContent(titleNode)) || vernacular || '';
  return {
    type: 'article',
    pmid,
    title,
    titleHtml: titleNode ? safeHtml(titleNode).replace(/^\[(.*)\]\.?$/, '$1') : '',
    vernacularTitle: vernacular || null,
    abstract: abs.text,
    abstractSections: abs.sections,
    authors,
    authorString: formatAuthors(authors),
    journal: {
      title: textContent(child(journal, 'Title')) || null,
      isoAbbreviation: textContent(child(journal, 'ISOAbbreviation')) || textContent(path(citation, 'MedlineJournalInfo/MedlineTA')) || null,
      issn: textContent(child(journal, 'ISSN')) || null,
      volume: textContent(child(issue, 'Volume')) || null,
      issue: textContent(child(issue, 'Issue')) || null,
      pages: textContent(path(article, 'Pagination/MedlinePgn')) || null,
    },
    pubDate,
    articleDate,
    year: pubDate ? pubDate.year : articleDate ? articleDate.year : null,
    entryDate: pubmedEntry ? parseDate(pubmedEntry) : null,
    doi: ids.doi || (elocDoi ? textContent(elocDoi) : null),
    pmcid: ids.pmc || null,
    pii: ids.pii || null,
    mesh: parseMesh(child(citation, 'MeshHeadingList')),
    keywords,
    publicationTypes: pathAll(article, 'PublicationTypeList/PublicationType').map(textContent).filter(Boolean),
    languages: children(article, 'Language').map(textContent).filter(Boolean),
    chemicals: pathAll(citation, 'ChemicalList/Chemical/NameOfSubstance').map(textContent).filter(Boolean),
    status: citation ? citation.attrs.Status || null : null,
    url: pmid ? 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/' : null,
  };
}

function parseBookArticle(node) {
  const doc = child(node, 'BookDocument');
  const book = child(doc, 'Book');
  const pmid = textContent(child(doc, 'PMID'));
  const titleNode = child(doc, 'ArticleTitle') || child(book, 'BookTitle');
  const abs = parseAbstract(child(doc, 'Abstract'));
  const authors = parseAuthors(child(doc, 'AuthorList') || child(book, 'AuthorList'));
  const pubDate = parseDate(child(book, 'PubDate'));
  const ids = {};
  for (const id of pathAll(doc, 'ArticleIdList/ArticleId')) {
    const type = (id.attrs.IdType || '').toLowerCase();
    if (type && !ids[type]) ids[type] = textContent(id);
  }
  return {
    type: 'book',
    pmid,
    title: textContent(titleNode),
    titleHtml: safeHtml(titleNode),
    vernacularTitle: null,
    abstract: abs.text,
    abstractSections: abs.sections,
    authors,
    authorString: formatAuthors(authors),
    journal: {
      title: textContent(child(book, 'BookTitle')) || null,
      isoAbbreviation: textContent(path(book, 'Publisher/PublisherName')) || null,
      issn: null, volume: null, issue: null, pages: null,
    },
    pubDate,
    articleDate: null,
    year: pubDate ? pubDate.year : null,
    entryDate: null,
    doi: ids.doi || null,
    pmcid: ids.pmc || null,
    pii: null,
    mesh: [],
    keywords: pathAll(doc, 'KeywordList/Keyword').map(textContent).filter(Boolean),
    publicationTypes: pathAll(doc, 'PublicationType').map(textContent).filter(Boolean),
    languages: children(doc, 'Language').map(textContent).filter(Boolean),
    chemicals: [],
    status: null,
    url: pmid ? 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/' : null,
  };
}

/**
 * Parses an EFetch response (retmode=xml). Returns { articles, error }.
 * `error` is set when NCBI answered with an error document.
 */
export function parsePubmedXml(xml) {
  const doc = parseXml(xml);
  const rootEl = children(doc)[0] || null;
  if (!rootEl) return { articles: [], error: 'Empty response' };
  if (rootEl.name === 'eFetchResult' || rootEl.name === 'ERROR') {
    const err = rootEl.name === 'ERROR' ? textContent(rootEl) : textContent(child(rootEl, 'ERROR'));
    return { articles: [], error: err || 'E-utilities error' };
  }
  const articles = [];
  for (const node of children(rootEl)) {
    try {
      if (node.name === 'PubmedArticle') articles.push(parsePubmedArticle(node));
      else if (node.name === 'PubmedBookArticle') articles.push(parseBookArticle(node));
    } catch (err) {
      // A malformed record should not lose the whole batch.
    }
  }
  return { articles, error: null };
}

/**
 * Turns an inverted MeSH heading into natural word order when it has a
 * single inversion: "Diabetes Mellitus, Type 2" → "Type 2 Diabetes Mellitus".
 */
export function uninvertMesh(descriptor) {
  const parts = descriptor.split(', ');
  return parts.length === 2 ? parts[1] + ' ' + parts[0] : descriptor;
}

/**
 * Articles → clustering documents { id, title, abstract, terms }.
 * options = { includeMesh: false, includeKeywords: false, majorMeshOnly: false }
 * MeSH headings and keywords (when enabled) go into a "terms" field joined
 * by semicolons, so phrases never run from one heading into the next.
 */
export function toDocuments(articles, options = {}) {
  return articles.map((a) => {
    const terms = [];
    if (options.includeMesh) {
      for (const m of a.mesh) {
        if (MESH_CHECK_TAGS.has(m.descriptor.toLowerCase())) continue;
        if (options.majorMeshOnly && !m.major && !m.qualifiers.some((q) => q.major)) continue;
        terms.push(uninvertMesh(m.descriptor));
      }
    }
    if (options.includeKeywords) terms.push(...a.keywords);
    return {
      id: a.pmid,
      title: a.title,
      abstract: a.abstract,
      terms: terms.join('; '),
    };
  });
}

/** Parses an ESpell response. Returns the corrected query or null. */
export function parseSpellXml(xml) {
  const doc = parseXml(xml);
  const root = child(doc, 'eSpellResult');
  if (!root) return null;
  const corrected = textContent(child(root, 'CorrectedQuery'));
  const query = textContent(child(root, 'Query'));
  return corrected && corrected.toLowerCase() !== query.toLowerCase() ? corrected : null;
}

/** Parses an ESearch XML response (used when JSON is unavailable). */
export function parseSearchXml(xml) {
  const doc = parseXml(xml);
  const root = child(doc, 'eSearchResult');
  if (!root) return null;
  const err = textContent(child(root, 'ERROR'));
  return {
    count: parseInt(textContent(child(root, 'Count')), 10) || 0,
    retmax: parseInt(textContent(child(root, 'RetMax')), 10) || 0,
    retstart: parseInt(textContent(child(root, 'RetStart')), 10) || 0,
    queryKey: textContent(child(root, 'QueryKey')) || null,
    webEnv: textContent(child(root, 'WebEnv')) || null,
    ids: pathAll(root, 'IdList/Id').map(textContent),
    queryTranslation: textContent(child(root, 'QueryTranslation')) || null,
    errors: err ? [err] : [],
    warnings: pathAll(root, 'WarningList/OutputMessage').map(textContent),
    phrasesNotFound: pathAll(root, 'ErrorList/PhraseNotFound').map(textContent),
  };
}
