/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Snowball stemmers for German, French, Spanish, Italian, Portuguese,
 * Dutch (Porter's algorithm) and Russian, implemented from the published
 * algorithm descriptions at snowballstem.org and checked against the
 * Snowball reference vocabularies. Every function expects a lower-case word.
 */

/** Longest suffix of w found in `list`, or null. */
function longest(w, list) {
  let best = null;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.length > (best ? best.length : 0) && w.endsWith(s)) best = s;
  }
  return best;
}

/** Start of the region after the first non-vowel following a vowel, searching from `from`. */
function regionAfter(w, from, isV) {
  for (let i = from + 1; i < w.length; i++) {
    if (!isV(w[i]) && isV(w[i - 1])) return i + 1;
  }
  return w.length;
}

/** RV as defined for Spanish, Italian and Portuguese. */
function rvRomance(w, isV) {
  const n = w.length;
  if (n < 2) return n;
  if (!isV(w[1])) {
    for (let i = 2; i < n; i++) if (isV(w[i])) return i + 1;
    return n;
  }
  if (isV(w[0])) {
    for (let i = 2; i < n; i++) if (!isV(w[i])) return i + 1;
    return n;
  }
  return Math.min(3, n);
}

const charsOf = (s) => new Set(s.split(''));

// ------------------------------------------------------------------ German

const DE_VOWELS = charsOf('aeiouyäöü');
const deV = (c) => DE_VOWELS.has(c);
const DE_S_ENDING = charsOf('bdfghklmnrt');
const DE_ST_ENDING = charsOf('bdfghklmnt');
const DE_ET_ENDING = charsOf('dfgklmnrstUzä');

export function stemGerman(word) {
  let w = word;
  // Mark u and y between vowels as consonants.
  const a = w.split('');
  for (let i = 1; i < a.length - 1; i++) {
    if ((a[i] === 'u' || a[i] === 'y') && deV(a[i - 1]) && deV(a[i + 1])) a[i] = a[i].toUpperCase();
  }
  w = a.join('');
  // ß → ss; ae/oe/ue → ä/ö/ü (not the u of "qu").
  let out = '';
  for (let i = 0; i < w.length; i++) {
    const c = w[i], d = w[i + 1];
    if (c === 'ß') { out += 'ss'; continue; }
    if (c === 'q' && d === 'u') { out += 'qu'; i++; continue; }
    if (d === 'e' && (c === 'a' || c === 'o' || c === 'u')) { out += c === 'a' ? 'ä' : c === 'o' ? 'ö' : 'ü'; i++; continue; }
    out += c;
  }
  w = out;

  let r1 = regionAfter(w, 0, deV);
  const r2 = regionAfter(w, r1, deV);
  if (r1 < 3) r1 = Math.min(3, w.length);
  const inR1 = (s) => w.length - s.length >= r1;
  const inR2 = (s) => w.length - s.length >= r2;

  // Step 1.
  let s = longest(w, ['em', 'ern', 'er', 'e', 'en', 'es', 's', 'erin', 'erinnen', 'lns', 'ln']);
  if (s && inR1(s)) {
    const before = w.slice(0, -s.length);
    if (s === 'em') {
      if (!before.endsWith('syst')) w = before;
    } else if (s === 'ern' || s === 'er' || s === 'erin' || s === 'erinnen') {
      w = before;
    } else if (s === 'e' || s === 'en' || s === 'es') {
      w = before;
      if (w.endsWith('niss')) w = w.slice(0, -1);
    } else if (s === 's') {
      if (before.length > 0 && DE_S_ENDING.has(before[before.length - 1])) w = before;
    } else {
      w = before + 'l';
    }
  }

  // Step 2.
  s = longest(w, ['en', 'er', 'est', 'st', 'et']);
  if (s && inR1(s)) {
    const before = w.slice(0, -s.length);
    if (s === 'st') {
      if (before.length >= 4 && DE_ST_ENDING.has(before[before.length - 1])) w = before;
    } else if (s === 'et') {
      const last = before[before.length - 1];
      if (before.length > 0 && DE_ET_ENDING.has(last) &&
        !['geordn', 'intern', 'plan', 'tick', 'tr'].some((x) => before.endsWith(x))) w = before;
    } else {
      w = before;
    }
  }

  // Step 3: d-suffixes.
  s = longest(w, ['end', 'ung', 'ig', 'ik', 'isch', 'lich', 'heit', 'keit']);
  if (s && inR2(s)) {
    const before = w.slice(0, -s.length);
    if (s === 'end' || s === 'ung') {
      w = before;
      if (w.endsWith('ig') && w.length - 2 >= r2 && w[w.length - 3] !== 'e') w = w.slice(0, -2);
    } else if (s === 'ig' || s === 'ik' || s === 'isch') {
      if (before[before.length - 1] !== 'e') w = before;
    } else if (s === 'lich' || s === 'heit') {
      w = before;
      if ((w.endsWith('er') || w.endsWith('en')) && w.length - 2 >= r1) w = w.slice(0, -2);
    } else {
      w = before;
      if (w.endsWith('lich') && w.length - 4 >= r2) w = w.slice(0, -4);
      else if (w.endsWith('ig') && w.length - 2 >= r2) w = w.slice(0, -2);
    }
  }

  // Step 4: apostrophe endings of proper nouns ("Einstein'sche", "DJ's").
  const ap = longest(w, ["'", "'s", "'sch"]);
  if (ap && w.length - ap.length >= 2) w = w.slice(0, -ap.length);

  return w.replace(/U/g, 'u').replace(/Y/g, 'y').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
}

// ------------------------------------------------------------------ French

