/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * The record every source returns, whatever API it comes from: a superset
 * of the PubMed article shape, so the exports, the search page and
 * toDocuments() treat a preprint, a dataset, a clinical trial or a
 * Wikipedia page the same way as a PubMed record.
 *
 *   { source, id, type, title, titleHtml, abstract, abstractSections,
 *     authors: [{ lastName, foreName, initials, collective, orcid }],
 *     authorString, journal: { title, isoAbbreviation, issn, volume, issue,
 *     pages }, publisher, year, pubDate: { year, month, day, text }, doi,
 *     pmid, pmcid, arxiv, url, links: [{ label, text, url }], keywords,
 *     mesh, publicationTypes, tags, languages, openAccess, citedBy, extra }
 */

import { markupToSafeHtml } from './markup.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const RECORD_TYPES = Object.freeze([
  'article', 'review', 'preprint', 'book', 'thesis', 'report', 'dataset', 'software', 'trial', 'page', 'other',
]);

/** MeSH check tags: demographic descriptors that say nothing about the topic. */
export const MESH_CHECK_TAGS = new Set([
  'humans', 'animals', 'male', 'female', 'infant', 'infant, newborn', 'child', 'child, preschool',
  'adolescent', 'adult', 'young adult', 'middle aged', 'aged', 'aged, 80 and over', 'pregnancy',
  'mice', 'rats', 'cattle', 'dogs', 'cats', 'swine', 'rabbits', 'guinea pigs', 'cricetinae',
  'chick embryo', 'in vitro techniques', 'history, ancient', 'history, medieval',
]);

/**
 * Turns an inverted MeSH heading into natural word order when it has a
 * single inversion: "Diabetes Mellitus, Type 2" → "Type 2 Diabetes Mellitus".
 */
export function uninvertMesh(descriptor) {
  const parts = descriptor.split(', ');
  return parts.length === 2 ? parts[1] + ' ' + parts[0] : descriptor;
}

/** "Smith J, Doe AB, Roe C, et al." */
export function formatAuthors(authors, max = 3) {
  const names = (authors || []).map((a) => a.collective || [a.lastName, a.initials].filter(Boolean).join(' ')).filter(Boolean);
  if (names.length <= max) return names.join(', ');
  return names.slice(0, max).join(', ') + ', et al.';
}

/**
 * Records → clustering documents { id, title, abstract, terms }.
 * options = { includeMesh: false, includeKeywords: false, majorMeshOnly: false }
 * MeSH headings and keywords (when enabled) go into a "terms" field joined
 * by semicolons, so phrases never run from one heading into the next.
 */
export function toDocuments(records, options = {}) {
  return (records || []).map((a) => {
    const terms = [];
    if (options.includeMesh) {
      for (const m of a.mesh || []) {
        if (!m || !m.descriptor || MESH_CHECK_TAGS.has(m.descriptor.toLowerCase())) continue;
        if (options.majorMeshOnly && !m.major && !(m.qualifiers || []).some((q) => q.major)) continue;
        terms.push(uninvertMesh(m.descriptor));
      }
    }
    if (options.includeKeywords) terms.push(...(a.keywords || []));
    return {
      id: a.id != null && a.id !== '' ? a.id : a.pmid,
      title: a.title || '',
      abstract: a.abstract || '',
      terms: terms.join('; '),
    };
  });
}

// ---------------------------------------------------------------- names

const PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'del', 'della', 'delle', 'dei', 'di', 'da', 'dal',
  'dos', 'das', 'do', 'du', 'la', 'le', 'ten', 'ter', 'te', 'zu', 'zur', 'af', 'av', 'bin', 'ibn', 'al', 'el', 'st.']);

/** "Jean-Pierre A." → "JPA" */
export function initialsOf(foreName) {
  if (!foreName) return null;
  const out = String(foreName).split(/[\s.\-‐]+/).filter(Boolean).map((p) => {
    const c = p.match(/\p{L}/u);
    return c ? c[0].toUpperCase() : '';
  }).join('');
  return out || null;
}

