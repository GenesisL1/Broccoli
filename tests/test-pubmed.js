import D from './target.js';
import { group, test, assert, assertEqual, assertDeepEqual, assertRejects } from './harness.js';
import {
  EFETCH_XML, EFETCH_ERROR_XML, ESEARCH_JSON, ESEARCH_ERROR_JSON, ESEARCH_XML, ESPELL_XML,
} from './fixtures/pubmed-fixtures.js';

group('PubMed');

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    headers: { get: (k) => headers[k] || headers[k.toLowerCase()] || null },
  };
}

/** A fake fetch that records calls and answers from a handler. */
function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const call = { url, method: init.method || 'GET', body: init.body || null, headers: init.headers || {}, time: Date.now() };
    calls.push(call);
    if (init.signal && init.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return handler(call, calls.length);
  };
  fn.calls = calls;
  return fn;
}

const params = (call) => {
  const q = call.method === 'POST' ? call.body : call.url.split('?')[1] || '';
  return Object.fromEntries(q.split('&').filter(Boolean).map((kv) => kv.split('=').map(decodeURIComponent)));
};

test('XML parser: entities, CDATA, comments, DOCTYPE with subset, attributes', () => {
  const doc = D.parseXml('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><!-- c --><r a="1 &amp; 2" b=\'q\'><t>x &lt; y &#947;&#x3B2;</t><![CDATA[<raw>]]><e/></r>');
  const r = doc.children.find((c) => typeof c !== 'string');
  assertEqual(r.name, 'r');
  assertEqual(r.attrs.a, '1 & 2');
  assertEqual(r.attrs.b, 'q');
  const t = r.children.find((c) => c.name === 't');
  assertEqual(t.children[0], 'x < y γβ');
  assert(r.children.includes('<raw>'));
  assert(r.children.some((c) => c.name === 'e'));
});

test('EFetch records: titles, structured abstracts, authors, IDs, MeSH, dates', () => {
  const { articles, error } = D.parsePubmedXml(EFETCH_XML);
  assertEqual(error, null);
  assertEqual(articles.length, 3);
  const [a, b, c] = articles;
  assertEqual(a.pmid, '39000001');
  assertEqual(a.title, 'HLA class II DRB1 alleles and CD4+ T-cell responses in <5-year-old children.');
  assertEqual(a.titleHtml, 'HLA class II <i>DRB1</i> alleles and CD4<sup>+</sup> T-cell responses in &lt;5-year-old children.');
  assertDeepEqual(a.abstractSections.map((s) => s.label), ['BACKGROUND', 'METHODS', 'RESULTS', 'CONCLUSIONS']);
  assert(a.abstract.includes('IFN-γ responses') && a.abstract.includes('120 children & measured'), a.abstract);
  assert(!a.abstract.includes('©'), 'copyright is not part of the abstract');
  assertEqual(a.authors.length, 4);
  assertEqual(a.authors[0].orcid, '0000-0001-2345-6789');
  assertEqual(a.authors[0].affiliations[0], 'Department of Imaginary Science, Example University, Paphos, Cyprus.');
  assertEqual(a.authors[2].collective, 'Imaginary Cohort Consortium');
  assertEqual(a.authorString, 'Novak AB, Silva J, Imaginary Cohort Consortium, et al.');
  assertEqual(a.doi, '10.1000/jii.2024.0001');
  assertEqual(a.pmcid, 'PMC11000001');
  assertDeepEqual(a.pubDate, { year: 2024, month: 4, day: 15, text: '2024 Apr 15' });
  assertEqual(a.year, 2024);
  assertEqual(a.journal.pages, '1116-22');
  assertEqual(a.journal.isoAbbreviation, 'J Imag Immunol');
  assertDeepEqual(a.mesh.map((m) => m.descriptor + (m.major ? '*' : '')), ['Humans', 'Child, Preschool', 'HLA-DR Antigens', 'CD4-Positive T-Lymphocytes*', 'Diabetes Mellitus, Type 2']);
  assertEqual(a.mesh[2].qualifiers[0].name, 'genetics');
  assertDeepEqual(a.keywords, ['antigen presentation', 'pediatrics']);
  assertDeepEqual(a.publicationTypes, ['Journal Article', 'Randomized Controlled Trial']);
  assertEqual(a.url, 'https://pubmed.ncbi.nlm.nih.gov/39000001/');
  // Translated title and MedlineDate.
  assertEqual(b.title, 'Vitamin D supplementation in older adults: a pilot study.');
  assertEqual(b.vernacularTitle, 'Suplementación con vitamina D en adultos mayores: estudio piloto.');
  assertEqual(b.year, 2019);
  assertEqual(b.pubDate.text, '2019 Nov-Dec');
  assertEqual(b.abstract, '');
  assertDeepEqual(b.languages, ['spa']);
  // Book chapter.
  assertEqual(c.type, 'book');
  assertEqual(c.title, 'HLA Typing Overview');
  assertEqual(c.journal.title, 'Imaginary Reviews');
  assertEqual(c.year, 2022);
});

