import D from './target.js';
import { group, test, assert, assertEqual, assertDeepEqual } from './harness.js';
import { syntheticCorpus, purity, recoveredTopics } from './corpus.js';

group('algorithms');

const { documents, truth } = syntheticCorpus(15);

test('Lingo finds the four topics with descriptive labels', () => {
  const res = D.cluster(documents, { algorithm: 'lingo' });
  const topics = recoveredTopics(res.clusters, truth);
  assert(topics.size === 4, 'recovered ' + [...topics].join(', ') + ' from ' + res.clusters.map((c) => c.label + ':' + c.size).join(' | '));
  assert(purity(res.clusters, truth) > 0.9, 'purity');
  const labels = res.clusters.map((c) => c.label.toLowerCase()).join(' | ');
  const vocab = {
    physics: /monte carlo|particle transport|radiation dose|variance reduction/,
    genomics: /rna sequencing|gene expression|differential expression|transcription factors/,
    vision: /neural networks|image classification|deep learning|training data/,
    hypertension: /blood pressure|antihypertensive drugs|hypertension treatment|randomized trial/,
  };
  for (const [topic, re] of Object.entries(vocab)) {
    assert(re.test(labels), 'expected a ' + topic + ' label: ' + labels);
  }
  assert(!/\b\d+$/.test(labels.split(' | ').join('\n')), 'no label ends with a number: ' + labels);
});

test('Lingo works with every factorization', () => {
  for (const f of ['svd', 'nmf-ed', 'nmf-kl', 'lnmf', 'kmeans']) {
    const res = D.cluster(documents, { algorithm: 'lingo', parameters: { 'matrixReducer.factorizationFactory': f } });
    const topics = recoveredTopics(res.clusters, truth);
    assert(topics.size >= 3, f + ' recovered only ' + [...topics].join(', '));
  }
});

test('Lingo honours the query hint', () => {
  const res = D.cluster(documents, { algorithm: 'lingo', queryHint: 'monte carlo simulation' });
  assert(!res.clusters.some((c) => c.label.toLowerCase() === 'monte carlo simulation'), res.clusters.map((c) => c.label).join(' | '));
});

test('Lingo is deterministic', () => {
  const a = D.cluster(documents, { algorithm: 'lingo', parameters: { 'matrixReducer.factorizationFactory': 'nmf-ed' } });
  const b = D.cluster(documents, { algorithm: 'lingo', parameters: { 'matrixReducer.factorizationFactory': 'nmf-ed' } });
  assertDeepEqual(a.clusters, b.clusters);
});

test('STC finds phrase-based clusters', () => {
  const res = D.cluster(documents, { algorithm: 'stc' });
  const topics = recoveredTopics(res.clusters, truth);
  assert(topics.size >= 3, 'recovered ' + [...topics].join(', ') + ': ' + res.clusters.map((c) => c.label + ':' + c.size).join(' | '));
  assert(res.clusters.some((c) => /monte carlo simulation/i.test(c.label)), res.clusters.map((c) => c.label).join(' | '));
});

test('STC respects maxClusters and maxPhrases', () => {
  const res = D.cluster(documents, { algorithm: 'stc', parameters: { maxClusters: 3, maxPhrases: 1 }, otherTopics: false });
  assert(res.clusters.length <= 3);
  assert(res.clusters.every((c) => c.labels.length === 1));
});

test('Bisecting k-means partitions every document', () => {
  const res = D.cluster(documents, { algorithm: 'bkm', parameters: { clusterCount: 4 } });
  const real = res.clusters.filter((c) => !c.other);
  assertEqual(real.length, 4);
  assertEqual(real.reduce((n, c) => n + c.size, 0), documents.length);
  assert(purity(real, truth) > 0.9, 'purity ' + purity(real, truth));
  assert(real.every((c) => c.labels.length === 3));
});

test('Bisecting k-means without dimensionality reduction', () => {
  const res = D.cluster(documents, { algorithm: 'bkm', parameters: { clusterCount: 4, useDimensionalityReduction: false } });
  assert(purity(res.clusters, truth) > 0.85);
});

test('"Other topics" collects unclustered documents and can be disabled', () => {
  const docs = documents.concat([{ title: 'Zebra', snippet: 'Quokka.' }]);
  const res = D.cluster(docs, { algorithm: 'lingo' });
  const other = res.clusters.find((c) => c.other);
  assert(other && other.documents.includes(docs.length - 1));
  const noOther = D.cluster(docs, { algorithm: 'lingo', otherTopics: false });
  assert(!noOther.clusters.some((c) => c.other));
  assert(noOther.unclustered.includes(docs.length - 1));
});