const FR_VOWELS = charsOf('aeiouyâàëéêèïîôûù');
const frV = (c) => FR_VOWELS.has(c);

const FR_STEP2A = ['îmes', 'ît', 'îtes', 'i', 'ie', 'ies', 'ir', 'ira', 'irai', 'iraIent', 'irais', 'irait', 'iras',
  'irent', 'irez', 'iriez', 'irions', 'irons', 'iront', 'is', 'issaIent', 'issais', 'issait', 'issant', 'issante',
  'issantes', 'issants', 'isse', 'issent', 'isses', 'issez', 'issiez', 'issions', 'issons', 'it'];
const FR_STEP2B_DELETE = ['é', 'ée', 'ées', 'és', 'èrent', 'er', 'era', 'erai', 'eraIent', 'erais', 'erait', 'eras',
  'erez', 'eriez', 'erions', 'erons', 'eront', 'ez', 'iez'];
const FR_STEP2B_A = ['âmes', 'ât', 'âtes', 'a', 'ai', 'aIent', 'ait', 'ant', 'ante', 'antes', 'ants', 'as', 'asse',
  'assent', 'asses', 'assiez', 'assions'];
const FR_STEP2B = FR_STEP2B_DELETE.concat(FR_STEP2B_A, ['ions', 'ais', 'aise', 'aises']);
const FR_STEP1 = ['ance', 'iqUe', 'isme', 'able', 'iste', 'eux', 'ances', 'iqUes', 'ismes', 'ables', 'istes',
  'atrice', 'ateur', 'ation', 'atrices', 'ateurs', 'ations', 'logie', 'logies', 'usion', 'ution', 'usions', 'utions',
  'ence', 'ences', 'ement', 'ements', 'ité', 'ités', 'if', 'ive', 'ifs', 'ives', 'eaux', 'aux', 'oux', 'euse', 'euses',
  'issement', 'issements', 'amment', 'emment', 'ment', 'ments'];