/** An author from family and given names. */
export function nameFromParts(family, given, extra) {
  const lastName = family ? String(family).trim() : null;
  const foreName = given ? String(given).trim() : null;
  return Object.assign({ lastName: lastName || null, foreName: foreName || null, initials: initialsOf(foreName), collective: null }, extra || {});
}

/** "Smith, John A." → { lastName: 'Smith', foreName: 'John A.', initials: 'JA' } */
export function parseInvertedName(name, extra) {
  const s = String(name || '').trim();
  const i = s.indexOf(',');
  if (i < 0) return parseDisplayName(s, extra);
  return nameFromParts(s.slice(0, i), s.slice(i + 1), extra);
}

/**
 * "John A. Smith" → { lastName: 'Smith', foreName: 'John A.' }; particles stay
 * with the family name: "Ludwig van Beethoven" → "van Beethoven". A name
 * with a comma is read as "Family, Given".
 */
export function parseDisplayName(name, extra) {
  const s = String(name || '').replace(/\s+/g, ' ').trim();
  if (!s) return Object.assign({ lastName: null, foreName: null, initials: null, collective: null }, extra || {});
  if (s.indexOf(',') > 0) return parseInvertedName(s, extra);
  const words = s.split(' ');
  if (words.length === 1) return nameFromParts(words[0], null, extra);
  let k = words.length - 1;
  while (k > 1 && PARTICLES.has(words[k - 1].toLowerCase()) && words[k - 1] === words[k - 1].toLowerCase()) k--;
  return nameFromParts(words.slice(k).join(' '), words.slice(0, k).join(' '), extra);
}

function normalizeAuthor(a) {
  if (!a) return null;
  if (typeof a === 'string') return parseDisplayName(a);
  const out = {
    lastName: a.lastName || null,
    foreName: a.foreName || null,
    initials: a.initials || initialsOf(a.foreName),
    collective: a.collective || null,
  };
  for (const k of Object.keys(a)) if (!(k in out)) out[k] = a[k];
  return out.lastName || out.foreName || out.collective ? out : null;
}

// ---------------------------------------------------------------- dates and ids

/** { year, month, day, text } from numbers, or null without a year. */
export function makeDate(year, month, day, text) {
  const y = parseInt(year, 10);
  if (!Number.isFinite(y) || y < 1000 || y > 3000) return null;
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  const mm = Number.isFinite(m) && m >= 1 && m <= 12 ? m : null;
  const dd = mm && Number.isFinite(d) && d >= 1 && d <= 31 ? d : null;
  return {
    year: y,
    month: mm,
    day: dd,
    text: text || [String(y), mm ? MONTH_NAMES[mm - 1] : null, dd ? String(dd) : null].filter(Boolean).join(' '),
  };
}

/** "2024-03-05", "2024-03", "2024", "2024-03-05T10:00:00Z" → a date. */
export function parseIsoDate(s, text) {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(String(s || '').trim());
  return m ? makeDate(m[1], m[2], m[3], text) : null;
}

/** "https://doi.org/10.1/ABC" → "10.1/ABC" */
export function normalizeDoi(doi) {
  if (!doi) return null;
  const s = String(doi).trim().replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return /^10\.\d{3,9}\//.test(s) ? s : null;
}

