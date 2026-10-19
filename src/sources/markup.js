/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Text from search APIs arrives with markup of every kind: HTML abstracts,
 * JATS XML (<jats:p>, <jats:sec>), search-match spans, entities. These
 * helpers turn it into plain text for clustering, into safe inline HTML for
 * display (only <i>, <b>, <u>, <sup>, <sub> survive, everything else keeps
 * just its text), and into labelled abstract sections.
 */

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '‌', zwj: '‍', lrm: '', rlm: '',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  lsaquo: '‹', rsaquo: '›', dagger: '†', Dagger: '‡', permil: '‰', bull: '•', prime: '′', Prime: '″',
  oline: '‾', frasl: '⁄', euro: '€', trade: '™', larr: '←', uarr: '↑', rarr: '→', darr: '↓', harr: '↔',
  lArr: '⇐', uArr: '⇑', rArr: '⇒', dArr: '⇓', hArr: '⇔', forall: '∀', part: '∂', exist: '∃', empty: '∅',
  nabla: '∇', isin: '∈', notin: '∉', ni: '∋', prod: '∏', sum: '∑', minus: '−', lowast: '∗', radic: '√',
  prop: '∝', infin: '∞', ang: '∠', and: '∧', or: '∨', cap: '∩', cup: '∪', int: '∫', there4: '∴', sim: '∼',
  cong: '≅', asymp: '≈', ne: '≠', equiv: '≡', le: '≤', ge: '≥', sub: '⊂', sup: '⊃', nsub: '⊄', sube: '⊆',
  supe: '⊇', oplus: '⊕', otimes: '⊗', perp: '⊥', sdot: '⋅', lceil: '⌈', rceil: '⌉', lfloor: '⌊',
  rfloor: '⌋', loz: '◊', spades: '♠', clubs: '♣', hearts: '♥', diams: '♦', OElig: 'Œ', oelig: 'œ',
  Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', fnof: 'ƒ', circ: 'ˆ', tilde: '˜', thetasym: 'ϑ', upsih: 'ϒ', piv: 'ϖ',
};

// ISO 8859-1 entities, U+00A0 to U+00FF in order.
'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'
  .split(' ').forEach((name, i) => { NAMED[name] = String.fromCharCode(160 + i); });

// Greek letters: Alpha (U+0391) to Omega, alpha (U+03B1) to omega.
['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi',
  'Omicron', 'Pi', 'Rho', null, 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'].forEach((name, i) => {
  if (!name) return;
  NAMED[name] = String.fromCharCode(0x391 + i);
  NAMED[name.toLowerCase()] = String.fromCharCode(0x3b1 + i);
});
NAMED.sigmaf = 'ς';

/** Decodes HTML character references: named, decimal and hexadecimal. */
export function decodeHtmlEntities(s) {
  s = s == null ? '' : String(s);
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (m, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
      try { return String.fromCodePoint(code); } catch (e) { return m; }
    }
    const e = NAMED[ref];
    return e === undefined ? m : e;
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const INLINE = {
  i: 'i', em: 'i', italic: 'i', b: 'b', strong: 'b', bold: 'b', u: 'u', underline: 'u', sup: 'sup', sub: 'sub',
};
const BLOCK = new Set([
  'p', 'div', 'br', 'li', 'ul', 'ol', 'dl', 'dt', 'dd', 'tr', 'td', 'th', 'table', 'blockquote', 'section',
  'article', 'list', 'list-item', 'label', 'caption', 'disp-quote', 'def-list', 'def-item', 'term', 'def',
  'abstract', 'trans-abstract', 'hr', 'figure', 'figcaption', 'pre',
]);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'title']);
const SECTIONS = new Set(['sec']);
const DROPPED = new Set(['script', 'style', 'math', 'mml:math', 'tex-math', 'object-id', 'xref']);
// Other tags that are markup and not text ("IL-6 <IL-8>" in plain text is text).
const OTHER_TAGS = new Set([
  'span', 'a', 'font', 'img', 'small', 'big', 'code', 'tt', 'kbd', 'samp', 'var', 'abbr', 'acronym', 'cite',
  'del', 'ins', 'mark', 'q', 's', 'strike', 'center', 'html', 'head', 'body', 'meta', 'link', 'wbr', 'nobr',
  'sc', 'monospace', 'overline', 'roman', 'sans-serif', 'inline-formula', 'disp-formula', 'ext-link', 'uri',
  'email', 'named-content', 'styled-content', 'fn', 'graphic', 'inline-graphic', 'alternatives', 'chem-struct',
  'kwd', 'kwd-group', 'thead', 'tbody', 'tfoot', 'col', 'colgroup', 'nav', 'header', 'footer', 'main', 'aside',
]);

// Namespaces that abstracts use: JATS (Crossref), MathML, XLink.
const PREFIXES = new Set(['jats', 'mml', 'xlink', 'xhtml', 'm']);

function knownLocal(local) {
  return !!INLINE[local] || BLOCK.has(local) || HEADINGS.has(local) || SECTIONS.has(local) || DROPPED.has(local) || OTHER_TAGS.has(local);
}

/** Is this markup? "<https://x.org>" and "<doi:10.1/x>" in plain text are not. */
function knownTag(qname, local) {
  const colon = qname.indexOf(':');
  if (colon < 0) return knownLocal(local);
  const prefix = qname.slice(0, colon);
  return PREFIXES.has(prefix) && (prefix === 'mml' || prefix === 'm' || knownLocal(local));
}

