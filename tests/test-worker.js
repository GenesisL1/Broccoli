import D from './target.js';
import { group, test, assert, assertEqual, assertDeepEqual } from './harness.js';
import { syntheticCorpus } from './corpus.js';

group('worker');

const { documents } = syntheticCorpus(10);

test('createClusterer gives the same result as cluster()', async () => {
  const clusterer = D.createClusterer();
  await clusterer.ready;
  const stages = [];
  const viaClusterer = await clusterer.cluster(documents, { algorithm: 'lingo', onProgress: (s) => stages.push(s) });
  const direct = D.cluster(documents, { algorithm: 'lingo' });
  assertDeepEqual(viaClusterer.clusters, direct.clusters);
  if (clusterer.mode === 'worker') assert(stages.length > 0, 'progress events from the worker');
  clusterer.terminate();
});

test('worker mode is used when available (single-file build in a browser)', async () => {
  const clusterer = D.createClusterer();
  const mode = await clusterer.ready;
  const inBrowser = typeof window !== 'undefined' && typeof Worker !== 'undefined';
  const bundled = !!globalThis.__BROCCOLI_TARGET__;
  if (inBrowser && bundled) assertEqual(mode, 'worker', 'fallback reason: ' + clusterer.fallbackReason);
  else assert(mode === 'inline' || mode === 'worker');
  clusterer.terminate();
});

test('clusterer runs several jobs concurrently and keeps them apart', async () => {
  const clusterer = D.createClusterer();
  const [a, b, c] = await Promise.all([
    clusterer.cluster(documents, { algorithm: 'lingo' }),
    clusterer.cluster(documents, { algorithm: 'stc' }),
    clusterer.cluster(documents, { algorithm: 'bkm', parameters: { clusterCount: 4 } }),
  ]);
  assertEqual(a.algorithm, 'lingo');
  assertEqual(b.algorithm, 'stc');
  assertEqual(c.algorithm, 'bkm');
  clusterer.terminate();
});

test('errors inside the clusterer reject the promise', async () => {
  const clusterer = D.createClusterer();
  let failed = false;
  try {
    await clusterer.cluster(documents, { algorithm: 'no-such-algorithm' });
  } catch (err) {
    failed = /Unknown algorithm/.test(err.message);
  }
  assert(failed, 'expected rejection');
  clusterer.terminate();
});

test('inline mode can be forced', async () => {
  const clusterer = D.createClusterer({ worker: false });
  assertEqual(await clusterer.ready, 'inline');
  const res = await clusterer.cluster(documents, { algorithm: 'stc' });
  assert(res.clusters.length > 0);
});

test('a language registered on the page still works through the clusterer', async () => {
  D.registerLanguage({ code: 'xx-page', name: 'Page language', stem: (w) => w.replace(/s$/, ''), stopwords: ['the', 'of'] });
  assert(!D.isBuiltInLanguage('xx-page') && D.isBuiltInLanguage('de'));
  const clusterer = D.createClusterer();
  await clusterer.ready;
  const res = await clusterer.cluster(documents.slice(0, 20), { algorithm: 'stc', language: 'xx-page' });
  assertEqual(res.language, 'xx-page');
  clusterer.terminate();
});