test('EFetch error documents are reported', () => {
  const { articles, error } = D.parsePubmedXml(EFETCH_ERROR_XML);
  assertEqual(articles.length, 0);
  assert(/history data/.test(error), error);
});

test('toDocuments: title + abstract, optional MeSH without check tags, un-inverted', () => {
  const { articles } = D.parsePubmedXml(EFETCH_XML);
  const plain = D.toDocuments(articles);
  assertEqual(plain[0].terms, '');
  const docs = D.toDocuments(articles, { includeMesh: true, includeKeywords: true });
  assertEqual(docs[0].terms, 'HLA-DR Antigens; CD4-Positive T-Lymphocytes; Type 2 Diabetes Mellitus; antigen presentation; pediatrics');
  const major = D.toDocuments(articles, { includeMesh: true, majorMeshOnly: true });
  assertEqual(major[0].terms, 'HLA-DR Antigens; CD4-Positive T-Lymphocytes');
});

test('search: parameters, JSON parsing, translations and warnings', async () => {
  const f = fakeFetch(() => response(200, ESEARCH_JSON));
  const client = new D.PubMedClient({ fetch: f, email: 'me@example.org', apiKey: 'KEY', requestsPerSecond: 1000 });
  const s = await client.search('hla AND children', { retmax: 3, sort: 'pub_date', mindate: '2020', maxdate: '2024', useHistory: true });
  assertEqual(s.count, 1234);
  assertDeepEqual(s.ids, ['39000001', '39000002', '39000003']);
  assertEqual(s.webEnv, 'MCID_IMAGINARY');
  assertEqual(s.queryKey, '1');
  assert(s.queryTranslation.includes('[All Fields]'));
  assertDeepEqual(s.warnings, ['the']);
  const p = params(f.calls[0]);
  assert(f.calls[0].url.startsWith('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?'));
  assertEqual(p.db, 'pubmed');
  assertEqual(p.term, 'hla AND children');
  assertEqual(p.retmode, 'json');
  assertEqual(p.sort, 'pub_date');
  assertEqual(p.datetype, 'pdat');
  assertEqual(p.mindate, '2020');
  assertEqual(p.usehistory, 'y');
  assertEqual(p.tool, 'broccoli');
  assertEqual(p.email, 'me@example.org');
  assertEqual(p.api_key, 'KEY');
});

test('search: ESearch errors and XML fallback', async () => {
  const bad = new D.PubMedClient({ fetch: fakeFetch(() => response(200, ESEARCH_ERROR_JSON)), requestsPerSecond: 1000 });
  await assertRejects(bad.search('((('), /Invalid query/);
  const xml = new D.PubMedClient({ fetch: fakeFetch(() => response(200, ESEARCH_XML)), requestsPerSecond: 1000 });
  const s = await xml.search('hla');
  assertEqual(s.count, 2);
  assertDeepEqual(s.ids, ['39000001', '39000002']);
  await assertRejects(xml.search('   '), /Empty query/);
});

test('fetchArticles: POST batches, keeps the requested order, reports progress', async () => {
  const f = fakeFetch(() => response(200, EFETCH_XML));
  const client = new D.PubMedClient({ fetch: f, requestsPerSecond: 1000 });
  const progress = [];
  const articles = await client.fetchArticles(['39000003', '39000001', 'bogus', '39000002', '39000001'], {
    batchSize: 2,
    onProgress: (done, total) => progress.push(done + '/' + total),
  });
  assertDeepEqual(articles.map((a) => a.pmid), ['39000003', '39000001', '39000002']);
  assertEqual(f.calls.length, 2);
  assertEqual(f.calls[0].method, 'POST');
  assertEqual(f.calls[0].headers['Content-Type'], 'application/x-www-form-urlencoded');
  assertEqual(params(f.calls[0]).id, '39000003,39000001');
  assertEqual(params(f.calls[0]).retmode, 'xml');
  assertDeepEqual(progress, ['0/3', '2/3', '3/3']);
});

test('requests are rate limited (3/s without key)', async () => {
  const f = fakeFetch(() => response(200, ESEARCH_JSON));
  const client = new D.PubMedClient({ fetch: f });
  await Promise.all([client.search('a'), client.search('b'), client.search('c')]);
  const gaps = [f.calls[1].time - f.calls[0].time, f.calls[2].time - f.calls[1].time];
  assert(gaps.every((g) => g >= 300), 'gaps ' + gaps.join(', '));
  assertEqual(new D.PubMedClient({ fetch: f, apiKey: 'k' }).requestsPerSecond, 10);
  assertEqual(new D.PubMedClient({ fetch: f }).requestsPerSecond, 3);
  assertEqual(new D.PubMedClient({ fetch: f, baseUrl: 'https://proxy.example.org/eutils.php?u=' }).requestsPerSecond, 10);
});