export function stemFrench(word) {
  let w = word;
  // Elisions: l'avion → avion.
  const el = /^(?:qu|[cdjlmnstz])['’](?=.)/.exec(w);
  if (el) w = w.slice(el[0].length);
  // Mark vowels used as consonants.
  const a = w.split('');
  for (let i = 0; i < a.length; i++) {
    const c = a[i], prev = a[i - 1], next = a[i + 1];
    if ((c === 'u' || c === 'i') && prev !== undefined && next !== undefined && frV(prev) && frV(next)) a[i] = c.toUpperCase();
    else if (c === 'y' && ((prev !== undefined && frV(prev)) || (next !== undefined && frV(next)))) a[i] = 'Y';
    else if (c === 'u' && prev === 'q') a[i] = 'U';
  }
  w = a.join('').replace(/ë/g, 'He').replace(/ï/g, 'Hi');

  // Regions.
  let rv;
  const n0 = w.length;
  if (/^(?:par|col|tap)/.test(w)) rv = 3;
  else if (n0 >= 3 && w.startsWith('ni') && frV(w[2])) rv = 3;
  else if (n0 >= 2 && frV(w[0]) && frV(w[1])) rv = Math.min(3, n0);
  else {
    rv = n0;
    for (let i = 1; i < n0; i++) if (frV(w[i])) { rv = i + 1; break; }
  }
  const r1 = regionAfter(w, 0, frV);
  const r2 = regionAfter(w, r1, frV);
  const at = (s) => w.length - s.length;
  const inR = (s, r) => at(s) >= r;

  const original = w;
  let step1Changed = false;
  let doStep2a = false;
  let step1Failed = true;

  const s1 = longest(w, FR_STEP1);
  if (s1) {
    const before = w.slice(0, -s1.length);
    const set = (v) => { w = v; step1Failed = false; };
    switch (s1) {
      case 'ance': case 'iqUe': case 'isme': case 'able': case 'iste': case 'eux':
      case 'ances': case 'iqUes': case 'ismes': case 'ables': case 'istes':
        if (inR(s1, r2)) set(before);
        break;
      case 'atrice': case 'ateur': case 'ation': case 'atrices': case 'ateurs': case 'ations':
        if (inR(s1, r2)) {
          set(before);
          if (w.endsWith('ic')) w = w.length - 2 >= r2 ? w.slice(0, -2) : w.slice(0, -2) + 'iqU';
        }
        break;
      case 'logie': case 'logies':
        if (inR(s1, r2)) set(before + 'log');
        break;
      case 'usion': case 'ution': case 'usions': case 'utions':
        if (inR(s1, r2)) set(before + 'u');
        break;
      case 'ence': case 'ences':
        if (inR(s1, r2)) set(before + 'ent');
        break;
      case 'ement': case 'ements':
        if (inR(s1, rv)) {
          set(before);
          if (w.endsWith('iv') && w.length - 2 >= r2) {
            w = w.slice(0, -2);
            if (w.endsWith('at') && w.length - 2 >= r2) w = w.slice(0, -2);
          } else if (w.endsWith('eus')) {
            if (w.length - 3 >= r2) w = w.slice(0, -3);
            else if (w.length - 3 >= r1) w = w.slice(0, -3) + 'eux';
          } else if ((w.endsWith('abl') || w.endsWith('iqU')) && w.length - 3 >= r2) {
            w = w.slice(0, -3);
          } else if ((w.endsWith('ièr') || w.endsWith('Ièr')) && w.length - 3 >= rv) {
            w = w.slice(0, -3) + 'i';
          }
        }
        break;
      case 'ité': case 'ités':
        if (inR(s1, r2)) {
          set(before);
          if (w.endsWith('abil')) w = w.length - 4 >= r2 ? w.slice(0, -4) : w.slice(0, -4) + 'abl';
          else if (w.endsWith('ic')) w = w.length - 2 >= r2 ? w.slice(0, -2) : w.slice(0, -2) + 'iqU';
          else if (w.endsWith('iv') && w.length - 2 >= r2) w = w.slice(0, -2);
        }
        break;
      case 'if': case 'ive': case 'ifs': case 'ives':
        if (inR(s1, r2)) {
          set(before);
          if (w.endsWith('at') && w.length - 2 >= r2) {
            w = w.slice(0, -2);
            if (w.endsWith('ic')) w = w.length - 2 >= r2 ? w.slice(0, -2) : w.slice(0, -2) + 'iqU';
          }
        }
        break;
      case 'eaux':
        set(before + 'eau');
        break;
      case 'aux':
        if (inR(s1, r1)) set(before + 'al');
        break;
      case 'oux':
        if (/[bhjlnp]$/.test(before)) set(before + 'ou');
        break;
      case 'euse': case 'euses':
        if (inR(s1, r2)) set(before);
        else if (inR(s1, r1)) set(before + 'eux');
        break;
      case 'issement': case 'issements':
        if (inR(s1, r1) && before.length > 0 && !frV(before[before.length - 1])) set(before);
        break;
      case 'amment':
        if (inR(s1, rv)) { set(before + 'ant'); doStep2a = true; }
        break;
      case 'emment':
        if (inR(s1, rv)) { set(before + 'ent'); doStep2a = true; }
        break;
      case 'ment': case 'ments': {
        const p = before.length - 1;
        if (p >= rv && frV(before[p])) { set(before); doStep2a = true; }
        break;
      }
      default:
        break;
    }
  }
  step1Changed = !step1Failed;

  let changed = step1Changed;
  if (step1Failed || doStep2a) {
    // Step 2a: verb suffixes beginning with i.
    let done = false;
    const s2a = longest(w.slice(rv), FR_STEP2A);
    if (s2a) {
      const p = w.length - s2a.length - 1;
      if (p >= rv && !frV(w[p]) && w[p] !== 'H') {
        w = w.slice(0, -s2a.length);
        done = true;
      }
    }
    if (!done) {
      // Step 2b: other verb suffixes.
      const s2b = longest(w.slice(rv), FR_STEP2B);
      if (s2b) {
        const before = w.slice(0, -s2b.length);
        if (s2b === 'ions') {
          if (w.length - s2b.length >= r2) { w = before; done = true; }
        } else if (FR_STEP2B_DELETE.includes(s2b)) {
          w = before;
          done = true;
        } else if (FR_STEP2B_A.includes(s2b)) {
          w = before;
          if (w.endsWith('e') && w.length - 1 >= rv) w = w.slice(0, -1);
          done = true;
        } else {
          // ais, aise, aises: not after "al" preceded by exactly one letter, "auv" or "épl".
          const keep = /^.al$/.test(before) || before.endsWith('auv') || before.endsWith('épl');
          if (!keep) {
            w = before;
            if (w.endsWith('e') && w.length - 1 >= rv) w = w.slice(0, -1);
            done = true;
          }
        }
      }
    }
    if (done) changed = true;
  }

  if (changed && w !== original) {
    // Step 3.
    if (w.endsWith('Y')) w = w.slice(0, -1) + 'i';
    else if (w.endsWith('ç')) w = w.slice(0, -1) + 'c';
  } else {
    // Step 4: residual suffix.
    if (w.endsWith('s') && w.length >= 2) {
      const p = w[w.length - 2];
      const keep = 'aiouès'.indexOf(p) >= 0 && !(p === 'i' && w[w.length - 3] === 'H');
      if (!keep) w = w.slice(0, -1);
    }
    const s4 = longest(w.slice(rv), ['ion', 'ier', 'ière', 'Ier', 'Ière', 'e']);
    if (s4) {
      const before = w.slice(0, -s4.length);
      if (s4 === 'ion') {
        if (w.length - 3 >= r2 && /[st]$/.test(before)) w = before;
      } else if (s4 === 'e') {
        w = before;
      } else {
        w = before + 'i';
      }
    }
  }

  // Step 5: undouble.
  if (/(?:enn|onn|ett|ell|eill)$/.test(w)) w = w.slice(0, -1);
  // Step 6: un-accent.
  const m = /[éè]([^aeiouyâàëéêèïîôûù]+)$/.exec(w);
  if (m) w = w.slice(0, m.index) + 'e' + m[1];

  return w.replace(/I/g, 'i').replace(/U/g, 'u').replace(/Y/g, 'y').replace(/He/g, 'ë').replace(/Hi/g, 'ï').replace(/H/g, '');
}

// ------------------------------------------------------------------ Spanish

const ES_VOWELS = charsOf('aeiouáéíóúü');
const esV = (c) => ES_VOWELS.has(c);
const ES_STEP2B = ['en', 'es', 'éis', 'emos', 'arían', 'arías', 'arán', 'arás', 'aríais', 'aría', 'aréis', 'aríamos',
  'aremos', 'ará', 'aré', 'erían', 'erías', 'erán', 'erás', 'eríais', 'ería', 'eréis', 'eríamos', 'eremos', 'erá', 'eré',
  'irían', 'irías', 'irán', 'irás', 'iríais', 'iría', 'iréis', 'iríamos', 'iremos', 'irá', 'iré', 'aba', 'ada', 'ida',
  'ía', 'ara', 'iera', 'ad', 'ed', 'id', 'ase', 'iese', 'aste', 'iste', 'an', 'aban', 'ían', 'aran', 'ieran', 'asen',
  'iesen', 'aron', 'ieron', 'ado', 'ido', 'ando', 'iendo', 'ió', 'ar', 'er', 'ir', 'as', 'abas', 'adas', 'idas', 'ías',
  'aras', 'ieras', 'ases', 'ieses', 'ís', 'áis', 'abais', 'íais', 'arais', 'ierais', 'aseis', 'ieseis', 'asteis',
  'isteis', 'ados', 'idos', 'amos', 'ábamos', 'íamos', 'imos', 'áramos', 'iéramos', 'iésemos', 'ásemos'];
const ES_STEP1 = ['anza', 'anzas', 'ico', 'ica', 'icos', 'icas', 'ismo', 'ismos', 'able', 'ables', 'ible', 'ibles',
  'ista', 'istas', 'oso', 'osa', 'osos', 'osas', 'amiento', 'amientos', 'imiento', 'imientos', 'adora', 'ador', 'ación',
  'adoras', 'adores', 'aciones', 'ante', 'antes', 'ancia', 'ancias', 'acion', 'logía', 'logías', 'ución', 'uciones',
  'ucion', 'encia', 'encias', 'amente', 'mente', 'idad', 'idades', 'iva', 'ivo', 'ivas', 'ivos'];
const ES_GROUP1 = new Set(['anza', 'anzas', 'ico', 'ica', 'icos', 'icas', 'ismo', 'ismos', 'able', 'ables', 'ible',
  'ibles', 'ista', 'istas', 'oso', 'osa', 'osos', 'osas', 'amiento', 'amientos', 'imiento', 'imientos']);
const ES_GROUP2 = new Set(['adora', 'ador', 'ación', 'adoras', 'adores', 'aciones', 'ante', 'antes', 'ancia', 'ancias', 'acion']);
const ACUTE = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' };

export function stemSpanish(word) {
  let w = word;
  const rv = rvRomance(w, esV);
  const r1 = regionAfter(w, 0, esV);
  const r2 = regionAfter(w, r1, esV);
  const inR = (len, r) => w.length - len >= r;

  // Step 0: attached pronoun.
  const pron = longest(w, ['me', 'se', 'sela', 'selo', 'selas', 'selos', 'la', 'le', 'lo', 'las', 'les', 'los', 'nos']);
  if (pron) {
    const stem = w.slice(0, -pron.length);
    const form = longest(stem, ['iéndo', 'ándo', 'ár', 'ér', 'ír', 'ando', 'iendo', 'ar', 'er', 'ir', 'yendo']);
    if (form && stem.length - form.length >= rv) {
      if (form === 'yendo') {
        if (stem[stem.length - 6] === 'u') w = stem;
      } else if (/[áéí]/.test(form)) {
        w = stem.slice(0, -form.length) + form.replace(/[áéí]/g, (c) => ACUTE[c]);
      } else {
        w = stem;
      }
    }
  }

  // Step 1: standard suffixes.
  let removed = false;
  const s1 = longest(w, ES_STEP1);
  if (s1) {
    const before = w.slice(0, -s1.length);
    if (ES_GROUP1.has(s1)) {
      if (inR(s1.length, r2)) { w = before; removed = true; }
    } else if (ES_GROUP2.has(s1)) {
      if (inR(s1.length, r2)) {
        w = before;
        removed = true;
        if (w.endsWith('ic') && w.length - 2 >= r2) w = w.slice(0, -2);
      }
    } else if (s1 === 'logía' || s1 === 'logías') {
      if (inR(s1.length, r2)) { w = before + 'log'; removed = true; }
    } else if (s1 === 'ución' || s1 === 'uciones' || s1 === 'ucion') {
      if (inR(s1.length, r2)) { w = before + 'u'; removed = true; }
    } else if (s1 === 'encia' || s1 === 'encias') {
      if (inR(s1.length, r2)) { w = before + 'ente'; removed = true; }
    } else if (s1 === 'amente') {
      if (inR(s1.length, r1)) {
        w = before;
        removed = true;
        if (w.endsWith('iv') && w.length - 2 >= r2) {
          w = w.slice(0, -2);
          if (w.endsWith('at') && w.length - 2 >= r2) w = w.slice(0, -2);
        } else {
          const t = longest(w, ['os', 'ic', 'ad']);
          if (t && w.length - 2 >= r2) w = w.slice(0, -2);
        }
      }
    } else if (s1 === 'mente') {
      if (inR(s1.length, r2)) {
        w = before;
        removed = true;
        const t = longest(w, ['ante', 'able', 'ible']);
        if (t && w.length - 4 >= r2) w = w.slice(0, -4);
      }
    } else if (s1 === 'idad' || s1 === 'idades') {
      if (inR(s1.length, r2)) {
        w = before;
        removed = true;
        const t = longest(w, ['abil', 'ic', 'iv']);
        if (t && w.length - t.length >= r2) w = w.slice(0, -t.length);
      }
    } else {
      // iva ivo ivas ivos
      if (inR(s1.length, r2)) {
        w = before;
        removed = true;
        if (w.endsWith('at') && w.length - 2 >= r2) w = w.slice(0, -2);
      }
    }
  }

  if (!removed) {
    // Step 2a: verb suffixes beginning with y, after u.
    let done = false;
    const s2a = longest(w.slice(rv), ['ya', 'ye', 'yan', 'yen', 'yeron', 'yendo', 'yo', 'yó', 'yas', 'yes', 'yais', 'yamos']);
    if (s2a && w[w.length - s2a.length - 1] === 'u') {
      w = w.slice(0, -s2a.length);
      done = true;
    }
    if (!done) {
      // Step 2b.
      const s2b = longest(w.slice(rv), ES_STEP2B);
      if (s2b) {
        w = w.slice(0, -s2b.length);
        if ((s2b === 'en' || s2b === 'es' || s2b === 'éis' || s2b === 'emos') && w.endsWith('gu')) w = w.slice(0, -1);
      }
    }
  }

  // Step 3: residual suffix.
  const s3 = longest(w, ['os', 'a', 'o', 'á', 'í', 'ó', 'e', 'é']);
  if (s3 && w.length - s3.length >= rv) {
    w = w.slice(0, -s3.length);
    if ((s3 === 'e' || s3 === 'é') && w.endsWith('gu') && w.length - 1 >= rv) w = w.slice(0, -1);
  }

  return w.replace(/[áéíóú]/g, (c) => ACUTE[c]);
}

// ------------------------------------------------------------------ Italian

const IT_VOWELS = charsOf('aeiouàèìòù');
const itV = (c) => IT_VOWELS.has(c);
const IT_PRONOUNS = ['ci', 'gli', 'la', 'le', 'li', 'lo', 'mi', 'ne', 'si', 'ti', 'vi', 'sene', 'gliela', 'gliele',
  'glieli', 'glielo', 'gliene', 'mela', 'mele', 'meli', 'melo', 'mene', 'tela', 'tele', 'teli', 'telo', 'tene', 'cela',
  'cele', 'celi', 'celo', 'cene', 'vela', 'vele', 'veli', 'velo', 'vene'];
const IT_GROUP1 = ['anza', 'anze', 'ico', 'ici', 'ica', 'ice', 'iche', 'ichi', 'ismo', 'ismi', 'abile', 'abili', 'ibile',
  'ibili', 'ista', 'iste', 'isti', 'istà', 'istè', 'istì', 'oso', 'osi', 'osa', 'ose', 'mente', 'atrice', 'atrici',
  'ante', 'anti'];
const IT_STEP1 = IT_GROUP1.concat(['azione', 'azioni', 'atore', 'atori', 'logia', 'logie', 'uzione', 'uzioni', 'usione',
  'usioni', 'enza', 'enze', 'amento', 'amenti', 'imento', 'imenti', 'amente', 'ità', 'ivo', 'ivi', 'iva', 'ive']);
const IT_STEP2 = ['ammo', 'ando', 'ano', 'are', 'arono', 'asse', 'assero', 'assi', 'assimo', 'ata', 'ate', 'ati', 'ato',
  'ava', 'avamo', 'avano', 'avate', 'avi', 'avo', 'emmo', 'enda', 'ende', 'endi', 'endo', 'erà', 'erai', 'eranno', 'ere',
  'erebbe', 'erebbero', 'erei', 'eremmo', 'eremo', 'ereste', 'eresti', 'erete', 'erò', 'erono', 'essero', 'ete', 'eva',
  'evamo', 'evano', 'evate', 'evi', 'evo', 'Yamo', 'iamo', 'immo', 'irà', 'irai', 'iranno', 'ire', 'irebbe', 'irebbero',
  'irei', 'iremmo', 'iremo', 'ireste', 'iresti', 'irete', 'irò', 'irono', 'isca', 'iscano', 'isce', 'isci', 'isco',
  'iscono', 'issero', 'ita', 'ite', 'iti', 'ito', 'iva', 'ivamo', 'ivano', 'ivate', 'ivi', 'ivo', 'ono', 'uta', 'ute',
  'uti', 'uto', 'ar', 'ir'];
const IT_ELISION = /^(?:d|l|m|s|t|v|all|dall|dell|gl|nell|quell|quest|sull|tutt|un)['’](?=.)/;

export function stemItalian(word) {
  let w = word;
  const el = IT_ELISION.exec(w);
  if (el) w = w.slice(el[0].length);
  w = w.replace(/[áéíóú]/g, (c) => ({ á: 'à', é: 'è', í: 'ì', ó: 'ò', ú: 'ù' }[c]));
  const a = w.split('');
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 'u' && a[i - 1] === 'q') { a[i] = 'U'; continue; }
    if ((a[i] === 'u' || a[i] === 'i') && i > 0 && i < a.length - 1 && itV(a[i - 1]) && itV(a[i + 1])) a[i] = a[i].toUpperCase();
  }
  w = a.join('');

  const rv = w.startsWith('divan') ? 5 : rvRomance(w, itV);
  const r1 = regionAfter(w, 0, itV);
  const r2 = regionAfter(w, r1, itV);
  const inR = (len, r) => w.length - len >= r;

  // Step 0: attached pronoun.
  const pron = longest(w, IT_PRONOUNS);
  if (pron) {
    const stem = w.slice(0, -pron.length);
    const form = longest(stem, ['ando', 'endo', 'ar', 'er', 'ir']);
    if (form && stem.length - form.length >= rv && w.length - pron.length >= rv) {
      w = form === 'ando' || form === 'endo' ? stem : stem + 'e';
    }
  }

  // Step 1.
  let removed = false;
  const s1 = longest(w, IT_STEP1);
  if (s1) {
    const before = w.slice(0, -s1.length);
    if (IT_GROUP1.includes(s1)) {
      if (inR(s1.length, r2)) { w = before; removed = true; }
    } else if (['azione', 'azioni', 'atore', 'atori'].includes(s1)) {
      if (inR(s1.length, r2)) {
        w = before;
        removed = true;
        if (w.endsWith('ic') && w.length - 2 >= r2) w = w.slice(0, -2);
      }
    } else if (s1 === 'logia' || s1 === 'logie') {
      if (inR(s1.length, r2)) { w = before + 'log'; removed = true; }
    } else if (['uzione', 'uzioni', 'usione', 'usioni'].includes(s1)) {
      if (inR(s1.length, r2)) { w = before + 'u'; removed = true; }
    } else if (s1 === 'enza' || s1 === 'enze') {
      if (inR(s1.length, r2)) { w = before + 'ente'; removed = true; }
    } else if (['amento', 'amenti', 'imento', 'imenti'].includes(s1)) {
      if (inR(s1.length, rv)) { w = before; removed = true; }
    } else if (s1 === 'amente') {
      if (inR(s1.length, r1)) {
        w = before;
        removed = true;
        if (w.endsWith('iv') && w.length - 2 >= r2) {
          w = w.slice(0, -2);
          if (w.endsWith('at') && w.length - 2 >= r2) w = w.slice(0, -2);
        } else {
          const t = longest(w, ['os', 'ic', 'abil']);
          if (t && w.length - t.length >= r2) w = w.slice(0, -t.length);
        }
      }
    } else if (s1 === 'ità') {
      if (inR(s1.length, r2)) {
        w = before;
        removed = true;
        const t = longest(w, ['abil', 'ic', 'iv']);
        if (t && w.length - t.length >= r2) w = w.slice(0, -t.length);
      }
    } else {
      // ivo ivi iva ive
      if (inR(s1.length, r2)) {
        w = before;
        removed = true;
        if (w.endsWith('at') && w.length - 2 >= r2) {
          w = w.slice(0, -2);
          if (w.endsWith('ic') && w.length - 2 >= r2) w = w.slice(0, -2);
        }
      }
    }
  }

  // Step 2: verb suffixes.
  if (!removed) {
    const s2 = longest(w.slice(rv), IT_STEP2);
    if (s2) w = w.slice(0, -s2.length);
  }

  // Step 3a.
  if (/[aeioàèìò]$/.test(w) && w.length - 1 >= rv) {
    w = w.slice(0, -1);
    if (w.endsWith('i') && w.length - 1 >= rv) w = w.slice(0, -1);
  }
  // Step 3b.
  if ((w.endsWith('ch') || w.endsWith('gh')) && w.length - 2 >= rv) w = w.slice(0, -1);

  return w.replace(/I/g, 'i').replace(/U/g, 'u');
}

