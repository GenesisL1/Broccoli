import D from './target.js';
import { group, test, assert, assertEqual, assertDeepEqual, assertRejects, assertThrows } from './harness.js';
import {
  EUROPEPMC_PAGE1, EUROPEPMC_PAGE2, OPENALEX_WORKS, CROSSREF_WORKS, DOAJ_ARTICLES, CTGOV_STUDIES, DATACITE_DOIS,
  INSPIRE_LITERATURE, WIKIPEDIA_SEARCH, ARXIV_FEED, ARXIV_ERROR_FEED,
} from './fixtures/sources-fixtures.js';
import { EFETCH_XML, ESEARCH_JSON } from './fixtures/pubmed-fixtures.js';

group('Sources');

function response(status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    headers: { get: (k) => headers[k] || headers[k.toLowerCase()] || null },
  };
}

/** A fake fetch that records calls and answers from a handler (call, n). */
function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const call = { url, method: init.method || 'GET', body: init.body || null, headers: init.headers || null };
    calls.push(call);
    if (init.signal && init.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return handler(call, calls.length);
  };
  fn.calls = calls;
  return fn;
}

/** Query parameters of a URL, decoded. */
function query(url) {
  const out = {};
  const q = url.split('?')[1] || '';
  for (const kv of q.split('&').filter(Boolean)) {
    const i = kv.indexOf('=');
    out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
  }
  return out;
}

const FAST = { requestsPerSecond: 1000 };

// ---------------------------------------------------------------- registry

test('registry: built-in sources, in order, all described', () => {
  const ids = D.listSources().map((s) => s.id);
  assertDeepEqual(ids.slice(0, 12), ['pubmed', 'europepmc', 'clinicaltrials', 'preprints', 'arxiv', 'openalex', 'crossref', 'doaj',
    'datacite', 'inspire', 'wikipedia', 'arxiv-api']);
  for (const s of D.BUILTIN_SOURCES) {
    assert(s.name && s.description && s.homepage && s.docs, s.id + ' describes itself');
    assert(s.sorts.length >= 1 && s.sorts[0].id === 'relevance', s.id + ' sorts by relevance first');
    assert(s.examples.length >= 1 && s.examples.every((e) => e.query && e.weight > 0), s.id + ' has examples');
    assert(s.maxLimit >= s.defaultLimit && s.pageSize >= 1, s.id + ' limits');
    assert(typeof s.fetchPage === 'function' || typeof s.search === 'function', s.id + ' fetches');
    assert(Object.isFrozen(s), s.id + ' is frozen');
  }
  assertEqual(D.getSource('arxiv-api').browser, false);
  assertEqual(D.getSource('arxiv').browser, true);
  assertEqual(D.getSource('nope'), null);
});

test('registry: defineSource checks and fills in defaults', () => {
  assertThrows(() => D.defineSource({ id: 'Bad Id', fetchPage() {} }), /lower-case/);
  assertThrows(() => D.defineSource({ id: 'nofetch' }), /fetchPage/);
  const s = D.defineSource({ id: 'mine', fetchPage: async () => ({ records: [] }), filters: [{ id: 'x', label: 'X', default: 1 }] });
  assertEqual(s.name, 'mine');
  assertDeepEqual(s.sorts.map((o) => o.id), ['relevance']);
  assertEqual(s.filters[0].default, true);
  assertEqual(s.browser, true);
  assertEqual(s.defaultLimit, 200);
  assertEqual(D.defineSource(s), s, 'a defined source is returned as is');
  const r = D.registerSource({ id: 'test-temp', name: 'Temp', fetchPage: async () => ({ records: [] }) });
  assertEqual(D.getSource('test-temp'), r);
  assert(D.unregisterSource('test-temp'));
  assertEqual(D.getSource('test-temp'), null);
});

