/*
 * Broccoli — GenesisL1's search page: topic maps for search results.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Colours of the topic maps: eight matte hues in a fixed order, made for a
 * white surface and a near-black one (STAGE). Each hue comes in tiers computed
 * in OKLCH (Ottosson's OKLab in polar form): a soft fill for the cells and
 * bubbles that carry labels, a lighter top for their gradient, an edge for
 * outlines, a dark ink of the same hue for the labels on the fill (at least
 * 6.9:1 on the eight fills, 5:1 on every other fill, variant and gradient),
 * and a stronger mark for small unlabelled marks (beads,
 * buds, swatches), whose order passes the colour-blind check (neighbours
 * apart under simulated deuteranopia, protanopia and tritanopia), the eight
 * base marks at least 3:1 against the surface. Topics are always named on the maps, so colour tells
 * neighbours apart and never carries identity alone. Beyond eight topics the
 * hues repeat a step of lightness one way, then the other (towards the ink,
 * then away from it); subtopics are quiet variants of their topic's fill;
 * "Other" is a cool grey.
 */
(function (global) {
  'use strict';

  //            blue       apricot    teal       lavender   sage       rose       sky        sand
  var PALETTE = {
    light: {
      fill: ['#c5dbf8', '#f6d0bd', '#b8e4db', '#ded2f5', '#c9e1c4', '#f3cdda', '#bce0ed', '#ead8ac'],
      mark: ['#5b90d2', '#a5592e', '#04a493', '#7b5fa9', '#669f5a', '#a35173', '#179dc0', '#8b6b05'],
    },
    dark: {
      fill: ['#314157', '#55392b', '#234842', '#443b55', '#344630', '#523741', '#28454f', '#4d3e1a'],
      mark: ['#6696d3', '#ac6640', '#33a998', '#846baf', '#70a465', '#aa5e7d', '#38a2c2', '#967512'],
    },
  };
  var OTHER = { light: { fill: '#dce0e5', mark: '#999fa6' }, dark: { fill: '#33373c', mark: '#646a70' } };
  // the maps' surface and ink (--stage and --ink in app/app.css)
  var STAGE = { light: '#ffffff', dark: '#11171f' };
  var INK = { light: '#090d12', dark: '#e9eef5' };
  var ROOT_WASH = { light: '#eef1f5', dark: '#1a212b' };
  var WHITE = [255, 255, 255];
  var BLACK = [0, 0, 0];

  function rgb(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function hex(c) {
    return '#' + c.map(function (v) {
      var s = Math.round(Math.max(0, Math.min(255, v))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('');
  }

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function css(c, alpha) {
    return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (alpha == null ? 1 : +alpha.toFixed(3)) + ')';
  }

  function channel(v) {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  function unchannel(v) {
    v = Math.max(0, Math.min(1, v));
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  }

  function luminance(c) {
    return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
  }

  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  // ---- OKLCH (Ottosson 2020)

  /** [L, C, h°] of an sRGB colour. */
  function oklch(c) {
    var r = channel(c[0]), g = channel(c[1]), b = channel(c[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    var A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    var B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    var h = Math.atan2(B, A) * 180 / Math.PI;
    return [L, Math.sqrt(A * A + B * B), h < 0 ? h + 360 : h];
  }

  /** The sRGB colour of [L, C, h°], its chroma reduced until it fits sRGB. */
  function fromOklch(L, C, h) {
    var hr = h * Math.PI / 180, a = C * Math.cos(hr), b = C * Math.sin(hr);
    for (var i = 0; i < 40; i++) {
      var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
      var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
      var s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
      var r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
      var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
      var bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
      if ((r >= -1e-4 && r <= 1.0001 && g >= -1e-4 && g <= 1.0001 && bb >= -1e-4 && bb <= 1.0001) || i === 39) {
        return [unchannel(r), unchannel(g), unchannel(bb)];
      }
      a *= 0.95; b *= 0.95;
    }
    return [0, 0, 0];
  }

  /** True when the page is dark: an explicit theme wins, otherwise the system setting. */
  function isDark() {
    var theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function mode(dark) { return dark ? 'dark' : 'light'; }

  // Derived tiers are asked for every label of every frame: remembered by colour.
  var memo = new Map();
  function derived(kind, c, dark, fn) {
    var key = kind + (dark ? 'd' : 'l') + ((Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]));
    var v = memo.get(key);
    if (!v) {
      if (memo.size > 6000) memo.clear();
      v = fn(oklch(c));
      memo.set(key, v);
    }
    return v;
  }

  /** Beyond eight topics the hues repeat a step darker, then a step lighter. */
  function stepped(c, n, dark) {
    var tier = Math.floor(n / 8) % 3;
    if (!tier) return c;
    var o = oklch(c);
    var dl = tier === 1 ? (dark ? 0.05 : -0.045) : (dark ? -0.035 : 0.035);
    return fromOklch(o[0] + dl, o[1] * (tier === 1 ? 1.12 : 0.85), o[2] + (tier === 1 ? 10 : -10));
  }

  /** The fill of the n-th topic of a level (n from 0); `other` gives the grey. */
  function slot(n, dark, other) {
    if (other) return rgb(OTHER[mode(dark)].fill);
    var pal = PALETTE[mode(dark)].fill;
    return stepped(rgb(pal[n % pal.length]), n, dark);
  }

  /** The mark of the n-th topic: the stronger tier, for small marks with no label on them. */
  function markSlot(n, dark, other) {
    if (other) return rgb(OTHER[mode(dark)].mark);
    var pal = PALETTE[mode(dark)].mark;
    return stepped(rgb(pal[n % pal.length]), n, dark);
  }

  /** A node's own fill: the one it wears when its parent is the focus. */
  function identity(node, dark) {
    if (!node.parent) return rgb(ROOT_WASH[mode(dark)]);
    return slot(node.index || 0, dark, node.other);
  }

  /** A node's own mark (beads, buds, swatches). */
  function markOf(node, dark) {
    if (!node.parent) return rgb(INK[mode(dark)]);
    return markSlot(node.index || 0, dark, node.other);
  }

  var SHIFT = [[-0.016, -4, 1.07], [0.013, 3, 0.93], [-0.006, 7, 1.0], [0.02, -6, 0.9], [-0.022, 2, 1.1], [0.007, -3, 0.96]];

  /** A quiet variant of a fill, for the k-th subtopic inside its topic. */
  function variant(c, k, dark) {
    return derived('v' + (k % SHIFT.length), c, dark, function (o) {
      var s = SHIFT[k % SHIFT.length];
      var L = dark ? Math.max(0.28, Math.min(0.46, o[0] - s[0])) : Math.max(0.8, Math.min(0.94, o[0] + s[0]));
      return fromOklch(L, o[1] * s[2], o[2] + s[1]);
    });
  }

  /**
   * The fill of `node` when the map is focused on `focus`: children of the
   * focus wear their own fill, deeper levels quiet variants of their topic's,
   * records variants of the focus's, and the focus and its ancestors a faint wash.
   */
  function relative(node, focus, dark) {
    var stage = rgb(STAGE[mode(dark)]);
    var d = node.depth - focus.depth;
    if (d <= 0) return mix(identity(node, dark), stage, node.parent ? (dark ? 0.62 : 0.58) : 0.2);
    if (node.record != null) {
      var base = focus.parent ? identity(focus, dark) : slot(0, dark, false);
      return variant(base, node.index % 3, dark);
    }
    if (d === 1) return identity(node, dark);
    var top = node;
    while (top.parent && top.depth - focus.depth > 1) top = top.parent;
    var hue = identity(top, dark);
    var v = variant(hue, node.index || 0, dark);
    return d === 2 ? v : mix(v, stage, dark ? 0.18 : 0.28);
  }

  /** The label colour on a fill: a dark ink of its hue on light fills, a pale one on dark fills. */
  function textOn(fill, dark) {
    return derived('i', fill, dark, function (o) {
      var c = o[1] < 0.012 ? o[1] : Math.min(o[1] * (dark ? 0.7 : 1.05), dark ? 0.032 : 0.052);
      var ink = o[0] > 0.6 ? fromOklch(0.335, c, o[2]) : fromOklch(0.925, Math.min(c, 0.032), o[2]);
      return contrast(ink, fill) >= 4.5 ? ink : o[0] > 0.6 ? rgb(INK.light) : rgb(INK.dark);
    });
  }

  /** The light start of a fill's gradient. */
  function topOf(fill, dark) {
    return derived('t', fill, dark, function (o) {
      return dark ? fromOklch(o[0] + 0.04, o[1] * 1.06, o[2]) : fromOklch(Math.min(0.972, o[0] + 0.073), o[1] * 0.42, o[2]);
    });
  }

  /** An outline of a fill's hue, for hover and selection. */
  function edgeOf(fill, dark) {
    return derived('e', fill, dark, function (o) {
      return fromOklch(dark ? 0.68 : 0.6, Math.min(Math.max(o[1] * 1.6, 0.02), 0.085), o[2]);
    });
  }

  global.BroccoliColors = {
    PALETTE: PALETTE, OTHER: OTHER, STAGE: STAGE, INK: INK, WHITE: WHITE, BLACK: BLACK,
    rgb: rgb, hex: hex, mix: mix, css: css, luminance: luminance, contrast: contrast, oklch: oklch, fromOklch: fromOklch,
    isDark: isDark, slot: slot, markSlot: markSlot, identity: identity, markOf: markOf, relative: relative, variant: variant,
    textOn: textOn, topOf: topOf, edgeOf: edgeOf,
    stage: function (dark) { return rgb(STAGE[mode(dark)]); },
    ink: function (dark) { return rgb(INK[mode(dark)]); },
  };
})(typeof window !== 'undefined' ? window : this);