// ------------------------------------------------------------------ Portuguese

const PT_VOWELS = charsOf('aeiouáéíóúâêô');
const ptV = (c) => PT_VOWELS.has(c);
const PT_GROUP1 = ['eza', 'ezas', 'ico', 'ica', 'icos', 'icas', 'ismo', 'ismos', 'ável', 'ível', 'ista', 'istas', 'oso',
  'osa', 'osos', 'osas', 'amento', 'amentos', 'imento', 'imentos', 'adora', 'ador', 'aça~o', 'adoras', 'adores', 'aço~es',
  'ante', 'antes', 'ância'];
const PT_STEP1 = PT_GROUP1.concat(['logia', 'logias', 'uça~o', 'uço~es', 'ência', 'ências', 'amente', 'mente', 'idade',
  'idades', 'iva', 'ivo', 'ivas', 'ivos', 'ira', 'iras']);
const PT_STEP2 = ['ada', 'ida', 'ia', 'aria', 'eria', 'iria', 'ará', 'ara', 'erá', 'era', 'irá', 'ava', 'asse', 'esse',
  'isse', 'aste', 'este', 'iste', 'ei', 'arei', 'erei', 'irei', 'am', 'iam', 'ariam', 'eriam', 'iriam', 'aram', 'eram',
  'iram', 'avam', 'em', 'arem', 'erem', 'irem', 'assem', 'essem', 'issem', 'ado', 'ido', 'ando', 'endo', 'indo', 'ara~o',
  'era~o', 'ira~o', 'ar', 'er', 'ir', 'as', 'adas', 'idas', 'ias', 'arias', 'erias', 'irias', 'arás', 'aras', 'erás',
  'eras', 'irás', 'avas', 'es', 'ardes', 'erdes', 'irdes', 'ares', 'eres', 'ires', 'asses', 'esses', 'isses', 'astes',
  'estes', 'istes', 'is', 'ais', 'eis', 'íeis', 'aríeis', 'eríeis', 'iríeis', 'áreis', 'areis', 'éreis', 'ereis',
  'íreis', 'ireis', 'ásseis', 'ésseis', 'ísseis', 'áveis', 'ados', 'idos', 'ámos', 'amos', 'íamos', 'aríamos',
  'eríamos', 'iríamos', 'áramos', 'éramos', 'íramos', 'ávamos', 'emos', 'aremos', 'eremos', 'iremos', 'ássemos',
  'êssemos', 'íssemos', 'imos', 'armos', 'ermos', 'irmos', 'eu', 'iu', 'ou', 'ira', 'iras'];

