import D from './target.js';
import { group, test, assert, assertEqual, assertDeepEqual } from './harness.js';

group('text');

const types = (text) => D.tokenizeToArray(text).map((t) => t.image + '/' + (t.type & 0xff));

test('tokenizer keeps biomedical terms whole', () => {
  const toks = D.tokenizeToArray('IL-6 and TNF-α in CD4+ T-cells of COVID-19 patients (Crohn\'s disease).').map((t) => t.image);
  for (const expected of ['IL-6', 'TNF-α', 'CD4+', 'T-cells', 'COVID-19', "Crohn's"]) {
    assert(toks.includes(expected), 'missing token ' + expected + ' in ' + toks.join(' '));
  }
});

test('tokenizer recognizes numbers, ranges and quantities', () => {
  const t = types('95% CI 1.2–3.4, 1,000 mg, 2-year, 0.05');
  assert(t.includes('95%/2'), t.join(' '));
  assert(t.includes('1.2-3.4/2'), t.join(' '));
  assert(t.includes('1,000/2'), t.join(' '));
  assert(t.includes('2-year/4'), t.join(' '));
  assert(t.includes('0.05/2'), t.join(' '));
});

test('tokenizer treats URLs, e-mails, DOIs and domains as non-words', () => {
  const t = types('See https://example.org/a, mail a.b@uni.edu, doi 10.1000/xyz123 and ClinicalTrials.gov.');
  assert(t.includes('https://example.org/a/6'), t.join(' '));
  assert(t.includes('a.b@uni.edu/6'), t.join(' '));
  assert(t.includes('10.1000/xyz123/6'), t.join(' '));
  assert(t.includes('ClinicalTrials.gov/6'), t.join(' '));
});

test('tokenizer normalizes Unicode hyphens and drops soft hyphens', () => {
  const t = D.tokenizeToArray('IL‐6 cyto­kine').map((x) => x.image);
  assertDeepEqual(t, ['IL-6', 'cytokine']);
});

test('tokenizer: dotted acronyms and abbreviations', () => {
  const t = types('U.S. adults, e.g. smokers.');
  assert(t.includes('U.S./5'), t.join(' '));
  assert(t.includes('e.g./5'), t.join(' '));
});

test('Porter2 stemmer matches the reference vocabulary', () => {
  const pairs = ('consign consign|consigned consign|consigning consign|consignment consign|consist consist|' +
    'consisted consist|consistency consist|consistent consist|consistently consist|consisting consist|consists consist|' +
    'consolation consol|consolations consol|consolatory consolatori|console consol|consoled consol|consoles consol|' +
    'consolidate consolid|consolidated consolid|consolidating consolid|consoling consol|consolingly consol|consols consol|' +
    'consonant conson|consort consort|consorted consort|consorting consort|conspicuous conspicu|conspicuously conspicu|' +
    'conspiracy conspiraci|conspirator conspir|conspirators conspir|conspire conspir|conspired conspir|conspiring conspir|' +
    'constable constabl|constables constabl|constance constanc|constancy constanc|constant constant|knack knack|' +
    'knackeries knackeri|knacks knack|knag knag|knave knave|knaves knave|knavish knavish|kneaded knead|kneading knead|' +
    'knee knee|kneel kneel|kneeled kneel|kneeling kneel|kneels kneel|knees knee|knell knell|knelt knelt|knew knew|' +
    'knick knick|knif knif|knife knife|knight knight|knightly knight|knights knight|knit knit|knits knit|knitted knit|' +
    'knitting knit|knives knive|knob knob|knobs knob|knock knock|knocked knock|knocker knocker|knockers knocker|' +
    'knocking knock|knocks knock|knopp knopp|knot knot|knots knot|caresses caress|ponies poni|ties tie|cats cat|' +
    'feed feed|agreed agre|plastered plaster|bled bled|motoring motor|sing sing|conflated conflat|troubled troubl|' +
    'sized size|hopping hop|tanned tan|falling fall|hissing hiss|fizzed fizz|failing fail|filing file|happy happi|' +
    'sky sky|skies sky|dying die|news news|generously generous|communication communic|relational relat|' +
    'conditional condit|rational ration|digitizer digit|operator oper|feudalism feudal|decisiveness decis|' +
    'hopefulness hope|callousness callous|formaliti formal|sensitiviti sensit|sensibiliti sensibl|inning inning|' +
    'proceed proceed|exceeding exceed|succeeded succeed|gas gas|gaps gap|kiwis kiwi|patients patient|' +
    'clustering cluster|algorithms algorithm|studies studi|randomized random|vaccination vaccin|therapies therapi')
    .split('|').map((p) => p.split(' '));
  const bad = pairs.filter(([w, s]) => D.stemEnglish(w) !== s).map(([w, s]) => w + '→' + D.stemEnglish(w) + ' (want ' + s + ')');
  assertEqual(bad.length, 0, bad.join(', '));
});