/** An address that is safe to link to: http(s) only, else null. */
export function safeUrl(url) {
  const s = String(url == null ? '' : url).trim();
  return /^https?:\/\/[^\s<>"]+$/i.test(s) ? s : null;
}

/** The doi.org address of a DOI, with the characters a URL cannot hold encoded. */
export function doiUrl(doi) {
  return doi ? 'https://doi.org/' + String(doi).split('/').map(encodeURIComponent).join('/') : null;
}

export function doiLink(doi) {
  return doi ? { label: 'doi', text: doi, url: doiUrl(doi) } : null;
}

export function pmidLink(pmid) {
  return pmid ? { label: 'PMID', text: String(pmid), url: 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/' } : null;
}

export function pmcLink(pmcid) {
  return pmcid ? { label: 'Free full text', text: pmcid, url: 'https://pmc.ncbi.nlm.nih.gov/articles/' + pmcid + '/' } : null;
}

export function arxivLink(arxiv) {
  return arxiv ? { label: 'arXiv', text: arxiv, url: 'https://arxiv.org/abs/' + arxiv } : null;
}

/** The usual identifier links of a record: PMID, PMC, arXiv, DOI. */
export function standardLinks(r) {
  return [pmidLink(r.pmid), pmcLink(r.pmcid), arxivLink(r.arxiv), doiLink(r.doi)].filter(Boolean);
}

function uniqueStrings(list) {
  const seen = new Set();
  const out = [];
  for (const v of list || []) {
    const s = v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * A complete record from the fields a source adapter filled in: missing
 * fields get their defaults, the author string, the abstract's sections,
 * the identifier links and the landing page are derived, and any extra
 * fields are kept.
 */
export function makeRecord(source, fields = {}) {
  const r = fields || {};
  const authors = (r.authors || []).map(normalizeAuthor).filter(Boolean);
  const title = String(r.title || '').replace(/\s+/g, ' ').trim();
  // HTML from a source is filtered again here, so a record can never carry markup beyond <i>, <b>, <u>, <sup>, <sub>.
  let sections = (r.abstractSections || []).filter((s) => s && s.text).map((s) => Object.assign({}, s, {
    label: s.label || null,
    text: String(s.text).replace(/\s+/g, ' ').trim(),
    html: s.html ? markupToSafeHtml(s.html) : escapeHtml(String(s.text).replace(/\s+/g, ' ').trim()),
  }));
  let abstract = r.abstract != null ? String(r.abstract).replace(/\s+/g, ' ').trim() : sections.map((s) => s.text).join(' ');
  if (!sections.length && abstract) sections = [{ label: null, text: abstract, html: escapeHtml(abstract) }];
  const doi = normalizeDoi(r.doi);
  const pubDate = r.pubDate || (r.year ? makeDate(r.year) : null);
  const year = parseInt(r.year, 10) || (pubDate && pubDate.year) || null;
  const rec = {
    source: r.source || source,
    id: String(r.id != null && r.id !== '' ? r.id : r.pmid || doi || r.url || title).trim(),
    type: RECORD_TYPES.indexOf(r.type) >= 0 ? r.type : r.type ? 'other' : 'article',
    title,
    titleHtml: r.titleHtml ? markupToSafeHtml(r.titleHtml) : escapeHtml(title),
    abstract,
    abstractSections: sections,
    authors,
    authorString: r.authorString != null ? String(r.authorString) : formatAuthors(authors),
    journal: Object.assign({ title: null, isoAbbreviation: null, issn: null, volume: null, issue: null, pages: null }, r.journal || {}),
    publisher: r.publisher || null,
    year,
    pubDate,
    doi,
    pmid: r.pmid ? String(r.pmid) : null,
    pmcid: r.pmcid ? String(r.pmcid) : null,
    arxiv: r.arxiv ? String(r.arxiv) : null,
    url: safeUrl(r.url) || doiUrl(doi),
    links: null,
    keywords: uniqueStrings(r.keywords),
    mesh: r.mesh || [],
    publicationTypes: uniqueStrings(r.publicationTypes),
    tags: uniqueStrings(r.tags),
    languages: uniqueStrings(r.languages),
    openAccess: r.openAccess == null ? null : !!r.openAccess,
    citedBy: Number.isFinite(+r.citedBy) && r.citedBy !== null && r.citedBy !== '' ? +r.citedBy : null,
    extra: r.extra || {},
  };
  rec.links = (r.links || standardLinks(rec))
    .filter((l) => l && safeUrl(l.url))
    .map((l) => ({ label: String(l.label || 'Link'), text: String(l.text || l.url), url: safeUrl(l.url) }));
  for (const k of Object.keys(r)) if (!(k in rec)) rec[k] = r[k];
  return rec;
}