test('searchSource pages with a cursor, keeps the limit, removes duplicates, reports progress', async () => {
  const seen = [];
  const source = {
    id: 'paged', pageSize: 3, maxLimit: 100,
    async fetchPage(req, page) {
      seen.push(page);
      const start = page.cursor ? +page.cursor : 0;
      const records = [0, 1, 2].map((i) => ({ id: 'r' + Math.min(start + i, 6), title: 'T ' + (start + i) }));
      return { total: 50, records, cursor: String(start + 3) };
    },
  };
  const progress = [];
  const res = await D.searchSource(source, ' some words ', { limit: 7, onProgress: (d, t) => progress.push([d, t]) });
  assertEqual(res.query, 'some words');
  assertEqual(res.total, 50);
  assertDeepEqual(res.records.map((r) => r.id), ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  assertDeepEqual(seen.map((p) => [p.page, p.size, p.offset, p.cursor]), [[1, 3, 0, null], [2, 3, 3, '3'], [3, 3, 6, '6']]);
  assertDeepEqual(progress[0], [0, 7]);
  assertDeepEqual(progress[progress.length - 1], [7, 7]);
  assertEqual(res.records[0].type, 'article');
  assertEqual(res.records[0].source, 'paged');
});

test('searchSource stops on a short page, an empty page, or cursor null', async () => {
  let calls = 0;
  const byNumber = { id: 'bynumber', pageSize: 10, async fetchPage(req, page) { calls++; return { total: null, records: page.page === 1 ? Array.from({ length: 10 }, (_, i) => ({ id: 'a' + i })) : [{ id: 'b' }] }; } };
  const a = await D.searchSource(byNumber, 'q', { limit: 100 });
  assertEqual(a.records.length, 11);
  assertEqual(calls, 2);
  assertEqual(a.total, 11, 'without a total the count is what came back');
  const ended = { id: 'ended', pageSize: 2, async fetchPage() { return { records: [{ id: 'x' }, { id: 'y' }], cursor: null }; } };
  assertEqual((await D.searchSource(ended, 'q', { limit: 50 })).records.length, 2);
});

test('searchSource resolves sort, filters and years, and passes settings', async () => {
  let got = null;
  const source = {
    id: 'opts', years: true,
    sorts: [{ id: 'relevance' }, { id: 'date' }],
    filters: [{ id: 'a', default: true }, { id: 'b' }],
    async fetchPage(req) { got = req; return { records: [], total: 0 }; },
  };
  await D.searchSource(source, 'q', { sort: 'nonsense', filters: { b: true }, from: '2015', to: 'x', settings: { apiKey: 'k' } });
  assertEqual(got.sort, 'relevance');
  assertDeepEqual(got.filters, { a: true, b: true });
  assertEqual(got.from, 2015);
  assertEqual(got.to, null);
  assertEqual(got.settings.apiKey, 'k');
  await assertRejects(D.searchSource(source, '   '), /Type something/);
  await assertRejects(D.searchSource('no-such-source', 'q'), /Unknown source/);
});

test('searchSource can be cancelled', async () => {
  const controller = new AbortController();
  const source = { id: 'slow', async fetchPage(req) { controller.abort(); return { records: [{ id: 'a' }], cursor: 'more' }; } };
  const err = await assertRejects(D.searchSource(source, 'q', { signal: controller.signal }));
  assertEqual(err.name, 'AbortError');
});

// ---------------------------------------------------------------- requests

test('requester retries 503, then succeeds; gives up on 429 with kind rate-limit', async () => {
  const f = fakeFetch((call, n) => (n < 3 ? response(503, 'busy') : response(200, '{"ok":1}')));
  const r = D.createRequester({ source: 'rq1', name: 'Rq', fetch: f, requestsPerSecond: 1000, gateKey: 'test-rq1' });
  const json = await r.json('https://example.org/a');
  assertEqual(json.ok, 1);
  assertEqual(f.calls.length, 3);
  assertEqual(r.count, 3);
  const g = fakeFetch(() => response(429, 'slow down'));
  const r2 = D.createRequester({ source: 'rq2', fetch: g, requestsPerSecond: 1000, gateKey: 'test-rq2', maxRetries: 1 });
  const err = await assertRejects(r2.text('https://example.org/b'), /limiting/);
  assertEqual(err.kind, 'rate-limit');
  assertEqual(err.status, 429);
  assertEqual(g.calls.length, 2);
});

test('requester: network errors and bad JSON have their own kinds; 404 is not retried', async () => {
  const f = fakeFetch(() => { throw new TypeError('Failed to fetch'); });
  const r = D.createRequester({ source: 'net', name: 'Net', fetch: f, requestsPerSecond: 1000, gateKey: 'test-net' });
  const err = await assertRejects(r.text('https://example.org/'), /Could not reach Net/);
  assertEqual(err.kind, 'network');
  assertEqual(f.calls.length, 2, 'one more try for a network error');
  const g = fakeFetch(() => response(200, '<html>'));
  const err2 = await assertRejects(D.createRequester({ source: 'bad', fetch: g, gateKey: 'test-bad', requestsPerSecond: 1000 }).json('https://example.org/'), /not JSON/);
  assertEqual(err2.kind, 'parse');
  const h = fakeFetch(() => response(404, '<h1>Not found</h1>'));
  const err3 = await assertRejects(D.createRequester({ source: 'nf', name: 'NF', fetch: h, gateKey: 'test-nf', requestsPerSecond: 1000 }).text('https://example.org/'), /HTTP 404: Not found/);
  assertEqual(err3.kind, 'http');
  assertEqual(h.calls.length, 1);
});

test('requester spaces requests out by the rate limit', async () => {
  const times = [];
  const f = fakeFetch(() => { times.push(Date.now()); return response(200, '1'); });
  const r = D.createRequester({ source: 'spaced', fetch: f, requestsPerSecond: 20, gateKey: 'test-spaced' });
  await Promise.all([r.text('u1'), r.text('u2'), r.text('u3')]);
  assert(times[1] - times[0] >= 45 && times[2] - times[1] >= 45, 'about 50 ms apart: ' + times.join(','));
});

test('buildUrl leaves out empty parameters and encodes the rest', () => {
  assertEqual(D.buildUrl('https://x.org/s', { q: 'a b&c', n: 0, e: '', u: undefined, l: ['x', 'y'] }), 'https://x.org/s?q=a%20b%26c&n=0&l=x%2Cy');
  assertEqual(D.buildUrl('https://x.org/s?k=1', { q: 'z' }), 'https://x.org/s?k=1&q=z');
  assertEqual(D.buildUrl('https://x.org/s', {}), 'https://x.org/s');
});

// ---------------------------------------------------------------- markup and records

test('markup: plain text, safe HTML and abstract sections from HTML and JATS', () => {
  assertEqual(D.markupToText('A <i>p16</i><sup>+</sup> &amp; &beta;-cell &#x2009;test &lt;5'), 'A p16+ & β-cell  test <5'.replace(/\s+/g, ' '));
  assertEqual(D.markupToSafeHtml('<i>p16</i> <script>x</script><b onclick="y">bold</b> <a href="z">link</a>'), '<i>p16</i> <b>bold</b> link');
  assertEqual(D.markupToText('IL-6 <IL-8 and TNF> 2'), 'IL-6 <IL-8 and TNF> 2', 'unknown "tags" in plain text stay text');
  assertEqual(D.markupToText('p<0.05, n = 3 > 2'), 'p<0.05, n = 3 > 2');
  const html = D.markupSections('<h4>Background</h4>Cells age.<h4>Methods</h4>We <b>looked</b>.');
  assertDeepEqual(html.map((s) => s.label), ['Background', 'Methods']);
  assertEqual(html[1].html, 'We <b>looked</b>.');
  const jats = D.markupSections('<jats:title>Abstract</jats:title><jats:sec><jats:title>Aims</jats:title><jats:p>To test.</jats:p></jats:sec><jats:sec><jats:title>Results:</jats:title><jats:p>It <jats:italic>worked</jats:italic>.</jats:p></jats:sec>');
  assertDeepEqual(jats.map((s) => [s.label, s.text]), [['Aims', 'To test.'], ['Results', 'It worked.']]);
  assertEqual(jats[1].html, 'It <i>worked</i>.');
  const plain = D.markupSections('<jats:title>Abstract</jats:title><jats:p>Just one paragraph.</jats:p>');
  assertDeepEqual(plain.map((s) => [s.label, s.text]), [[null, 'Just one paragraph.']]);
  assertEqual(D.markupToSafeHtml('<i>unclosed'), '<i>unclosed</i>');
  assertEqual(D.unescapeMarkdown('psilocybin\\-assisted \\*therapy\\*'), 'psilocybin-assisted *therapy*');
});

test('records: names, dates, DOIs, defaults and links', () => {
  assertDeepEqual(D.parseDisplayName('Ludwig van Beethoven'), { lastName: 'van Beethoven', foreName: 'Ludwig', initials: 'L', collective: null });
  assertEqual(D.parseDisplayName('Maria de la Cruz').lastName, 'de la Cruz');
  assertEqual(D.parseDisplayName('Smith, John A.').initials, 'JA');
  assertEqual(D.parseInvertedName('Okafor, Chidi-Emeka').initials, 'CE');
  assertEqual(D.initialsOf('J.-P.'), 'JP');
  assertDeepEqual(D.parseIsoDate('2024-03-05T10:00:00Z'), { year: 2024, month: 3, day: 5, text: '2024 Mar 5' });
  assertEqual(D.parseIsoDate('nope'), null);
  assertEqual(D.normalizeDoi('https://doi.org/10.1000/ABC.1'), '10.1000/ABC.1');
  assertEqual(D.normalizeDoi('not a doi'), null);
  const r = D.makeRecord('mine', { title: '  A   title ', abstract: 'Text.', doi: 'doi:10.1000/x', authors: ['Ada Lovelace', { collective: 'Team' }, {}], year: '2020', extraField: 7 });
  assertEqual(r.source, 'mine');
  assertEqual(r.id, '10.1000/x', 'the DOI stands in for a missing id');
  assertEqual(r.title, 'A title');
  assertEqual(r.authorString, 'Lovelace A, Team');
  assertEqual(r.url, 'https://doi.org/10.1000/x');
  assertDeepEqual(r.links.map((l) => l.label), ['doi']);
  assertDeepEqual(r.abstractSections, [{ label: null, text: 'Text.', html: 'Text.' }]);
  assertEqual(r.year, 2020);
  assertEqual(r.pubDate.text, '2020');
  assertEqual(r.extraField, 7, 'extra fields are kept');
  assertEqual(D.makeRecord('x', { type: 'poem' }).type, 'other');
});

test('records never carry script: only http(s) links, only inline formatting', () => {
  const r = D.makeRecord('x', {
    id: 'e', title: 'T', url: 'javascript:alert(1)',
    titleHtml: '<img src=x onerror=alert(1)>T<i>i</i>',
    links: [{ label: 'Bad', text: 'x', url: 'javascript:alert(1)' }, { label: 'Ok', text: 'y', url: 'https://ok.example/a' }, { label: 'Data', url: 'data:text/html,x' }],
    abstractSections: [{ text: 'A b', html: '<script>alert(1)</script>A <b onclick="x()">b</b>' }],
  });
  assertEqual(r.url, null);
  assertDeepEqual(r.links, [{ label: 'Ok', text: 'y', url: 'https://ok.example/a' }]);
  assertEqual(r.titleHtml, 'T<i>i</i>');
  assertEqual(r.abstractSections[0].html, 'A <b>b</b>');
  assertEqual(D.safeUrl(' https://x.org/p?q=1 '), 'https://x.org/p?q=1');
  assertEqual(D.safeUrl('https://x.org/a"onmouseover=1'), null);
  assertEqual(D.doiUrl('10.1000/a b#c'), 'https://doi.org/10.1000/a%20b%23c');
  assertEqual(D.makeRecord('x', { doi: '10.1000/a b' }).url, 'https://doi.org/10.1000/a%20b');
});

test('toDocuments works on any record, with subject terms on request', () => {
  const recs = [D.makeRecord('trials', { id: 'NCT1', title: 'T', abstract: 'A', keywords: ['Asthma', 'Inhaler'], mesh: [{ descriptor: 'Humans', qualifiers: [] }, { descriptor: 'Asthma, Severe', major: true, qualifiers: [] }] })];
  assertDeepEqual(D.toDocuments(recs), [{ id: 'NCT1', title: 'T', abstract: 'A', terms: '' }]);
  assertEqual(D.toDocuments(recs, { includeMesh: true, includeKeywords: true })[0].terms, 'Severe Asthma; Asthma; Inhaler');
});

test('markup stays fast and leaves plain-text angle brackets alone', () => {
  const t0 = Date.now();
  assertEqual(D.markupToText('Sequence <' + 'ACGT'.repeat(20000)).length, 10 + 80000);
  assertEqual(D.markupToText('<' + 'a <'.repeat(20000)).length > 0, true);
  assert(Date.now() - t0 < 1500, 'took ' + (Date.now() - t0) + ' ms');
  assertEqual(D.markupToText('Code at <https://github.com/x/y> and <doi:10.5281/zenodo.1>.'), 'Code at <https://github.com/x/y> and <doi:10.5281/zenodo.1>.');
  assertEqual(D.markupToText('Mail <mailto:a@b.org>, see <a:b>'), 'Mail <mailto:a@b.org>, see <a:b>');
  assertEqual(D.markupToSafeHtml('<jats:p>x<jats:sup>2</jats:sup><mml:math><mml:mi>y</mml:mi></mml:math></jats:p>'), 'x<sup>2</sup>');
  assertEqual(D.markupToText('a<br/>b'), 'a b');
});

test('requests time out while the body is still arriving', async () => {
  const f = async (url, init) => ({
    ok: true, status: 200, headers: { get: () => null },
    text: () => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
  });
  const r = D.createRequester({ source: 'slowbody', name: 'Slow', fetch: f, requestsPerSecond: 1000, gateKey: 'test-slowbody', timeout: 80, maxRetries: 0 });
  const err = await assertRejects(r.text('https://example.org/'), /did not answer in time/);
  assertEqual(err.kind, 'timeout');
});

test('jsonSource keeps family names whole; adapters fall back to a safe address', async () => {
  const src = D.jsonSource({ id: 'names', url: 'https://example.org/n?q={query}', results: 'r', fields: { authors: 'a' } });
  const f = fakeFetch(() => response(200, { r: [{ id: 1, title: 't', a: [{ given: 'Gabriel', family: 'García Márquez' }] }] }));
  const res = await D.searchSource(src, 'q', { fetch: f });
  assertEqual(res.records[0].authors[0].lastName, 'García Márquez');
  assertEqual(res.records[0].authors[0].foreName, 'Gabriel');
  const d = D.makeRecord('doaj', D.doajRecord({ id: 'abc', bibjson: { title: 'T', link: [{ type: 'fulltext', url: 'www.example.org/article/1' }] } }));
  assertEqual(d.url, 'https://doaj.org/article/abc');
  const w = D.makeRecord('openalex', D.openAlexRecord({ id: 'https://openalex.org/W1', display_name: 'T', primary_location: { landing_page_url: 'ftp://x.org/1' } }));
  assertEqual(w.url, 'https://openalex.org/W1');
});

test('CSV cells that a spreadsheet would run as formulas stay text', () => {
  const recs = [D.makeRecord('wikipedia', { id: '1', title: '+44 (band)' }), D.makeRecord('datacite', { id: '2', title: '=HYPERLINK("https://evil.example","x")' })];
  const rows = D.toCsv(recs).split('\r\n');
  assert(rows[1].indexOf(",'+44 (band),") > 0, rows[1]);
  assert(rows[2].indexOf(',"\'=HYPERLINK(""https://evil.example"",""x"")",') > 0, rows[2]);
});

// ---------------------------------------------------------------- built-in sources

test('PubMed source: filters in the term, records with links and notable types', async () => {
  assertEqual(D.pubmedTerm('x', { abstracts: true, reviews: true }), '(x) AND hasabstract AND review[pt]');
  assertEqual(D.pubmedTerm('x', {}), 'x');
  const f = fakeFetch((call) => response(200, /esearch/.test(call.url) ? ESEARCH_JSON : EFETCH_XML));
  const progress = [];
  const res = await D.searchSource('pubmed', 'hla', { fetch: f, sort: 'date', from: 2020, onProgress: (d, t) => progress.push(d + '/' + t), settings: { tool: 'test' } });
  const q = query(f.calls[0].url);
  assertEqual(q.term, '(hla) AND hasabstract');
  assertEqual(q.sort, 'pub_date');
  assertEqual(q.mindate, '2020');
  assertEqual(res.total, 1234);
  assertEqual(res.records.length, 3);
  const a = res.records[0];
  assertEqual(a.source, 'pubmed');
  assertEqual(a.id, '39000001');
  assertEqual(a.links[0].label, 'PMID');
  assert(a.links.some((l) => l.label === 'doi'));
  assert(Array.isArray(a.tags));
  assert(progress.length >= 2 && progress[progress.length - 1] === '3/3', progress.join(' '));
  assertEqual(res.requests, 2);
});

test('PubMed source: no matches brings a spelling suggestion; NCBI errors become SourceErrors', async () => {
  const empty = JSON.stringify({ esearchresult: { count: '0', retmax: '0', retstart: '0', idlist: [], translationset: [] } });
  const f = fakeFetch((call) => response(200, /esearch/.test(call.url) ? empty : '<eSpellResult><Query>astma</Query><CorrectedQuery>asthma</CorrectedQuery></eSpellResult>'));
  const res = await D.searchSource('pubmed', 'astma', { fetch: f });
  assertEqual(res.records.length, 0);
  assertEqual(res.suggestion, 'asthma');
  const missing = JSON.stringify({ esearchresult: { count: '0', retmax: '0', retstart: '0', idlist: [], errorlist: { phrasesnotfound: ['zzqqxx'] } } });
  const h = fakeFetch((call) => response(200, /esearch/.test(call.url) ? missing : '<eSpellResult><Query>zzqqxx</Query><CorrectedQuery></CorrectedQuery></eSpellResult>'));
  assertDeepEqual((await D.searchSource('pubmed', 'zzqqxx', { fetch: h })).phrasesNotFound, ['zzqqxx']);
  const g = fakeFetch(() => response(200, JSON.stringify({ esearchresult: { ERROR: 'Invalid query' } })));
  const err = await assertRejects(D.searchSource('pubmed', 'x', { fetch: g }), /could not read the query/);
  assertEqual(err.kind, 'query');
  assertEqual(err.name, 'SourceError');
});

test('Europe PMC source: query clauses, cursor paging, records from core results', async () => {
  const f = fakeFetch((call) => response(200, query(call.url).cursorMark === '*' ? EUROPEPMC_PAGE1 : EUROPEPMC_PAGE2));
  const res = await D.searchSource('europepmc', 'senolytic', Object.assign({ fetch: f, limit: 10, sort: 'cited', from: 2020, to: 2025, filters: { open: true } }, FAST));
  const q1 = query(f.calls[0].url);
  assertEqual(q1.query, '(senolytic) AND HAS_ABSTRACT:Y AND OPEN_ACCESS:Y AND PUB_YEAR:[2020 TO 2025]');
  assertEqual(q1.resultType, 'core');
  assertEqual(q1.sort, 'CITED desc');
  assertEqual(q1.synonym, 'true');
  assertEqual(query(f.calls[1].url).cursorMark, EUROPEPMC_PAGE1.nextCursorMark);
  assertEqual(f.calls.length, 2);
  assertEqual(res.total, 3);
  assertEqual(res.records.length, 3);
  const [a, p, rv] = res.records;
  assertEqual(a.id, 'MED:39100001');
  assertEqual(a.title, 'Senolytic clearance of p16-positive cells restores muscle repair in aged mice.');
  assertEqual(a.titleHtml, 'Senolytic clearance of <i>p16</i>-positive cells restores muscle repair in aged mice.');
  assertDeepEqual(a.abstractSections.map((s) => s.label), ['Background', 'Methods', 'Results']);
  assert(a.abstract.startsWith('Senescent cells accumulate in aged muscle & impair repair.'), a.abstract);
  assertEqual(a.abstractSections[2].html, 'Clearance of p16<sup>+</sup> cells restored repair.');
  assertEqual(a.authorString, 'Novak A, Okafor C, Lindqvist E, et al.');
  assertEqual(a.authors[0].orcid, '0000-0002-1111-2222');
  assertEqual(a.authors[3].collective, 'Muscle Ageing Consortium');
  assertEqual(a.journal.isoAbbreviation, 'Aging Res Lett');
  assertEqual(a.pubDate.text, '2025 Apr');
  assertEqual(a.pubDate.month, 4);
  assertDeepEqual(a.links.map((l) => l.label), ['Europe PMC', 'PMID', 'Free full text', 'doi']);
  assertEqual(a.url, 'https://europepmc.org/article/MED/39100001');
  assertEqual(a.mesh[1].descriptor, 'Cellular Senescence');
  assertEqual(a.mesh[1].major, true);
  assertEqual(a.citedBy, 12);
  assertEqual(p.type, 'preprint');
  assertEqual(p.journal.title, 'bioRxiv');
  assertDeepEqual(p.tags, ['Preprint', 'Version 2']);
  assertEqual(p.pubDate.text, '2025 Jun 3');
  assertEqual(rv.type, 'review');
  assertDeepEqual(rv.tags, ['Review']);
});

test('Preprints source asks Europe PMC for preprints only', async () => {
  const f = fakeFetch(() => response(200, EUROPEPMC_PAGE2));
  await D.searchSource('preprints', 'protein language models', Object.assign({ fetch: f, limit: 1 }, FAST));
  assertEqual(query(f.calls[0].url).query, '(protein language models) AND HAS_ABSTRACT:Y AND SRC:PPR');
});

test('OpenAlex source: filter, sort, numbered pages (no key needed), abstracts from the inverted index', async () => {
  const f = fakeFetch(() => response(200, OPENALEX_WORKS));
  const res = await D.searchSource('openalex', 'urban heat', Object.assign({ fetch: f, sort: 'date', from: 2020, filters: { open: true } }, FAST));
  const q = query(f.calls[0].url);
  assertEqual(q.search, 'urban heat');
  assertEqual(q.filter, 'has_abstract:true,is_oa:true,from_publication_date:2020-01-01');
  assertEqual(q.sort, 'publication_date:desc');
  assertEqual(q['per-page'], '100');
  assertEqual(q.page, '1');
  assertEqual(q.cursor, undefined, 'no cursor: the second page of a cursor needs an API key');
  assertEqual(q.api_key, undefined, 'no key unless code passes one');
  assert(q.select.split(',').indexOf('abstract_inverted_index') >= 0);
  assertEqual(f.calls.length, 1, 'all results on the first page end the search');
  const keyed = fakeFetch(() => response(200, OPENALEX_WORKS));
  await D.searchSource('openalex', 'urban heat', Object.assign({ fetch: keyed, settings: { apiKey: 'KEY' } }, FAST));
  assertEqual(query(keyed.calls[0].url).api_key, 'KEY', 'code can still pass a key');
  assertEqual(D.getSource('openalex').settings.length, 0, 'the search page asks for no key');
  assertEqual(D.getSource('pubmed').settings.some((s) => s.type === 'secret'), false, 'no source asks for a key');
  const [w, x] = res.records;
  assertEqual(w.id, 'W4400000001');
  assertEqual(w.title, 'Urban heat islands and night-time mortality');
  assertEqual(w.abstract, 'Urban heat islands raise night temperatures heat stress.');
  assertEqual(w.authors[0].lastName, 'de la Cruz');
  assertEqual(w.authors[0].orcid, '0000-0003-3333-4444');
  assertEqual(w.journal.title, 'Journal of Urban Climate Studies');
  assertEqual(w.journal.pages, '101-115');
  assertEqual(w.pmid, '39200001');
  assertEqual(w.pmcid, 'PMC11200001');
  assertEqual(w.doi, '10.1000/heat.2024.77');
  assertEqual(w.url, 'https://journal.example.org/heat77');
  assertDeepEqual(w.links.map((l) => l.label), ['OpenAlex', 'PMID', 'Free full text', 'doi']);
  assertDeepEqual(w.mesh, [{ descriptor: 'Hot Temperature', major: true, qualifiers: [{ name: 'adverse effects', major: false }] }]);
  assertDeepEqual(w.keywords, ['Urban Heat Island']);
  assertEqual(w.citedBy, 41);
  assertEqual(x.type, 'preprint');
  assertEqual(x.arxiv, '2501.01234');
  assertEqual(x.journal.title, 'arXiv');
  assertDeepEqual(x.tags, ['Retracted Publication', 'Preprint']);
});

test('arXiv source reads arXiv papers from OpenAlex, arXiv links first', async () => {
  const f = fakeFetch(() => response(200, OPENALEX_WORKS));
  const res = await D.searchSource('arxiv', 'graph neural networks', Object.assign({ fetch: f }, FAST));
  const q = query(f.calls[0].url);
  assertEqual(q.filter, 'has_abstract:true,indexed_in:arxiv');
  assert(q.select.split(',').indexOf('locations') >= 0);
  const x = res.records[1];
  assertEqual(x.source, 'arxiv');
  assertEqual(x.url, 'https://arxiv.org/abs/2501.01234');
  assertEqual(x.links[0].label, 'arXiv');
  assertEqual(D.arxivIdOf({ locations: [{ landing_page_url: 'https://arxiv.org/abs/hep-th/9901001v3' }] }), 'hep-th/9901001');
  assertEqual(D.uninvertAbstract({ b: [1], a: [0], c: [3] }), 'a b c');
});

test('OpenAlex and arXiv ask for page 1, 2, 3… by number until the limit', async () => {
  const many = (n, from) => ({ meta: { count: 250, page: null, per_page: 100, next_cursor: null },
    results: Array.from({ length: n }, (_, i) => ({ id: 'https://openalex.org/W' + (from + i), display_name: 'Work ' + (from + i), abstract_inverted_index: { words: [0] } })) });
  const f = fakeFetch((call) => { const p = +query(call.url).page; return response(200, many(p === 3 ? 50 : 100, (p - 1) * 100)); });
  const res = await D.searchSource('arxiv', 'quantum error correction', Object.assign({ fetch: f, limit: 250 }, FAST));
  assertDeepEqual(f.calls.map((c) => query(c.url).page), ['1', '2', '3']);
  assert(f.calls.every((c) => query(c.url)['per-page'] === '100' && query(c.url).cursor === undefined));
  assertEqual(res.records.length, 250);
  assertEqual(res.total, 250);
});

test('Crossref source: filters, cursor, JATS abstracts, preprints from posted content', async () => {
  const f = fakeFetch(() => response(200, CROSSREF_WORKS));
  const res = await D.searchSource('crossref', 'ocean acidification', Object.assign({ fetch: f, limit: 2, sort: 'cited', from: 2015, to: 2024, settings: { email: 'me@example.org' } }, FAST));
  const q = query(f.calls[0].url);
  assertEqual(q.query, 'ocean acidification');
  assertEqual(q.filter, 'has-abstract:true,from-pub-date:2015,until-pub-date:2024');
  assertEqual(q.rows, '2');
  assertEqual(q.cursor, '*');
  assertEqual(q.sort, 'is-referenced-by-count');
  assertEqual(q.order, 'desc');
  assertEqual(q.mailto, 'me@example.org');
  assert(q.select.indexOf('abstract') >= 0);
  assertEqual(res.total, 48211);
  const [a, p] = res.records;
  assertEqual(a.id, '10.1000/ocean.2023.15');
  assertEqual(a.doi, '10.1000/OCEAN.2023.15');
  assertEqual(a.title, 'Ocean acidification and small-scale fisheries');
  assertDeepEqual(a.abstractSections.map((s) => s.label), ['Background', 'Findings']);
  assertEqual(a.abstractSections[1].html, 'Catches fell by 12 % in <i>two</i> regions.');
  assertEqual(a.authorString, 'Ferreira A, Coastal Futures Network');
  assertEqual(a.journal.title, 'Marine Policy Review');
  assertEqual(a.journal.isoAbbreviation, 'Mar Policy Rev');
  assertEqual(a.pubDate.text, '2023 Sep 4');
  assertDeepEqual(a.keywords, ['Oceanography', 'Fisheries']);
  assertEqual(p.type, 'preprint');
  assertEqual(p.journal.title, 'Cold Spring Harbor Laboratory');
  assertDeepEqual(p.tags, ['Preprint']);
});

test('Crossref source asks again without "select" if Crossref refuses a field', async () => {
  const f = fakeFetch((call, n) => (n === 1 ? response(400, '{"status":"failed","message":[{"type":"parameter-not-allowed","message":"select field not allowed"}]}') : response(200, CROSSREF_WORKS)));
  const res = await D.searchSource('crossref', 'x', Object.assign({ fetch: f, limit: 2 }, FAST));
  assertEqual(f.calls.length, 2);
  assert(!query(f.calls[1].url).select);
  assertEqual(res.records.length, 2);
});

test('DOAJ source: query in the path, escapes, page numbers, records', async () => {
  assertEqual(D.doajEscape('what is it? a*b ~2'), 'what is it\\? a\\*b \\~2');
  assertEqual(D.doajEscape('COVID-19: outcomes'), 'COVID-19\\: outcomes');
  assertEqual(D.doajEscape('title:mangrove'), 'title:mangrove');
  const f = fakeFetch(() => response(200, DOAJ_ARTICLES));
  const res = await D.searchSource('doaj', 'mangrove restoration', Object.assign({ fetch: f, from: 2020, sort: 'added' }, FAST));
  const url = f.calls[0].url;
  assert(url.startsWith('https://doaj.org/api/search/articles/'), url);
  assertEqual(decodeURIComponent(url.split('/articles/')[1].split('?')[0]), '(mangrove restoration) AND _exists_:bibjson.abstract AND bibjson.year:[2020 TO 3000]');
  const q = query(url);
  assertEqual(q.page, '1');
  assertEqual(q.pageSize, '100');
  assertEqual(q.sort, 'created_date:desc');
  assertEqual(f.calls.length, 1, 'a total of 1 ends the search');
  const a = res.records[0];
  assertEqual(a.id, 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
  assertEqual(a.abstract, 'Mangrove cover recovered by a third after replanting.');
  assertEqual(a.authorString, 'Rahmawati S, Silva J');
  assertEqual(a.authors[0].orcid, '0000-0002-7777-8888');
  assertEqual(a.journal.pages, '33-47');
  assertEqual(a.journal.issn, '3456-7890');
  assertEqual(a.pubDate.text, '2025 May');
  assertEqual(a.url, 'https://coastal-ecology.example.org/article/33');
  assertDeepEqual(a.links.map((l) => l.label), ['DOAJ', 'Full text', 'doi']);
  assertEqual(a.openAccess, true);
});

test('ClinicalTrials.gov source: Essie filters, page tokens, trials as records', async () => {
  assertEqual(D.phaseLabel('EARLY_PHASE1'), 'Early phase 1');
  const f = fakeFetch(() => response(200, CTGOV_STUDIES));
  const res = await D.searchSource('clinicaltrials', 'psilocybin depression', Object.assign({ fetch: f, from: 2020, filters: { interventional: true, recruiting: true, results: true } }, FAST));
  const q = query(f.calls[0].url);
  assertEqual(q['query.term'], 'psilocybin depression');
  assertEqual(q['filter.advanced'], 'AREA[StartDate]RANGE[2020-01-01,MAX] AND AREA[StudyType]INTERVENTIONAL');
  assertEqual(q['filter.overallStatus'], 'RECRUITING,NOT_YET_RECRUITING');
  assertEqual(q.aggFilters, 'results:with');
  assertEqual(q.sort, '@relevance');
  assertEqual(q.countTotal, 'true');
  assert(q.fields.split(',').indexOf('BriefSummary') >= 0);
  assertEqual(res.total, 2);
  const [t, o] = res.records;
  assertEqual(t.id, 'NCT09000001');
  assertEqual(t.type, 'trial');
  assertEqual(t.abstract, 'This study tests whether psilocybin-assisted therapy reduces depression scores at 6 weeks.');
  assertEqual(t.journal.title, 'Example University Hospital');
  assertEqual(t.pubDate.text, 'Started Mar 2024');
  assertDeepEqual(t.tags, ['Phase 2', 'Recruiting']);
  assertDeepEqual(t.keywords, ['Treatment Resistant Depression', 'psychedelic', 'Psilocybin', 'Psychological support']);
  assertEqual(t.extra.enrollment, 120);
  assertEqual(t.url, 'https://clinicaltrials.gov/study/NCT09000001');
  assertEqual(t.authorString, '');
  assertDeepEqual(o.tags, ['Active, not recruiting', 'Observational', 'Has results']);
});

test('DataCite source: resource types, relevance sort, datasets and software', async () => {
  assertEqual(D.dataciteTypes({ datasets: true, software: true }), 'dataset,software');
  assertEqual(D.dataciteTypes({ datasets: true, other: true }), '');
  const f = fakeFetch(() => response(200, DATACITE_DOIS));
  const res = await D.searchSource('datacite', 'single-cell', Object.assign({ fetch: f, from: 2020, to: 2025 }, FAST));
  const q = query(f.calls[0].url);
  assertEqual(q.query, '(single-cell) AND publicationYear:[2020 TO 2025]');
  assertEqual(q['resource-type-id'], 'dataset,software');
  assertEqual(q.sort, 'relevance');
  assertEqual(q['page[size]'], '200');
  assertEqual(q['page[number]'], '1');
  const [d, s] = res.records;
  assertEqual(d.type, 'dataset');
  assertEqual(d.title, 'Single-cell RNA-seq of example kidney organoids');
  assertEqual(d.authorString, 'Okonkwo A, Example Sequencing Facility');
  assertEqual(d.authors[0].orcid, '0000-0001-9999-0000');
  assertDeepEqual(d.tags, ['Dataset', 'Version 1.2']);
  assertDeepEqual(d.keywords, ['Biological sciences', 'single-cell transcriptomics']);
  assertEqual(d.url, 'https://zenodo.org/records/9000001');
  assertEqual(d.journal.title, 'Zenodo');
  assertEqual(s.type, 'software');
  assertEqual(s.publisher, 'Dryad');
  assertEqual(s.abstract, 'Scripts for the analysis.');
  assertEqual(s.authors[0].lastName, 'Larsen');
  assertEqual(s.year, 2023);
});

test('INSPIRE source: date ranges, collaborations, arXiv preprints', async () => {
  assertEqual(D.inspireQuery({ query: 'axion', from: 2015, to: 2020 }), '(axion) and date 2015->2020');
  assertEqual(D.inspireQuery({ query: 'axion', from: 2015 }), '(axion) and date >= 2015');
  const f = fakeFetch(() => response(200, INSPIRE_LITERATURE));
  const res = await D.searchSource('inspire', 'dark matter', Object.assign({ fetch: f, sort: 'cited' }, FAST));
  const q = query(f.calls[0].url);
  assertEqual(q.q, 'dark matter');
  assertEqual(q.sort, 'mostcited');
  assert(q.fields.indexOf('authors.full_name') >= 0);
  const [a, b] = res.records;
  assertEqual(a.id, '2900001');
  assertEqual(a.authorString, 'EXAMPLE Collaboration, Rossi G, Weber J');
  assertEqual(a.journal.title, 'Phys.Rev.D');
  assertEqual(a.journal.pages, '052001');
  assertEqual(a.year, 2025);
  assertEqual(a.arxiv, '2501.05555');
  assertDeepEqual(a.links.map((l) => l.label), ['INSPIRE', 'arXiv', 'doi']);
  assertDeepEqual(a.keywords, ['dark matter: direct detection']);
  assertDeepEqual(a.tags, ['hep-ex']);
  assertEqual(b.type, 'preprint');
  assertEqual(b.journal.title, 'arXiv');
  assertDeepEqual(b.tags, ['Preprint', 'hep-ph']);
});

test('Wikipedia source: language editions, snippets as abstracts, offsets', async () => {
  const f = fakeFetch(() => response(200, WIKIPEDIA_SEARCH));
  const res = await D.searchSource('wikipedia', 'renaissance architecture', Object.assign({ fetch: f, settings: { lang: 'it' }, limit: 2 }, FAST));
  const url = f.calls[0].url;
  assert(url.startsWith('https://it.wikipedia.org/w/api.php?'), url);
  const q = query(url);
  assertEqual(q.list, 'search');
  assertEqual(q.srsearch, 'renaissance architecture');
  assertEqual(q.srlimit, '2');
  assertEqual(q.origin, '*');
  assertEqual(res.language, 'it');
  const [a, b] = res.records;
  assertEqual(a.abstract, 'Renaissance architecture is the style of the period "between" the early 15th and 17th centuries');
  assertEqual(a.url, 'https://it.wikipedia.org/wiki/Renaissance_architecture');
  assertEqual(b.url, 'https://it.wikipedia.org/wiki/Palazzo_Example/Garden');
  assertEqual(a.type, 'page');
  const g = fakeFetch(() => response(200, { error: { code: 'srsearch-error', info: 'bad syntax' } }));
  await assertRejects(D.searchSource('wikipedia', 'x', Object.assign({ fetch: g }, FAST)), /bad syntax/);
});

test('arXiv API source: query building and Atom feeds', async () => {
  assertEqual(D.arxivSearchQuery('graph "message passing"'), 'all:graph AND all:"message passing"');
  assertEqual(D.arxivSearchQuery('ti:graph AND au:raman'), 'ti:graph AND au:raman');
  assertEqual(D.arxivSearchQuery('graph', { from: 2020, to: 2021 }), '(all:graph) AND submittedDate:[202001010000 TO 202112312359]');
  const feed = D.parseArxivFeed(ARXIV_FEED);
  assertEqual(feed.total, 57);
  const [a, b] = feed.records;
  assertEqual(a.id, '2502.00001');
  assertEqual(a.title, 'Message passing on sparse graphs');
  assertEqual(a.abstract, 'We study message passing & its limits on sparse graphs.');
  assertEqual(a.authors[1].foreName, 'Ludwig');
  assertEqual(a.authors[1].lastName, 'van Example');
  assertEqual(a.doi, '10.1000/jml.2025.1');
  assertEqual(a.journal.title, 'J. Mach. Learn. Example 3 (2025) 1-12');
  assertDeepEqual(a.tags, ['Preprint', 'cs.LG']);
  assertEqual(a.extra.version, '2');
  assertEqual(b.id, 'hep-th/9901001');
  assertThrows(() => D.parseArxivFeed(ARXIV_ERROR_FEED), /incorrect id format/);
  const f = fakeFetch(() => response(200, ARXIV_FEED));
  const res = await D.searchSource('arxiv-api', 'graph', Object.assign({ fetch: f, limit: 2, settings: { baseUrl: 'https://proxy.example.org/arxiv' } }, FAST));
  assert(f.calls[0].url.startsWith('https://proxy.example.org/arxiv?search_query=all%3Agraph&start=0&max_results=2'), f.calls[0].url);
  assertEqual(res.records.length, 2);
});

test('jsonSource: any JSON search API from a template and field paths', async () => {
  const src = D.jsonSource({
    id: 'my-index', name: 'My index', pageSize: 2,
    url: 'https://example.org/s?q={query}&n={size}&from={offset}&key={settings.key}',
    results: 'hits.items', total: 'hits.total',
    fields: { id: 'ref', title: 'name', abstract: 'text.0', url: 'link', year: 'y', authors: 'by', venue: 'where', keywords: 'tags' },
  });
  const f = fakeFetch((call) => {
    const from = +query(call.url).from;
    const items = [{ ref: 'a', name: 'Alpha', text: ['First <b>one</b>'], link: 'https://example.org/a', y: 2021, by: ['Ada Lovelace'], where: 'Notes', tags: 'x, y' },
      { ref: 'b', name: 'Beta', text: ['Second'], by: [{ name: 'Smith, J' }] }, { ref: 'c', name: 'Gamma' }].slice(from, from + 2);
    return response(200, { hits: { total: 3, items } });
  });
  const res = await D.searchSource(src, 'two words', { fetch: f, limit: 10, settings: { key: 'K&1' } });
  assertEqual(query(f.calls[0].url).q, 'two words');
  assertEqual(query(f.calls[0].url).key, 'K&1');
  assertEqual(f.calls.length, 2);
  assertDeepEqual(res.records.map((r) => r.id), ['a', 'b', 'c']);
  const a = res.records[0];
  assertEqual(a.abstract, 'First one');
  assertEqual(a.authorString, 'Lovelace A');
  assertEqual(a.journal.title, 'Notes');
  assertDeepEqual(a.keywords, ['x', 'y']);
  assertEqual(res.records[1].authors[0].lastName, 'Smith');
  assertEqual(res.total, 3);
  assertThrows(() => D.jsonSource({ id: 'x' }), /url/);
  const cursorSrc = D.jsonSource({ id: 'cur', url: 'https://example.org/c?cursor={cursor}', firstCursor: '*', results: 'r', next: 'n' });
  const g = fakeFetch((call) => response(200, query(call.url).cursor === '*' ? { r: [{ id: 1, title: 'one' }], n: 'abc' } : { r: [{ id: 2, title: 'two' }], n: null }));
  const res2 = await D.searchSource(cursorSrc, 'q', { fetch: g });
  assertEqual(query(g.calls[1].url).cursor, 'abc');
  assertEqual(res2.records.length, 2);
});

test('exports handle records from every source', () => {
  const recs = [
    D.makeRecord('clinicaltrials', { id: 'NCT1', type: 'trial', title: 'Trial', journal: { title: 'Sponsor' }, tags: ['Phase 2'], url: 'https://clinicaltrials.gov/study/NCT1', year: 2024 }),
    D.makeRecord('arxiv', { id: '2501.1', type: 'preprint', title: 'Pre', arxiv: '2501.1', journal: { title: 'arXiv' }, authors: ['Lena Vogt'] }),
    D.makeRecord('datacite', { id: '10.5281/z.1', type: 'dataset', title: 'Data', doi: '10.5281/z.1', publisher: 'Zenodo', journal: { title: 'Zenodo' } }),
    D.makeRecord('datacite', { id: '10.5281/z.1', type: 'software', title: 'Same id again' }),
  ];
  const ris = D.toRis(recs);
  assert(ris.includes('TY  - GEN') && ris.includes('TY  - UNPB') && ris.includes('TY  - DATA') && ris.includes('TY  - COMP'), ris);
  assert(ris.includes('AN  - NCT1') && ris.includes('AN  - 2501.1'));
  const bib = D.toBibtex(recs);
  assert(bib.includes('@misc{clinicaltrials_NCT1,') && bib.includes('howpublished = {Sponsor}') && bib.includes('note = {Phase 2}'), bib);
  assert(bib.includes('eprint = {2501.1}') && bib.includes('archiveprefix = {arXiv}'), bib);
  assert(bib.includes('@misc{datacite_10.5281_z.1,') && bib.includes('@misc{datacite_10.5281_z.1_2,'), 'keys stay unique');
  const csv = D.toCsv(recs, [{ label: 'T', documents: [0] }]).split('\r\n');
  assertEqual(csv[1].split(',').slice(0, 3).join(','), 'clinicaltrials,NCT1,Trial');
  const json = JSON.parse(D.toJson({ algorithm: 'stc', clusters: [{ label: 'T', documents: [0, 1], size: 2 }] }, recs));
  assertDeepEqual(json.clusters[0].ids, ['NCT1', '2501.1']);
  assertEqual(json.clusters[0].pmids, undefined);
});

test('records from a source cluster end to end', async () => {
  const f = fakeFetch(() => response(200, EUROPEPMC_PAGE1));
  const res = await D.searchSource('europepmc', 'senolytic', Object.assign({ fetch: f, limit: 2 }, FAST));
  const docs = D.toDocuments(res.records.concat(res.records, res.records), { includeMesh: true, includeKeywords: true });
  assertEqual(new Set(docs.map((d) => d.id)).size, 2);
  const out = D.cluster(docs, { algorithm: 'stc', fields: ['title', 'abstract', 'terms'] });
  assertEqual(out.documentCount, 6);
});
