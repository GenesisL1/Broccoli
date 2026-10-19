/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * The Porter2 ("Snowball English") stemming algorithm, implemented from the
 * published description by Martin Porter (snowballstem.org), including the
 * Snowball 3 revisions (more R1 prefixes, "ogist", no undoubling in "add"/
 * "err"-like words, "dying" → "die" as a rule).
 */

function isVowel(c) {
  return c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u' || c === 'y';
}

const EXCEPTIONS = {
  skis: 'ski', skies: 'sky', idly: 'idl', gently: 'gentl', ugly: 'ugli', early: 'earli',
  only: 'onli', singly: 'singl', sky: 'sky', news: 'news', howe: 'howe', atlas: 'atlas',
  cosmos: 'cosmos', bias: 'bias', andes: 'andes',
};

// Words starting with these get R1 right after the prefix.
const R1_PREFIXES = ['gener', 'commun', 'arsen', 'past', 'univers', 'later', 'emerg', 'organ', 'inter'];

// Stems left alone by step 1b: "proceed", "exceed", "succeed"; "inning", "outing", ...
const EED_KEEP = new Set(['proc', 'exc', 'succ']);
const ING_KEEP = new Set(['inn', 'out', 'cann', 'herr', 'earr', 'even']);

const DOUBLES = new Set(['bb', 'dd', 'ff', 'gg', 'mm', 'nn', 'pp', 'rr', 'tt']);
const LI_ENDINGS = new Set(['c', 'd', 'e', 'g', 'h', 'k', 'm', 'n', 'r', 't']);

const STEP2 = [
  ['ization', 'ize'], ['ational', 'ate'], ['fulness', 'ful'], ['ousness', 'ous'],
  ['iveness', 'ive'], ['tional', 'tion'], ['biliti', 'ble'], ['lessli', 'less'],
  ['entli', 'ent'], ['ation', 'ate'], ['alism', 'al'], ['aliti', 'al'],
  ['ousli', 'ous'], ['iviti', 'ive'], ['fulli', 'ful'], ['enci', 'ence'],
  ['anci', 'ance'], ['abli', 'able'], ['izer', 'ize'], ['ator', 'ate'],
  ['alli', 'al'], ['ogist', 'og'], ['bli', 'ble'], ['ogi', 'og'], ['li', ''],
];

const STEP3 = [
  ['ational', 'ate'], ['tional', 'tion'], ['alize', 'al'], ['icate', 'ic'],
  ['iciti', 'ic'], ['ative', ''], ['ical', 'ic'], ['ness', ''], ['ful', ''],
];

const STEP4 = [
  'ement', 'ance', 'ence', 'able', 'ible', 'ment', 'ant', 'ent', 'ism', 'ate',
  'iti', 'ous', 'ive', 'ize', 'ion', 'al', 'er', 'ic',
];

/** Position after the first non-vowel that follows a vowel, searching from `from`. */
function regionStart(w, from) {
  for (let i = from + 1; i < w.length; i++) {
    if (!isVowel(w[i]) && isVowel(w[i - 1])) return i + 1;
  }
  return w.length;
}

/** True if w ends in a short syllable (the word "past" counts as one). */
function endsWithShortSyllable(w) {
  if (w === 'past') return true;
  const n = w.length;
  if (n === 2) return isVowel(w[0]) && !isVowel(w[1]);
  if (n >= 3) {
    const a = w[n - 3], b = w[n - 2], c = w[n - 1];
    return !isVowel(a) && isVowel(b) && !isVowel(c) && c !== 'w' && c !== 'x' && c !== 'Y';
  }
  return false;
}

function longestSuffix(w, list) {
  let best = null;
  for (let i = 0; i < list.length; i++) {
    const s = typeof list[i] === 'string' ? list[i] : list[i][0];
    if (w.endsWith(s) && (best === null || s.length > best.length)) best = s;
  }
  return best;
}

/**
 * Stems a lower-case English word. Words of one or two letters are returned
 * unchanged.
 */