test('English language component: acronyms, plurals of acronyms, hyphenated words', () => {
  const en = D.getLanguage('en');
  assertEqual(en.stem('snps', 'SNPs'), 'snp');
  assertEqual(en.stem('hiv', 'HIV'), 'hiv');
  assertEqual(en.stem('il-6', 'IL-6'), 'il-6');
  assertEqual(en.stem('t-cells', 'T-cells'), 't-cell');
  assertEqual(en.stem('mrnas', 'mRNAs'), 'mrna');
  assertEqual(en.stem("crohn's", "Crohn's"), 'crohn');
  assert(en.stopwords.has('the') && en.stopwords.has('however'));
  assert(en.extras.biomedical.stopwords.has('demonstrated'));
});

test('registerLanguage adds a custom language', () => {
  const lang = D.registerLanguage({ code: 'xx-test', name: 'Test', stem: (w) => w.slice(0, 4), stopwords: ['zz'], stoplabels: ['^bad'] });
  assertEqual(D.getLanguage('xx-test').stem('abcdef'), 'abcd');
  assert(lang.stopwords.has('zz'));
  assert(D.listLanguages().some((l) => l.code === 'xx-test'));
});

test('highlightHtml marks stem matches and escapes HTML', () => {
  const html = D.highlightHtml('Breast cancers & <b>breast-cancer</b> survivors', ['Breast Cancer']);
  assert(html.includes('<mark data-term="0">Breast cancers</mark>'), html);
  assert(html.includes('&amp;') && html.includes('&lt;b&gt;'), html);
  assert(html.includes('<mark data-term="0">breast-cancer</mark>'), html);
});

test('highlightSpans joins words across stop words but not punctuation', () => {
  const s = 'Quality of life improved. Life, quality.';
  const spans = D.highlightSpans(s, ['Quality of Life']);
  assertEqual(s.slice(spans[0].start, spans[0].end), 'Quality of life');
  assert(spans.length >= 3, JSON.stringify(spans));
});

test('Snowball stemmers agree with the reference vocabularies', () => {
  const cases = {
    stemGerman: { augenblicken: 'augenblick', eingewickelte: 'eingewickelt', kreaturen: 'kreatur', rindviehs: 'rindvieh', unbeachtete: 'unbeacht', 'größere': 'gross', 'besitzerin': 'besitz', "einstein'sche": 'einstein' },
    stemFrench: { 'arrêtons': 'arrêton', convenance: 'conven', ennuyeuse: 'ennui', ostensiblement: 'ostensibl', 'renonça': 'renonc', traversaient: 'travers', mangeais: 'mang' },
    stemSpanish: { aplicar: 'aplic', concretarse: 'concret', echarle: 'echarl', 'hectáreas': 'hectar', modesta: 'modest', tarjeta: 'tarjet' },
    stemItalian: { applicare: 'applic', confortarla: 'confort', "l'affidabilità": 'affid', periodi: 'period', ritardando: 'ritard', telematico: 'telemat' },
    stemPortuguese: { apostas: 'apost', compridos: 'compr', dormiam: 'dorm', fuzileiros: 'fuzileir', 'mártires': 'márt', administradores: 'administr' },
    stemDutch: { batterijleveranciers: 'batterijleverancier', drinkwaterbesparing: 'drinkwaterbespar', hoogwaardige: 'hoogwaard', milieukundigen: 'milieukund', vrolijke: 'vrolijk' },
    stemRussian: { 'внушенная': 'внушен', 'закупка': 'закупк', 'мучаете': 'муча', 'отдайте': 'отда', 'рыдания': 'рыдан', 'уединенном': 'уединен' },
  };
  for (const [fn, pairs] of Object.entries(cases)) {
    for (const [word, stem] of Object.entries(pairs)) assertEqual(D[fn](word), stem, fn + '(' + word + ')');
  }
});

test('European languages are registered with stop words and sentence-case labels', () => {
  const codes = D.listLanguages().map((l) => l.code);
  for (const code of ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'ru']) assert(codes.includes(code), 'missing ' + code);
  const de = D.getLanguage('de');
  assert(de.stopwords.has('der') && de.stopwords.has('über') && !de.stopwords.has('studie'));
  assertEqual(de.labelFormat, 'sentence');
  assertEqual(D.getLanguage('en').labelFormat, 'title');
  // Typographic apostrophes are covered too.
  assert(D.getLanguage('fr').stopwords.has('c’est'));
  // Acronyms and numbers are left alone, hyphenated words stem their last part.
  assertEqual(de.stem('eu', 'EU'), 'eu');
  assertEqual(de.stem('covid-19', 'COVID-19'), 'covid-19');
  assertEqual(de.stem('herz-kreislauf-erkrankungen', 'Herz-Kreislauf-Erkrankungen'), 'herz-kreislauf-erkrank');
  assertEqual(D.getLanguage('es').stem('ensayos', 'ensayos'), 'ensay');
});