export function stemPortuguese(word) {
  let w = word.replace(/ã/g, 'a~').replace(/õ/g, 'o~');
  const rv = rvRomance(w, ptV);
  const r1 = regionAfter(w, 0, ptV);
  const r2 = regionAfter(w, r1, ptV);
  const inR = (len, r) => w.length - len >= r;

  let changed = false;
  const s1 = longest(w, PT_STEP1);
  if (s1) {
    const before = w.slice(0, -s1.length);
    if (PT_GROUP1.includes(s1)) {
      if (inR(s1.length, r2)) { w = before; changed = true; }
    } else if (s1 === 'logia' || s1 === 'logias') {
      if (inR(s1.length, r2)) { w = before + 'log'; changed = true; }
    } else if (s1 === 'uça~o' || s1 === 'uço~es') {
      if (inR(s1.length, r2)) { w = before + 'u'; changed = true; }
    } else if (s1 === 'ência' || s1 === 'ências') {
      if (inR(s1.length, r2)) { w = before + 'ente'; changed = true; }
    } else if (s1 === 'amente') {
      if (inR(s1.length, r1)) {
        w = before;
        changed = true;
        if (w.endsWith('iv') && w.length - 2 >= r2) {
          w = w.slice(0, -2);
          if (w.endsWith('at') && w.length - 2 >= r2) w = w.slice(0, -2);
        } else {
          const t = longest(w, ['os', 'ic', 'ad']);
          if (t && w.length - 2 >= r2) w = w.slice(0, -2);
        }
      }
    } else if (s1 === 'mente') {
      if (inR(s1.length, r2)) {
        w = before;
        changed = true;
        const t = longest(w, ['ante', 'avel', 'ível']);
        if (t && w.length - t.length >= r2) w = w.slice(0, -t.length);
      }
    } else if (s1 === 'idade' || s1 === 'idades') {
      if (inR(s1.length, r2)) {
        w = before;
        changed = true;
        const t = longest(w, ['abil', 'ic', 'iv']);
        if (t && w.length - t.length >= r2) w = w.slice(0, -t.length);
      }
    } else if (s1 === 'ira' || s1 === 'iras') {
      if (inR(s1.length, rv) && before.endsWith('e')) { w = before + 'ir'; changed = true; }
    } else {
      // iva ivo ivas ivos
      if (inR(s1.length, r2)) {
        w = before;
        changed = true;
        if (w.endsWith('at') && w.length - 2 >= r2) w = w.slice(0, -2);
      }
    }
  }

  if (!changed) {
    const s2 = longest(w.slice(rv), PT_STEP2);
    if (s2) { w = w.slice(0, -s2.length); changed = true; }
  }

  if (changed) {
    // Step 3.
    if (w.endsWith('ci') && w.length - 1 >= rv) w = w.slice(0, -1);
  } else {
    // Step 4: residual suffix.
    const s4 = longest(w, ['os', 'a', 'i', 'o', 'á', 'í', 'ó']);
    if (s4 && w.length - s4.length >= rv) w = w.slice(0, -s4.length);
  }

  // Step 5.
  const s5 = longest(w, ['e', 'é', 'ê', 'ç']);
  if (s5 === 'ç') {
    w = w.slice(0, -1) + 'c';
  } else if (s5 && w.length - 1 >= rv) {
    w = w.slice(0, -1);
    if ((w.endsWith('gu') || w.endsWith('ci')) && w.length - 1 >= rv) w = w.slice(0, -1);
  }

  return w.replace(/a~/g, 'ã').replace(/o~/g, 'õ');
}

