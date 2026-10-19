/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Exports of PubMed articles and clusters: RIS and BibTeX for reference
 * managers, CSV for spreadsheets, JSON for everything else.
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

/** RIS records (one per article). */
export function toRis(articles) {
  const lines = [];
  for (const a of articles) {
    lines.push(a.type === 'book' ? 'TY  - CHAP' : 'TY  - JOUR');
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
    if (a.doi) lines.push('DO  - ' + a.doi);
    if (a.pmid) lines.push('AN  - ' + a.pmid);
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

/** BibTeX entries keyed "pmid12345678". */
export function toBibtex(articles) {
  return articles.map((a) => {
    const fields = [];
    const add = (k, v) => { if (v) fields.push('  ' + k + ' = {' + bibEscape(v) + '}'); };
    add('title', a.title);
    add('author', (a.authors || []).map((au) => au.collective || [au.lastName, au.foreName || au.initials].filter(Boolean).join(', ')).join(' and '));
    add('journal', a.journal && (a.journal.title || a.journal.isoAbbreviation));
    add('year', a.year && String(a.year));
    add('volume', a.journal && a.journal.volume);
    add('number', a.journal && a.journal.issue);
    add('pages', a.journal && a.journal.pages && a.journal.pages.replace(/-/g, '--'));
    add('doi', a.doi);
    add('pmid', a.pmid);
    add('url', a.url);
    return '@' + (a.type === 'book' ? 'incollection' : 'article') + '{pmid' + a.pmid + ',\n' + fields.join(',\n') + '\n}';
  }).join('\n\n');
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * CSV with one row per article and its cluster labels.
 * clusters: result.clusters from cluster(); article order must match the
 * documents that were clustered.
 */
export function toCsv(articles, clusters = []) {
  const labelsOf = articles.map(() => []);
  for (const c of clusters) for (const d of c.documents) if (labelsOf[d]) labelsOf[d].push(c.label);
  const header = ['pmid', 'title', 'authors', 'journal', 'year', 'doi', 'pmcid', 'clusters', 'url'];
  const rows = articles.map((a, i) => [
    a.pmid, a.title, a.authorString, a.journal && (a.journal.isoAbbreviation || a.journal.title), a.year,
    a.doi, a.pmcid, labelsOf[i].join(' | '), a.url,
  ].map(csvCell).join(','));
  return [header.join(',')].concat(rows).join('\r\n');
}

/** JSON snapshot: query, clusters (with PMIDs) and articles. */
export function toJson(result, articles, extra = {}) {
  return JSON.stringify(Object.assign({
    generator: 'Broccoli (Decentralized Science Labs)',
    created: new Date().toISOString(),
    algorithm: result && result.algorithm,
    clusters: result ? result.clusters.map((c) => ({
      label: c.label,
      labels: c.labels,
      size: c.size,
      score: c.score,
      other: !!c.other,
      pmids: c.documents.map((d) => articles[d] && articles[d].pmid),
    })) : [],
    articles,
  }, extra), null, 2);
}