test('retries on HTTP 429 and 5xx, fails on 4xx', async () => {
  const f = fakeFetch((call, n) => (n === 1 ? response(429, '{"error":"API rate limit exceeded"}') : n === 2 ? response(503, 'busy') : response(200, ESEARCH_JSON)));
  const client = new D.PubMedClient({ fetch: f, requestsPerSecond: 1000 });
  const s = await client.search('hla');
  assertEqual(s.count, 1234);
  assertEqual(f.calls.length, 3);
  const g = fakeFetch(() => response(400, 'bad request'));
  await assertRejects(new D.PubMedClient({ fetch: g, requestsPerSecond: 1000 }).search('x'), /HTTP 400/);
  assertEqual(g.calls.length, 1);
});

test('network failures surface as EutilsError after a short retry', async () => {
  const f = fakeFetch(() => { throw new TypeError('Failed to fetch'); });
  const err = await assertRejects(new D.PubMedClient({ fetch: f, requestsPerSecond: 1000 }).search('x'), /Could not reach NCBI/);
  assert(err instanceof D.EutilsError && err.network === true);
  assertEqual(f.calls.length, 3);
});

test('requests can be aborted', async () => {
  const f = fakeFetch(() => response(200, ESEARCH_JSON));
  const client = new D.PubMedClient({ fetch: f });
  const controller = new AbortController();
  const first = client.search('a');
  const second = client.search('b', { signal: controller.signal });
  controller.abort();
  await first;
  await assertRejects(second, /abort/i);
});

test('spell suggestions and searchAndFetch', async () => {
  const f = fakeFetch((call) => {
    if (call.url.includes('espell')) return response(200, ESPELL_XML);
    if (call.url.includes('esearch')) return response(200, ESEARCH_JSON);
    return response(200, EFETCH_XML);
  });
  const client = new D.PubMedClient({ fetch: f, requestsPerSecond: 1000 });
  assertEqual(await client.spell('astma childrn'), 'asthma children');
  const { search, articles } = await client.searchAndFetch('hla', { retmax: 3 });
  assertEqual(search.count, 1234);
  assertEqual(articles.length, 3);
  const all = await D.searchPubMed('hla', { client, includeMesh: true });
  assertEqual(all.documents.length, 3);
  assert(all.documents[0].terms.includes('CD4-Positive'));
});

test('custom base URL (for a proxy) is used as given', async () => {
  const f = fakeFetch(() => response(200, ESEARCH_JSON));
  const client = new D.PubMedClient({ fetch: f, baseUrl: 'https://proxy.example.org/eutils.php?u=', requestsPerSecond: 1000 });
  await client.search('x');
  assert(f.calls[0].url.startsWith('https://proxy.example.org/eutils.php?u=esearch.fcgi&db=pubmed'), f.calls[0].url);
  const g = fakeFetch(() => response(200, ESEARCH_JSON));
  await new D.PubMedClient({ fetch: g, baseUrl: 'https://mirror.example.org/eutils', requestsPerSecond: 1000 }).search('x');
  assert(g.calls[0].url.startsWith('https://mirror.example.org/eutils/esearch.fcgi?db='), g.calls[0].url);
});

test('exports: RIS, BibTeX, CSV, JSON', () => {
  const { articles } = D.parsePubmedXml(EFETCH_XML);
  const ris = D.toRis(articles);
  assert(ris.includes('TY  - JOUR') && ris.includes('AU  - Novak, Anna B') && ris.includes('SP  - 1116') && ris.includes('EP  - 1122'), ris);
  assert(ris.includes('DO  - 10.1000/jii.2024.0001') && ris.includes('ER  - '));
  const bib = D.toBibtex(articles);
  assert(bib.startsWith('@article{pmid39000001,') && bib.includes('pages = {1116--22}'), bib);
  const csv = D.toCsv(articles, [{ label: 'HLA', documents: [0, 2] }]);
  const lines = csv.split('\r\n');
  assertEqual(lines[0], 'pmid,title,authors,journal,year,doi,pmcid,clusters,url');
  assert(lines[1].startsWith('39000001,HLA class II') && lines[1].includes(',HLA,'), lines[1]);
  const json = JSON.parse(D.toJson({ algorithm: 'lingo', clusters: [{ label: 'HLA', labels: ['HLA'], size: 2, score: 1, documents: [0, 2] }] }, articles));
  assertDeepEqual(json.clusters[0].pmids, ['39000001', '39000003']);
});

test('clustering PubMed documents end to end (fixtures)', () => {
  const { articles } = D.parsePubmedXml(EFETCH_XML);
  const docs = D.toDocuments(articles.concat(articles), { includeMesh: true });
  const res = D.cluster(docs, { algorithm: 'lingo', preset: 'abstracts', fields: ['title', 'abstract', 'terms'] });
  assertEqual(res.documentCount, 6);
  assert(res.clusters.length > 0);
});

test('search asks for Best Match explicitly', async () => {
  const f = fakeFetch(() => response(200, ESEARCH_JSON));
  await new D.PubMedClient({ fetch: f, requestsPerSecond: 1000 }).search('asthma');
  assertEqual(params(f.calls[0]).sort, 'relevance');
});