// ------------------------------------------------------------------ Dutch (Porter)

const NL_VOWELS = charsOf('aeiouyè');
const nlV = (c) => NL_VOWELS.has(c);
const NL_ACCENTS = { ä: 'a', ë: 'e', ï: 'i', ö: 'o', ü: 'u', á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' };

export function stemDutch(word) {
  let w = word.replace(/[äëïöüáéíóú]/g, (c) => NL_ACCENTS[c]);
  const a = w.split('');
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 'y' && (i === 0 || nlV(a[i - 1]))) a[i] = 'Y';
    else if (a[i] === 'i' && i > 0 && i < a.length - 1 && nlV(a[i - 1]) && nlV(a[i + 1])) a[i] = 'I';
  }
  w = a.join('');

  let r1 = regionAfter(w, 0, nlV);
  const r2 = regionAfter(w, r1, nlV);
  if (r1 < 3) r1 = Math.min(3, w.length);

  const undouble = () => { if (/(?:kk|dd|tt)$/.test(w)) w = w.slice(0, -1); };
  const validS = (c) => c !== undefined && !nlV(c) && c !== 'j';
  const validEn = (before) => {
    const c = before[before.length - 1];
    return c !== undefined && !nlV(c) && !before.endsWith('gem');
  };
  const deleteEn = () => {
    const s = longest(w, ['en', 'ene']);
    if (!s) return false;
    const before = w.slice(0, -s.length);
    if (w.length - s.length >= r1 && validEn(before)) {
      w = before;
      undouble();
      return true;
    }
    return false;
  };

  // Step 1.
  const s1 = longest(w, ['heden', 'en', 'ene', 's', 'se']);
  if (s1 === 'heden') {
    if (w.length - 5 >= r1) w = w.slice(0, -5) + 'heid';
  } else if (s1 === 'en' || s1 === 'ene') {
    deleteEn();
  } else if (s1 === 's' || s1 === 'se') {
    const before = w.slice(0, -s1.length);
    if (w.length - s1.length >= r1 && validS(before[before.length - 1])) w = before;
  }

  // Step 2.
  let eFound = false;
  const step2 = () => {
    if (w.endsWith('e') && w.length - 1 >= r1 && w.length >= 2 && !nlV(w[w.length - 2])) {
      w = w.slice(0, -1);
      eFound = true;
      undouble();
    }
  };
  step2();

  // Step 3a.
  if (w.endsWith('heid') && w.length - 4 >= r2 && w[w.length - 5] !== 'c') {
    w = w.slice(0, -4);
    if (w.endsWith('en')) deleteEn();
  }

  // Step 3b.
  const s3 = longest(w, ['end', 'ing', 'ig', 'lijk', 'baar', 'bar']);
  if (s3 && w.length - s3.length >= r2) {
    const before = w.slice(0, -s3.length);
    if (s3 === 'end' || s3 === 'ing') {
      w = before;
      if (w.endsWith('ig') && w.length - 2 >= r2 && w[w.length - 3] !== 'e') w = w.slice(0, -2);
      else undouble();
    } else if (s3 === 'ig') {
      if (before[before.length - 1] !== 'e') w = before;
    } else if (s3 === 'lijk') {
      w = before;
      step2();
    } else if (s3 === 'baar') {
      w = before;
    } else if (eFound) {
      w = before;
    }
  }

  // Step 4: undouble a vowel ("maan" stays, "kaars"-like CVVD → CVD).
  if (w.length >= 4) {
    const n = w.length;
    const c = w[n - 4], v1 = w[n - 3], v2 = w[n - 2], d = w[n - 1];
    if (!nlV(c) && v1 === v2 && 'aeou'.indexOf(v1) >= 0 && !nlV(d) && d !== 'I') w = w.slice(0, n - 2) + d;
  }

  return w.replace(/I/g, 'i').replace(/Y/g, 'y');
}

