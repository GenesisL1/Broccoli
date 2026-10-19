import D from './target.js';
import { group, test, assert, assertEqual } from './harness.js';

group('preprocessing');

const en = () => D.getLanguage('en');

function prep(texts, options = {}) {
  return D.preprocess({
    documents: texts.map((t) => (Array.isArray(t) ? t : [t])),
    fieldNames: options.fieldNames || ['snippet'],
    titleField: options.titleField == null ? -1 : options.titleField,
    language: en(),
  }, Object.assign({ phrases: true, labels: true }, options));
}

function labelTexts(ctx) {
  const out = [];
  for (let i = 0; i < ctx.labels.count; i++) out.push(D.formatLabel(ctx, ctx.labels.featureIndex[i], 'original').toLowerCase());
  return out;
}

test('case normalization keeps the most frequent spelling', () => {
  const ctx = prep(['DNA repair', 'dna repair', 'DNA damage', 'Repair of DNA']);
  const w = ctx.words.lower.indexOf('dna');
  assertEqual(ctx.words.image[w], 'DNA');
  assertEqual(ctx.words.df[w], 4);
});

test('stemming merges inflections into one stem', () => {
  const ctx = prep(['clustering algorithm', 'clustering algorithms', 'an algorithm for clusters']);
  const s1 = ctx.words.stemIndex[ctx.words.lower.indexOf('algorithm')];
  const s2 = ctx.words.stemIndex[ctx.words.lower.indexOf('algorithms')];
  assertEqual(s1, s2);
  assertEqual(ctx.stems.df[s1], 3);
});

test('phrases: frequent, stop-word trimmed, variants merged', () => {
  const ctx = prep([
    'Monte Carlo simulation of transport.',
    'A Monte Carlo simulation in physics.',
    'monte carlo simulations are slow.',
    'Quality of life of patients.',
    'Their quality of life improved.',
  ]);
  const phrases = [];
  for (let p = 0; p < ctx.phrases.count; p++) phrases.push(ctx.phrases.images[p].join(' '));
  assert(phrases.includes('Monte Carlo simulation'), phrases.join(' | '));
  assert(phrases.some((p) => p.toLowerCase() === 'quality of life'), phrases.join(' | '));
  assert(!phrases.some((p) => /^(a|of|the) /i.test(p) || / (of|the|a)$/i.test(p)), 'phrases must not start/end with stop words: ' + phrases.join(' | '));
});

test('truncated label filter removes "Carlo" in favour of "Monte Carlo"', () => {
  const docs = ['Monte Carlo methods.', 'Monte Carlo sampling.', 'Monte Carlo is useful.', 'Carlo Monte Carlo again.'];
  const withFilter = labelTexts(prep(docs));
  assert(withFilter.includes('monte carlo'), withFilter.join(' | '));
  assert(!withFilter.includes('carlo'), withFilter.join(' | '));
  const without = labelTexts(prep(docs, { labelFilters: { completeLabelFilter: false } }));
  assert(without.includes('carlo'), without.join(' | '));
});

test('query label filter drops labels made only of query words', () => {
  const docs = ['Breast cancer screening.', 'Breast cancer survival.', 'Breast cancer genes and screening.'];
  const plain = labelTexts(prep(docs));
  assert(plain.includes('breast cancer'), plain.join(' | '));
  const withQuery = labelTexts(prep(docs, { queryHint: 'breast cancer[tiab] AND humans[mh]' }));
  assert(!withQuery.includes('breast cancer'), withQuery.join(' | '));
  assert(withQuery.includes('breast cancer screening') || withQuery.includes('screening'), withQuery.join(' | '));
});

test('numeric, genitive, stop label and minimum length filters', () => {
  const docs = ["2-year follow-up of Crohn's", "2-year follow-up of Crohn's", 'more information here', 'more information here', 'ab ab', 'ab ab'];
  const labels = labelTexts(prep(docs));
  assert(!labels.some((l) => l.startsWith('2-year')), labels.join(' | '));
  assert(!labels.includes("crohn's"), labels.join(' | '));
  assert(!labels.some((l) => l.startsWith('more information')), labels.join(' | '));
  assert(!labels.includes('ab'), labels.join(' | '));
});

test('dictionaries: word filters and label filters (exact, glob, regexp)', () => {
  const docs = ['Lorem ipsum dolor.', 'Lorem ipsum dolor.', 'Data mining rocks.', 'Data mining rocks.', 'Web crawling tools.', 'Web crawling tools.'];
  const ctx = prep(docs, {
    wordFilters: [{ exact: ['lorem'] }, { glob: ['dol*'] }],
    labelFilterDictionary: [{ exact: ['data mining'] }, { glob: ['* tools'] }, { regexp: ['^web'] }],
  });
  const labels = labelTexts(ctx);
  const isStop = (w) => (ctx.words.type[ctx.words.lower.indexOf(w)] & 0x200) !== 0;
  assert(isStop('lorem') && isStop('dolor') && !isStop('ipsum'));
  assert(!labels.includes('data mining'), labels.join(' | '));
  assert(!labels.some((l) => l.endsWith(' tools')), labels.join(' | '));
  assert(!labels.some((l) => l.startsWith('web')), labels.join(' | '));
});

test('document assignment: exact phrase vs all-words', () => {
  const docs = ['gene expression in yeast', 'gene expression in mice', 'expression of the gene', 'unrelated text'];
  const loose = prep(docs, { exactPhraseAssignment: false });
  const exact = prep(docs, { exactPhraseAssignment: true });
  const docsOf = (ctx, text) => {
    for (let i = 0; i < ctx.labels.count; i++) {
      if (D.formatLabel(ctx, ctx.labels.featureIndex[i], 'original').toLowerCase() === text) return ctx.labels.documents[i].toArray();
    }
    return null;
  };
  assertEqual(String(docsOf(loose, 'gene expression')), '0,1,2');
  assertEqual(String(docsOf(exact, 'gene expression')), '0,1');
});

test('labels are formatted in title case, keeping acronyms and stop words', () => {
  const ctx = prep(['quality of life in HIV patients', 'quality of life after surgery', 'HIV testing', 'mRNA vaccines', 'mRNA vaccines']);
  const labels = [];
  for (let i = 0; i < ctx.labels.count; i++) labels.push(D.formatLabel(ctx, ctx.labels.featureIndex[i]));
  assert(labels.includes('Quality of Life'), labels.join(' | '));
  assert(labels.includes('mRNA Vaccines'), labels.join(' | '));
  assert(labels.some((l) => l.startsWith('HIV')), labels.join(' | '));
});

test('title field is tracked per stem and document', () => {
  const ctx = D.preprocess({
    documents: [['Hypertension trial', 'blood pressure fell'], ['Diet study', 'hypertension improved']],
    fieldNames: ['title', 'snippet'], titleField: 0, language: en(),
  }, { phrases: false, labels: false });
  const s = ctx.words.stemIndex[ctx.words.lower.indexOf('hypertension')];
  const list = Array.from(ctx.stems.tfByDocument[s]);
  assertEqual(list.join(','), '0,1,1,1,1,2'); // doc 0: tf 1, title bit; doc 1: tf 1, snippet bit
});