test('parameters are validated and clamped', () => {
  const { params, warnings } = D.resolveParameters('lingo', {
    desiredClusterCount: 1000,
    'matrixBuilder.maxWordDf': -2,
    'matrixReducer.factorizationFactory': 'nope',
    clusterBuilder: { phraseLabelBoost: '2.5' },
  });
  assertEqual(params.desiredClusterCount, 100);
  assertEqual(params.matrixBuilder.maxWordDf, 0);
  assertEqual(params.matrixReducer.factorizationFactory, 'svd');
  assertEqual(params.clusterBuilder.phraseLabelBoost, 2.5);
  assertEqual(params.clusterBuilder.clusterMergingThreshold, 0.7);
  assert(warnings.length === 3, warnings.join('; '));
});

test('algorithm aliases, presets and descriptors', () => {
  assertEqual(D.getAlgorithm('bisecting-kmeans').id, 'bkm');
  assertEqual(D.getAlgorithm('Suffix-Tree').id, 'stc');
  const list = D.listAlgorithms();
  assertDeepEqual(list.map((a) => a.id), ['lingo', 'stc', 'bkm']);
  for (const a of list) assert(a.attributes.length > 10 && a.attributes.every((x) => x.path && x.type && x.label));
  const res = D.cluster(documents, { algorithm: 'lingo', preset: 'abstracts' });
  assertEqual(res.parameters.matrixReducer.factorizationFactory, 'nmf-ed');
  assertDeepEqual(res.parameters.extras, ['biomedical']);
  assertDeepEqual(Object.keys(D.PRESETS), ['default', 'abstracts']);
  const small = D.cluster(documents, { algorithm: 'lingo', parameters: { 'matrixBuilder.maximumMatrixSize': 37500 } });
  assertEqual(small.parameters.matrixBuilder.maximumMatrixSize, 37500);
  let unknown = null;
  try { D.cluster(documents, { algorithm: 'lingo', preset: 'no-such-preset' }); } catch (e) { unknown = e; }
  assert(unknown && /Unknown preset/.test(unknown.message), 'an unknown preset is an error');
});

test('documents may be strings or objects with any fields', () => {
  const res = D.cluster(['data mining tools', 'data mining tasks', 'text mining tools', 'text mining tasks'], { algorithm: 'lingo' });
  assertEqual(res.documentCount, 4);
  const res2 = D.cluster([{ body: 'x y z' }, { body: 'x y z' }], { algorithm: 'stc', fields: ['body'] });
  assertEqual(res2.documentCount, 2);
});

test('edge cases: no documents, one document, empty text', () => {
  for (const algorithm of ['lingo', 'stc', 'bkm']) {
    assertEqual(D.cluster([], { algorithm }).clusters.length, 0, algorithm + ' empty');
    const one = D.cluster([{ title: 'single document here' }], { algorithm });
    assert(one.clusters.length <= 1, algorithm + ' single');
    const blank = D.cluster([{ title: '' }, { title: '   ' }], { algorithm });
    assert(blank.clusters.every((c) => c.other), algorithm + ' blank');
  }
});

test('result is plain JSON with timings and stats', () => {
  const res = D.cluster(documents, { algorithm: 'lingo' });
  const copy = JSON.parse(JSON.stringify(res));
  assertEqual(copy.clusters.length, res.clusters.length);
  assert(res.timings.total >= 0 && res.stats.labelCandidates > 0 && res.stats.baseVectors > 0);
});

test('clusters German documents with German stemming, stop words and labels', () => {
  const topics = {
    diabetes: [
      'Die Behandlung von Typ-2-Diabetes mit Insulin senkt den Blutzucker',
      'Insulin und Metformin bei der Behandlung von Diabetes',
      'Neue Insuline senken den Blutzucker bei Diabetes',
      'Der Blutzucker von Patienten mit Diabetes nach der Behandlung',
      'Diabetes im Alter: Blutzucker und Insulin richtig einstellen',
      'Schulung zur Insulintherapie bei Diabetes verbessert den Blutzucker',
    ],
    klima: [
      'Der Klimawandel erwärmt die Meere und bedroht die Korallenriffe',
      'Korallenriffe sterben, weil der Klimawandel die Meere erwärmt',
      'Wie der Klimawandel die Temperatur der Meere verändert',
      'Die Erwärmung der Meere durch den Klimawandel schadet den Korallenriffen',
      'Meeresspiegel und Klimawandel: die Meere steigen',
      'Der Klimawandel und die Zukunft der Korallenriffe',
    ],
    fussball: [
      'Die Mannschaft gewann das Fußballspiel im ausverkauften Stadion',
      'Im Stadion feierten die Fans den Sieg der Mannschaft',
      'Der Trainer lobte die Mannschaft nach dem Fußballspiel',
      'Ein spannendes Fußballspiel vor vollem Stadion',
      'Die Fans der Mannschaft füllten das Stadion',
      'Nach dem Fußballspiel verließ die Mannschaft das Stadion',
    ],
  };
  const docs = [], truth = [];
  for (const [topic, titles] of Object.entries(topics)) for (const t of titles) { docs.push({ title: t }); truth.push(topic); }
  for (const algorithm of ['lingo', 'stc']) {
    const res = D.cluster(docs, { algorithm, language: 'de' });
    assertEqual(res.parameters.labelFormat, 'sentence');
    const real = res.clusters.filter((c) => !c.other);
    assert(real.length >= 3, algorithm + ': ' + real.map((c) => c.label).join(' | '));
    assert(recoveredTopics(real, truth, 3).size === 3, algorithm + ': ' + real.map((c) => c.label + ':' + c.size).join(' | '));
    const de = D.getLanguage('de');
    for (const c of real) {
      const ws = c.label.toLowerCase().split(' ');
      assert(!de.stopwords.has(ws[0]) && !de.stopwords.has(ws[ws.length - 1]), algorithm + ' label ' + c.label);
    }
    // German nouns keep their capital letter inside sentence-case labels.
    assert(real.some((c) => /^[A-ZÄÖÜ]/.test(c.label)), algorithm);
  }
});