// ------------------------------------------------------------------ Russian

const RU_VOWELS = charsOf('аеиоуыэюя');
const ruV = (c) => RU_VOWELS.has(c);
const RU_GERUND1 = ['в', 'вши', 'вшись'];
const RU_GERUND2 = ['ив', 'ивши', 'ившись', 'ыв', 'ывши', 'ывшись'];
const RU_ADJECTIVE = ['ее', 'ие', 'ые', 'ое', 'ими', 'ыми', 'ей', 'ий', 'ый', 'ой', 'ем', 'им', 'ым', 'ом', 'его', 'ого',
  'ему', 'ому', 'их', 'ых', 'ую', 'юю', 'ая', 'яя', 'ою', 'ею'];
const RU_PARTICIPLE1 = ['ем', 'нн', 'вш', 'ющ', 'щ'];
const RU_PARTICIPLE2 = ['ивш', 'ывш', 'ующ'];
const RU_REFLEXIVE = ['ся', 'сь'];
const RU_VERB1 = ['ла', 'на', 'ете', 'йте', 'ли', 'й', 'л', 'ем', 'н', 'ло', 'но', 'ет', 'ют', 'ны', 'ть', 'ешь', 'нно'];
const RU_VERB2 = ['ила', 'ыла', 'ена', 'ейте', 'уйте', 'ите', 'или', 'ыли', 'ей', 'уй', 'ил', 'ыл', 'им', 'ым', 'ен', 'ило',
  'ыло', 'ено', 'ят', 'ует', 'уют', 'ит', 'ыт', 'ены', 'ить', 'ыть', 'ишь', 'ую', 'ю'];