/** The local name of a tag, lower case: "jats:italic" → "italic". */
function localName(tag) {
  const t = tag.toLowerCase();
  const i = t.lastIndexOf(':');
  return i >= 0 && !/^mml:/.test(t) ? t.slice(i + 1) : t;
}

/** Splits markup into text and tag tokens; a stray "<", or an unknown tag, stays text. */
function tokenize(src) {
  const tokens = [];
  // The tag name is bounded and must end at a space, "/" or ">", so a "<" before a long word cannot make the match slow.
  const rx = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z][\w:.-]{0,63})(?=[\s/>])((?:[^<>"']|"[^"<>]*"|'[^'<>]*')*)>|([^<]+)|</g;
  let m;
  while ((m = rx.exec(src))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[1] !== undefined) {
      tokens.push({ text: m[1], raw: true });
    } else if (m[3]) {
      const qname = m[3].toLowerCase();
      const local = localName(m[3]);
      if (knownTag(qname, local)) tokens.push({ tag: local, qname, close: m[2] === '/', self: /\/\s*$/.test(m[4] || '') });
      else tokens.push({ text: m[0] });
    } else {
      tokens.push({ text: m[5] !== undefined ? m[5] : '<' });
    }
  }
  return tokens;
}

function collapse(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Walks markup into sections: [{ label, text, html }]. Headings (<h1>–<h6>,
 * JATS <title>) start a new section and become its label; everything else
 * is text. Inline formatting is kept in `html`, safely.
 */
function walk(src, options = {}) {
  const sections = [];
  let current = { label: null, text: '', html: '', open: [] };
  let heading = null;
  let dropping = 0;
  const flush = () => {
    while (current.open.length) current.html += '</' + current.open.pop() + '>';
    const text = collapse(current.text);
    if (text || current.label) {
      sections.push({ label: current.label, text, html: collapse(current.html) });
    }
  };
  const start = (label) => {
    flush();
    current = { label: label || null, text: '', html: '', open: [] };
  };
  for (const t of tokenize(String(src == null ? '' : src))) {
    if (t.tag) {
      if (DROPPED.has(t.tag) || DROPPED.has(t.qname)) {
        if (!t.self) dropping += t.close ? -1 : 1;
        if (dropping < 0) dropping = 0;
        continue;
      }
      if (dropping) continue;
      if (HEADINGS.has(t.tag)) {
        if (!t.close && !t.self) heading = '';
        else if (t.close && heading !== null) {
          const label = collapse(decodeHtmlEntities(heading)).replace(/[:.]\s*$/, '');
          heading = null;
          start(label);
        }
        continue;
      }
      if (heading !== null) continue;
      if (SECTIONS.has(t.tag)) {
        if (!t.close && (current.text.trim() || current.label)) start(null);
        continue;
      }
      const inline = INLINE[t.tag];
      if (inline) {
        if (t.self) continue;
        if (!t.close) {
          current.open.push(inline);
          current.html += '<' + inline + '>';
        } else {
          const at = current.open.lastIndexOf(inline);
          if (at >= 0) {
            while (current.open.length > at) current.html += '</' + current.open.pop() + '>';
          }
        }
        continue;
      }
      if (BLOCK.has(t.tag)) {
        current.text += ' ';
        current.html += ' ';
      }
      continue;
    }
    if (dropping) continue;
    const text = t.raw ? t.text : decodeHtmlEntities(t.text);
    if (heading !== null) { heading += text; continue; }
    current.text += text;
    current.html += escapeHtml(text);
  }
  if (heading !== null && heading.trim()) {
    // An unclosed heading: keep its words as text.
    current.text += ' ' + heading;
    current.html += ' ' + escapeHtml(heading);
  }
  flush();
  let out = sections;
  const drop = (options.dropLabels || ['abstract', 'summary']).map((l) => l.toLowerCase());
  out = out.map((s) => (s.label && drop.indexOf(s.label.toLowerCase()) >= 0 ? Object.assign({}, s, { label: null }) : s))
    .filter((s) => s.text);
  // Merge unlabelled neighbours (a dropped "Abstract" heading, stray paragraphs).
  const merged = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && !s.label && !last.label) {
      last.text += ' ' + s.text;
      last.html += ' ' + s.html;
    } else {
      merged.push(Object.assign({}, s));
    }
  }
  return merged;
}

/** Plain text of markup: tags removed, entities decoded, whitespace collapsed. */
export function markupToText(src) {
  return walk(src, { dropLabels: [] }).map((s) => (s.label ? s.label + '. ' : '') + s.text).join(' ').trim();
}

/** Safe inline HTML of markup: escaped text plus <i>, <b>, <u>, <sup>, <sub>. */
export function markupToSafeHtml(src) {
  return walk(src, { dropLabels: [] }).map((s) => (s.label ? escapeHtml(s.label) + '. ' : '') + s.html).join(' ').trim();
}

/**
 * An abstract as labelled sections: [{ label, text, html }]. Headings such
 * as <h4>Background</h4> or <jats:title>Methods</jats:title> become labels;
 * an "Abstract" heading is dropped. options = { dropLabels: ['abstract', 'summary'] }
 */
export function markupSections(src, options) {
  return walk(src, options);
}

/** Removes Markdown's backslash escapes (ClinicalTrials.gov text). */
export function unescapeMarkdown(s) {
  return String(s == null ? '' : s).replace(/\\([\\`*_{}[\]()#+\-.!<>~|=])/g, '$1');
}