test('"Other topics" is named in the language of the documents, or as asked', () => {
  const docs = ['Ein Apfel', 'Eine Birne', 'Der Hund bellt', 'Die Katze schläft'];
  const de = D.cluster(docs, { language: 'de' });
  const other = de.clusters.find((c) => c.other);
  assert(other, JSON.stringify(de.clusters));
  assertEqual(other.label, 'Sonstige Themen');
  const named = D.cluster(docs, { language: 'de', otherTopicsLabel: 'Rest' });
  assertEqual(named.clusters.find((c) => c.other).label, 'Rest');
});

test('Bisecting k-means does not split below minClusterSize', () => {
  const res = D.cluster(documents.slice(0, 30), { algorithm: 'bkm', parameters: { clusterCount: 25 } });
  for (const c of res.clusters) assert(c.other || c.size >= 2, c.label + ' has ' + c.size);
  const singles = D.cluster(documents.slice(0, 30), { algorithm: 'bkm', parameters: { clusterCount: 25, minClusterSize: 1 } });
  assert(singles.clusters.filter((c) => !c.other).length >= res.clusters.filter((c) => !c.other).length);
});

test('unknown parameter names are reported, not silently ignored', () => {
  const res = D.cluster(documents.slice(0, 20), { algorithm: 'lingo', parameters: { 'matrixBuilder.titleWordBoost': 3, desiredClusterCount: 10, nonsense: 1 } });
  assert(res.warnings.some((w) => w.startsWith('matrixBuilder.titleWordBoost')), res.warnings.join('; '));
  assert(res.warnings.some((w) => w.startsWith('nonsense')), res.warnings.join('; '));
  assertEqual(res.parameters.desiredClusterCount, 10);
  assertEqual(res.parameters.matrixBuilder.titleWordsBoost, 2);
  assertEqual(D.cluster(documents.slice(0, 5), { algorithm: 'lingo', parameters: { 'matrixReducer.seed': 7 } }).warnings.length, 0);
});

test('documents with unfamiliar field names are still clustered', () => {
  const docs = documents.slice(0, 40).map((d, i) => ({ id: 'doc' + i, url: 'https://example.org/' + i, headline: d.title, text_body: d.snippet || d.abstract || '' }));
  const res = D.cluster(docs, { algorithm: 'stc' });
  assert(res.clusters.filter((c) => !c.other).length > 0, JSON.stringify(res.warnings));
  const empty = D.cluster([{ id: 1, url: 'x' }, { id: 2, url: 'y' }], {});
  assert(empty.warnings.some((w) => /no text/.test(w)), JSON.stringify(empty.warnings));
});

test('Lingo label generalization gives valid, unique labels', () => {
  const on = D.cluster(documents, { algorithm: 'lingo', parameters: { 'clusterBuilder.labelGeneralization': 0.85 } });
  assertEqual(on.warnings.length, 0, on.warnings.join('; '));
  assertEqual(on.parameters.clusterBuilder.labelGeneralization, 0.85);
  assertEqual(new Set(on.clusters.map((c) => c.label)).size, on.clusters.length, 'labels stay unique');
  for (const c of on.clusters) assert(c.other || c.size >= 2, c.label);
  assert(on.clusters.filter((c) => !c.other).length >= 4);
  assertEqual(D.cluster(documents, { algorithm: 'lingo' }).parameters.clusterBuilder.labelGeneralization, 0, 'off by default');
  assertEqual(D.PRESETS.abstracts.parameters.lingo['clusterBuilder.labelGeneralization'], 0.85);
});