const RU_NOUN = ['а', 'ев', 'ов', 'ие', 'ье', 'е', 'иями', 'ями', 'ами', 'еи', 'ии', 'и', 'ией', 'ей', 'ой', 'ий', 'й',
  'иям', 'ям', 'ием', 'ем', 'ам', 'ом', 'о', 'у', 'ах', 'иях', 'ях', 'ы', 'ь', 'ию', 'ью', 'ю', 'ия', 'ья', 'я'];

export function stemRussian(word) {
  const full = word.replace(/ё/g, 'е');
  let rv = full.length;
  for (let i = 0; i < full.length; i++) if (ruV(full[i])) { rv = i + 1; break; }
  const r1 = regionAfter(full, 0, ruV);
  const r2 = regionAfter(full, r1, ruV);
  const prefix = full.slice(0, rv);
  let w = full.slice(rv); // only RV is ever examined
  const r2rv = Math.max(0, r2 - rv);

  /** Removes the longest of group1 (after а/я) or group2; returns true if removed. */
  const removeGrouped = (g1, g2) => {
    const a = longest(w, g1);
    const b = longest(w, g2);
    let s1ok = false;
    if (a) {
      const p = w[w.length - a.length - 1];
      s1ok = p === 'а' || p === 'я';
    }
    // Longest match across both groups wins; a group-1 match needs а/я before it.
    const cands = [];
    if (a && s1ok) cands.push(a);
    if (b) cands.push(b);
    if (!a && !b) return false;
    // If the longest overall match is a group-1 ending without а/я, the class fails.
    const longestAll = [a, b].filter(Boolean).sort((x, y) => y.length - x.length)[0];
    if (longestAll === a && !s1ok && (!b || b.length <= a.length)) return false;
    const pick = cands.sort((x, y) => y.length - x.length)[0];
    if (!pick) return false;
    w = w.slice(0, -pick.length);
    return true;
  };

  // Step 1.
  if (!removeGrouped(RU_GERUND1, RU_GERUND2)) {
    const refl = longest(w, RU_REFLEXIVE);
    if (refl) w = w.slice(0, -refl.length);
    const adj = longest(w, RU_ADJECTIVE);
    if (adj) {
      w = w.slice(0, -adj.length);
      removeGrouped(RU_PARTICIPLE1, RU_PARTICIPLE2);
    } else if (!removeGrouped(RU_VERB1, RU_VERB2)) {
      const noun = longest(w, RU_NOUN);
      if (noun) w = w.slice(0, -noun.length);
    }
  }

  // Step 2.
  if (w.endsWith('и')) w = w.slice(0, -1);

  // Step 3: derivational suffix in R2.
  const der = longest(w, ['ост', 'ость']);
  if (der && w.length - der.length >= r2rv) w = w.slice(0, -der.length);

  // Step 4.
  const sup = longest(w, ['ейш', 'ейше']);
  if (sup) {
    w = w.slice(0, -sup.length);
    if (w.endsWith('нн')) w = w.slice(0, -1);
  } else if (w.endsWith('нн')) {
    w = w.slice(0, -1);
  } else if (w.endsWith('ь')) {
    w = w.slice(0, -1);
  }

  return prefix + w;
}