export function stemEnglish(word) {
  if (word.length <= 2) return word;
  const exception = EXCEPTIONS[word];
  if (exception !== undefined) return exception;

  let w = word;
  if (w[0] === "'") w = w.slice(1);

  // Prelude: mark consonant-y as Y.
  if (w[0] === 'y') w = 'Y' + w.slice(1);
  for (let i = 1; i < w.length; i++) {
    if (w[i] === 'y' && isVowel(w[i - 1])) w = w.slice(0, i) + 'Y' + w.slice(i + 1);
  }

  // Regions.
  let r1 = -1;
  for (const prefix of R1_PREFIXES) {
    if (w.startsWith(prefix)) { r1 = prefix.length; break; }
  }
  if (r1 < 0) r1 = regionStart(w, 0);
  const r2 = regionStart(w, r1);

  // Step 0.
  if (w.endsWith("'s'")) w = w.slice(0, -3);
  else if (w.endsWith("'s")) w = w.slice(0, -2);
  else if (w.endsWith("'")) w = w.slice(0, -1);

  // Step 1a.
  if (w.endsWith('sses')) {
    w = w.slice(0, -2);
  } else if (w.endsWith('ied') || w.endsWith('ies')) {
    w = w.length > 4 ? w.slice(0, -2) : w.slice(0, -1);
  } else if (w.endsWith('us') || w.endsWith('ss')) {
    // unchanged
  } else if (w.endsWith('s')) {
    let hasVowel = false;
    for (let i = 0; i < w.length - 2; i++) if (isVowel(w[i])) { hasVowel = true; break; }
    if (hasVowel) w = w.slice(0, -1);
  }

  // Step 1b.
  const s1b = longestSuffix(w, ['eedly', 'ingly', 'edly', 'eed', 'ing', 'ed']);
  if (s1b === 'eed' || s1b === 'eedly') {
    const stem = w.slice(0, -s1b.length);
    if (!EED_KEEP.has(stem) && stem.length >= r1) w = stem + 'ee';
  } else if (s1b !== null) {
    const stem = w.slice(0, -s1b.length);
    const isIng = s1b === 'ing' || s1b === 'ingly';
    if (isIng && stem.length === 2 && stem[1] === 'y' && !isVowel(stem[0])) {
      // "dying" → "die", "lying" → "lie", "vying" → "vie".
      w = stem[0] + 'ie';
    } else if (isIng && ING_KEEP.has(stem)) {
      // "inning", "outing", "evening": unchanged.
    } else {
      let hasVowel = false;
      for (let i = 0; i < stem.length; i++) if (isVowel(stem[i])) { hasVowel = true; break; }
      if (hasVowel) {
        w = stem;
        if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) {
          w += 'e';
        } else if (w.length >= 2 && DOUBLES.has(w.slice(-2))) {
          // Undouble, except in "add", "ebb", "err", "odd"-like words.
          if (!(w.length === 3 && (w[0] === 'a' || w[0] === 'e' || w[0] === 'o'))) w = w.slice(0, -1);
        } else if (r1 >= w.length && endsWithShortSyllable(w)) {
          w += 'e';
        }
      }
    }
  }

  // Step 1c.
  if (w.length > 2) {
    const last = w[w.length - 1];
    if ((last === 'y' || last === 'Y') && !isVowel(w[w.length - 2])) {
      w = w.slice(0, -1) + 'i';
    }
  }

  // Step 2.
  const s2 = longestSuffix(w, STEP2);
  if (s2 !== null && w.length - s2.length >= r1) {
    const at = w.length - s2.length;
    if (s2 === 'ogi') {
      if (at > 0 && w[at - 1] === 'l') w = w.slice(0, at) + 'og';
    } else if (s2 === 'li') {
      if (at > 0 && LI_ENDINGS.has(w[at - 1])) w = w.slice(0, at);
    } else {
      const repl = STEP2.find((e) => e[0] === s2)[1];
      w = w.slice(0, at) + repl;
    }
  }

  // Step 3.
  const s3 = longestSuffix(w, STEP3);
  if (s3 !== null && w.length - s3.length >= r1) {
    const at = w.length - s3.length;
    if (s3 === 'ative') {
      if (at >= r2) w = w.slice(0, at);
    } else {
      const repl = STEP3.find((e) => e[0] === s3)[1];
      w = w.slice(0, at) + repl;
    }
  }

  // Step 4.
  const s4 = longestSuffix(w, STEP4);
  if (s4 !== null && w.length - s4.length >= r2) {
    const at = w.length - s4.length;
    if (s4 === 'ion') {
      if (at > 0 && (w[at - 1] === 's' || w[at - 1] === 't')) w = w.slice(0, at);
    } else {
      w = w.slice(0, at);
    }
  }

  // Step 5.
  const n = w.length;
  if (n > 0 && w[n - 1] === 'e') {
    const at = n - 1;
    if (at >= r2 || (at >= r1 && !endsWithShortSyllable(w.slice(0, at)))) w = w.slice(0, at);
  } else if (n > 1 && w[n - 1] === 'l' && n - 1 >= r2 && w[n - 2] === 'l') {
    w = w.slice(0, -1);
  }

  return w.replace(/Y/g, 'y');
}
