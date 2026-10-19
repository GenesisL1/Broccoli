/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Exports of records and clusters from any source: RIS and BibTeX for
 * reference managers, CSV for spreadsheets, JSON for everything else.
 * PubMed records keep their PMIDs as keys and accession numbers.
 */

function pages(p) {
  if (!p) return [null, null];
  const m = /^(\w+)\s*[-–]\s*(\w+)$/.exec(p);
  if (!m) return [p, null];
  let [, sp, ep] = m;
  // MEDLINE abbreviates end pages: 1116-22 means 1116-1122.
  if (/^\d+$/.test(sp) && /^\d+$/.test(ep) && ep.length < sp.length) ep = sp.slice(0, sp.length - ep.length) + ep;
  return [sp, ep];
}

const RIS_TYPES = {
  article: 'JOUR', review: 'JOUR', preprint: 'UNPB', book: 'CHAP', thesis: 'THES', report: 'RPRT', dataset: 'DATA',
  software: 'COMP', trial: 'GEN', page: 'ELEC', other: 'GEN',
};

/** The record's own identifier: its PMID for PubMed records, else its id in its source. */
function recordKey(a) {
  return a.pmid && (!a.source || a.source === 'pubmed') ? a.pmid : a.id || a.pmid || a.doi || '';
}

function venueOf(a) {
  const j = a.journal || {};
  return j.title || j.isoAbbreviation || a.publisher || null;
}

/** RIS records (one per record). */
export function toRis(articles) {
  const lines = [];
  for (const a of articles) {
    lines.push('TY  - ' + (RIS_TYPES[a.type] || 'JOUR'));
    if (a.title) lines.push('TI  - ' + a.title);
    for (const au of a.authors || []) {
      const name = au.collective || [au.lastName, au.foreName || au.initials].filter(Boolean).join(', ');
      if (name) lines.push('AU  - ' + name);
    }
    if (a.year) lines.push('PY  - ' + a.year);
    if (a.journal && a.journal.title) lines.push('T2  - ' + a.journal.title);
    if (a.journal && a.journal.isoAbbreviation) lines.push('J2  - ' + a.journal.isoAbbreviation);
    if (a.journal && a.journal.volume) lines.push('VL  - ' + a.journal.volume);
    if (a.journal && a.journal.issue) lines.push('IS  - ' + a.journal.issue);
    const [sp, ep] = pages(a.journal && a.journal.pages);
    if (sp) lines.push('SP  - ' + sp);
    if (ep) lines.push('EP  - ' + ep);
    if (a.journal && a.journal.issn) lines.push('SN  - ' + a.journal.issn);
    if (a.publisher && a.publisher !== (a.journal && a.journal.title)) lines.push('PB  - ' + a.publisher);
    if (a.doi) lines.push('DO  - ' + a.doi);
    const key = recordKey(a);
    if (key) lines.push('AN  - ' + key);
    if (a.url) lines.push('UR  - ' + a.url);
    for (const m of a.mesh || []) lines.push('KW  - ' + m.descriptor);
    for (const k of a.keywords || []) lines.push('KW  - ' + k);
    if (a.abstract) lines.push('AB  - ' + a.abstract);
    lines.push('ER  - ', '');
  }
  return lines.join('\r\n');
}

function bibEscape(s) {
  return String(s).replace(/[{}\\]/g, (c) => '\\' + c).replace(/[&%$#_]/g, (c) => '\\' + c);
}

function bibKey(a, used) {
  let key = a.pmid && (!a.source || a.source === 'pubmed') ? 'pmid' + a.pmid
    : String((a.source || 'ref') + '_' + (a.id || a.doi || '')).replace(/[^A-Za-z0-9_:.-]+/g, '_').replace(/_+$/, '');
  if (used.has(key)) {
    let n = 2;
    while (used.has(key + '_' + n)) n++;
    key += '_' + n;
  }
  used.add(key);
  return key;
}

/** BibTeX entries; PubMed records are keyed "pmid12345678", others by source and id. */
export function toBibtex(articles) {
  const used = new Set();
  return articles.map((a) => {
    const fields = [];
    const add = (k, v) => { if (v) fields.push('  ' + k + ' = {' + bibEscape(v) + '}'); };
    const journal = a.journal && (a.journal.title || a.journal.isoAbbreviation);
    const type = a.type === 'book' ? 'incollection' : (a.type === 'article' || a.type === 'review' || !a.type) && journal ? 'article' : 'misc';
    add('title', a.title);
    add('author', (a.authors || []).map((au) => au.collective || [au.lastName, au.foreName || au.initials].filter(Boolean).join(', ')).join(' and '));
    if (type === 'article') add('journal', journal);
    else if (type === 'incollection') add('booktitle', journal);
    else add('howpublished', venueOf(a));
    add('year', a.year && String(a.year));
    add('volume', a.journal && a.journal.volume);
    add('number', a.journal && a.journal.issue);
    add('pages', a.journal && a.journal.pages && a.journal.pages.replace(/-/g, '--'));
    if (a.publisher && type !== 'article') add('publisher', a.publisher);
    add('doi', a.doi);
    add('pmid', a.pmid);
    if (a.arxiv) { add('eprint', a.arxiv); add('archiveprefix', 'arXiv'); }
    if (type === 'misc' && a.tags && a.tags.length) add('note', a.tags.join(', '));
    add('url', a.url);
    return '@' + type + '{' + bibKey(a, used) + ',\n' + fields.join(',\n') + '\n}';
  }).join('\n\n');
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  // A cell a spreadsheet would read as a formula ("=HYPERLINK(…)", "+44 (band)") is kept as text.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * CSV with one row per record and its cluster labels.
 * clusters: result.clusters from cluster(); record order must match the
 * documents that were clustered.
 */
export function toCsv(articles, clusters = []) {
  const labelsOf = articles.map(() => []);
  for (const c of clusters) for (const d of c.documents) if (labelsOf[d]) labelsOf[d].push(c.label);
  const header = ['source', 'id', 'title', 'authors', 'venue', 'year', 'doi', 'pmid', 'pmcid', 'clusters', 'url'];
  const rows = articles.map((a, i) => [
    a.source || 'pubmed', recordKey(a), a.title, a.authorString, a.journal && (a.journal.isoAbbreviation || a.journal.title) || a.publisher, a.year,
    a.doi, a.pmid, a.pmcid, labelsOf[i].join(' | '), a.url,
  ].map(csvCell).join(','));
  return [header.join(',')].concat(rows).join('\r\n');
}

/** JSON snapshot: clusters (with the records' ids) and the records. */
export function toJson(result, articles, extra = {}) {
  const allPubmed = articles.length > 0 && articles.every((a) => a && a.pmid);
  return JSON.stringify(Object.assign({
    generator: 'Broccoli (Decentralized Science Labs)',
    created: new Date().toISOString(),
    algorithm: result && result.algorithm,
    clusters: result ? result.clusters.map((c) => {
      const out = {
        label: c.label,
        labels: c.labels,
        size: c.size,
        score: c.score,
        other: !!c.other,
        ids: c.documents.map((d) => articles[d] && recordKey(articles[d])),
      };
      if (allPubmed) out.pmids = c.documents.map((d) => articles[d] && articles[d].pmid);
      return out;
    }) : [],
    articles,
  }, extra), null, 2);
}
