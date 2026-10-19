/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * A small, fast, non-validating XML parser for E-utilities responses. It
 * runs anywhere (main thread, Web Workers, any JavaScript runtime) and
 * builds a light tree: { name, attrs, children } with strings for text.
 */

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes XML character and entity references. */
export function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (m, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m;
      try {
        return String.fromCodePoint(code);
      } catch (e) {
        return m;
      }
    }
    const e = ENTITIES[ref];
    return e === undefined ? m : e;
  });
}

function isSpace(c) {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

/** Parses an XML string. Returns the document node ({ name: '#document', children }). */
export function parseXml(text) {
  const src = String(text);
  const n = src.length;
  const root = { name: '#document', attrs: {}, children: [] };
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  const pushText = (raw, decode) => {
    if (raw.length === 0) return;
    top().children.push(decode ? decodeEntities(raw) : raw);
  };

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      pushText(src.slice(i), true);
      break;
    }
    if (lt > i) pushText(src.slice(i, lt), true);
    const c1 = src.charCodeAt(lt + 1);
    if (c1 === 33 /* ! */) {
      if (src.startsWith('<!--', lt)) {
        const e = src.indexOf('-->', lt + 4);
        i = e < 0 ? n : e + 3;
        continue;
      }
      if (src.startsWith('<![CDATA[', lt)) {
        const e = src.indexOf(']]>', lt + 9);
        pushText(src.slice(lt + 9, e < 0 ? n : e), false);
        i = e < 0 ? n : e + 3;
        continue;
      }
      // DOCTYPE or other declaration, possibly with an internal subset.
      let j = lt + 2, depth = 0;
      while (j < n) {
        const c = src.charCodeAt(j);
        if (c === 34 || c === 39) {
          const q = src.indexOf(String.fromCharCode(c), j + 1);
          j = q < 0 ? n : q + 1;
          continue;
        }
        if (c === 91) depth++;
        else if (c === 93) depth--;
        else if (c === 62 && depth <= 0) break;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (c1 === 63 /* ? */) {
      const e = src.indexOf('?>', lt + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c1 === 47 /* / */) {
      const gt = src.indexOf('>', lt + 2);
      const name = src.slice(lt + 2, gt < 0 ? n : gt).trim();
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    // Start tag.
    let j = lt + 1;
    while (j < n) {
      const c = src.charCodeAt(j);
      if (isSpace(c) || c === 47 || c === 62) break;
      j++;
    }
    const name = src.slice(lt + 1, j);
    const attrs = {};
    let selfClosing = false;
    while (j < n) {
      while (j < n && isSpace(src.charCodeAt(j))) j++;
      const c = src.charCodeAt(j);
      if (c === 62) { j++; break; }
      if (c === 47 && src.charCodeAt(j + 1) === 62) { j += 2; selfClosing = true; break; }
      let k = j;
      while (k < n) {
        const d = src.charCodeAt(k);
        if (isSpace(d) || d === 61 || d === 62 || d === 47) break;
        k++;
      }
      const attrName = src.slice(j, k);
      j = k;
      while (j < n && isSpace(src.charCodeAt(j))) j++;
      if (src.charCodeAt(j) === 61) {
        j++;
        while (j < n && isSpace(src.charCodeAt(j))) j++;
        const q = src.charCodeAt(j);
        if (q === 34 || q === 39) {
          const e = src.indexOf(String.fromCharCode(q), j + 1);
          attrs[attrName] = decodeEntities(src.slice(j + 1, e < 0 ? n : e));
          j = e < 0 ? n : e + 1;
        } else {
          let e = j;
          while (e < n && !isSpace(src.charCodeAt(e)) && src.charCodeAt(e) !== 62) e++;
          attrs[attrName] = decodeEntities(src.slice(j, e));
          j = e;
        }
      } else if (attrName) {
        attrs[attrName] = '';
      } else {
        j++; // stray character; skip it
      }
    }
    const node = { name, attrs, children: [] };
    top().children.push(node);
    if (!selfClosing) stack.push(node);
    i = j;
  }
  return root;
}

/** First child element with the given name. */
export function child(node, name) {
  if (!node) return null;
  for (const c of node.children) if (typeof c !== 'string' && c.name === name) return c;
  return null;
}

/** All child elements with the given name (or all child elements). */
export function children(node, name) {
  if (!node) return [];
  const out = [];
  for (const c of node.children) if (typeof c !== 'string' && (name === undefined || c.name === name)) out.push(c);
  return out;
}

/** Follows a path of direct children ("A/B/C"); returns the first match or null. */
export function path(node, p) {
  let cur = node;
  for (const part of p.split('/')) {
    cur = child(cur, part);
    if (!cur) return null;
  }
  return cur;
}

/** All elements at the end of a path of direct children. */
export function pathAll(node, p) {
  const parts = p.split('/');
  let level = node ? [node] : [];
  for (const part of parts) {
    const next = [];
    for (const n of level) next.push(...children(n, part));
    level = next;
  }
  return level;
}

/** Concatenated text of a node and its descendants, whitespace collapsed. */
export function textContent(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node.replace(/\s+/g, ' ').trim();
  const parts = [];
  const walk = (n) => {
    for (const c of n.children) {
      if (typeof c === 'string') parts.push(c);
      else walk(c);
    }
  };
  walk(node);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

const INLINE_TAGS = { i: 'i', italic: 'i', em: 'i', b: 'b', bold: 'b', strong: 'b', u: 'u', underline: 'u', sup: 'sup', sub: 'sub' };

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Safe HTML for a node's content: text is escaped and only <i>, <b>, <u>,
 * <sup> and <sub> survive; any other markup keeps just its text.
 */
export function safeHtml(node) {
  if (node == null) return '';
  const walk = (n) => {
    let out = '';
    for (const c of n.children) {
      if (typeof c === 'string') {
        out += escapeHtml(c);
      } else {
        const tag = INLINE_TAGS[c.name.toLowerCase()];
        const inner = walk(c);
        out += tag ? '<' + tag + '>' + inner + '</' + tag + '>' : inner;
      }
    }
    return out;
  };
  return walk(node).replace(/\s+/g, ' ').trim();
}
