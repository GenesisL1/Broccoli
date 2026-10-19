/*
 * Broccoli — PubMed search with topic clusters.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * The florets map: a head of broccoli seen from above. Stems run from the
 * query (the dark centre) to florets (topics); each bud of a floret is one
 * record, laid out on Vogel's sunflower spiral.
 */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

  function node(tag, attrs, parent) {
    var n = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function truncate(s, max) {
    if (s.length <= max) return s;
    var cut = s.slice(0, max - 1);
    var space = cut.lastIndexOf(' ');
    if (space > max * 0.6) cut = cut.slice(0, space);
    return cut.replace(/[\s,;:]+$/, '') + '…';
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  /** Arc-length table of an ellipse, starting at the top and running clockwise. */
  function arcTable(cx, cy, rx, ry, samples) {
    var pts = [], cum = [0];
    var total = 0;
    for (var i = 0; i <= samples; i++) {
      var t = -Math.PI / 2 + (2 * Math.PI * i) / samples;
      pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
      if (i > 0) {
        total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        cum.push(total);
      }
    }
    return {
      total: total,
      at: function (s) {
        s = ((s % total) + total) % total;
        var lo = 0, hi = cum.length - 1;
        while (lo < hi) {
          var mid = (lo + hi) >> 1;
          if (cum[mid] < s) lo = mid + 1; else hi = mid;
        }
        var i0 = Math.max(0, lo - 1), i1 = lo;
        var span = cum[i1] - cum[i0] || 1;
        var f = (s - cum[i0]) / span;
        return { x: pts[i0].x + (pts[i1].x - pts[i0].x) * f, y: pts[i0].y + (pts[i1].y - pts[i0].y) * f };
      },
    };
  }

  /**
   * Renders the map into `svg`.
   * options = {
   *   clusters: [{ id, label, size, documents }], selected: id | null,
   *   width, height, maxClusters, unit: 'record', animate, compact,
   *   onSelect(id), ariaLabel, colorOf(cluster) → { fill, stroke } (optional)
   * }
   */
  function render(svg, options) {
    var width = Math.max(260, Math.round(options.width || 800));
    var height = Math.max(220, Math.round(options.height || 460));
    var compact = !!options.compact || width < 560;
    var unit = options.unit || 'record';
    var items = (options.clusters || []).filter(function (c) { return !c.other && c.size > 0; });
    // Largest topics first: they take the top of the ring and label priority.
    items = items.slice().sort(function (a, b) { return b.size - a.size; });
    items = items.slice(0, options.maxClusters || (compact ? 14 : 28));
    var maxChars = compact ? 15 : 32;

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', options.ariaLabel || 'Topic map');
    svg.classList.toggle('blooming', !!options.animate);
    if (items.length === 0) return;

    var cx = width / 2, cy = height / 2;
    var maxSize = 1;
    items.forEach(function (c) { if (c.size > maxSize) maxSize = c.size; });
    // Larger maps get larger florets and type.
    var fs = width >= 1100 && height >= 560 ? 15 : width >= 760 && height >= 440 ? 14 : 13;
    var charW = fs * 0.55, lineH = fs * 2.3;
    svg.style.setProperty('--florets-fs', fs + 'px');
    var rMax = Math.max(14, Math.min(height * 0.105, width * (compact ? 0.085 : 0.07), 80));
    // Room for the widest label beside the ring, and for two text lines above and below it.
    var widest = 0;
    items.forEach(function (c) { widest = Math.max(widest, Math.min(c.label.length, maxChars)); });
    var labelRoom = Math.min(widest * charW + 14, width * (compact ? 0.3 : 0.27));
    var ry = Math.max(36, height / 2 - rMax - lineH - 10);
    var rx = Math.max(Math.min(ry, width / 2 - rMax - 8), Math.min(width / 2 - rMax - labelRoom, ry * 1.9));
    var table = arcTable(cx, cy, rx, ry, 720);

    // Area proportional to the number of records, so florets are equally dense everywhere.
    var rTiny = Math.max(3.5, rMax * 0.16);
    var radii = items.map(function (c) { return Math.max(rTiny, rMax * Math.sqrt(c.size / maxSize)); });
    var gap = compact ? 6 : 10;
    var needed = radii.reduce(function (s, r) { return s + 2 * r + gap; }, 0);
    var scale = needed > table.total ? table.total / needed : 1;
    radii = radii.map(function (r) { return r * scale; });
    var extra = scale < 1 ? 0 : (table.total - needed) / items.length;
    var spacing = gap * scale + extra;

    // One bud size for the whole map, set by the largest floret.
    var budRadius = ((radii[0] - 1.2) / Math.sqrt(Math.max(1, items[0].size))) * 0.5;

    var selectedId = options.selected;
    var selectedCluster = null;
    items.forEach(function (c) { if (c.id === selectedId) selectedCluster = c; });
    if (!selectedCluster && selectedId != null) {
      (options.clusters || []).forEach(function (c) { if (c.id === selectedId) selectedCluster = c; });
    }
    var shared = new Set(selectedCluster ? selectedCluster.documents : []);

    // Positions first, so labels can avoid every floret.
    var layout = [];
    var s = 0;
    items.forEach(function (c, i) {
      var r = radii[i];
      s += r;
      var p = table.at(s);
      s += r + spacing;
      var dx = p.x - cx, dy = p.y - cy;
      var dist = Math.hypot(dx, dy) || 1;
      layout.push({ c: c, r: r, x: p.x, y: p.y, ux: dx / dist, uy: dy / dist, dist: dist, i: i });
    });

    var rayLayer = node('g', { 'aria-hidden': 'true' }, svg);
    var floretLayer = node('g', null, svg);
    var placed = [];
    var hitsDisc = function (b, self) {
      for (var q = 0; q < layout.length; q++) {
        var d = layout[q];
        if (d === self) continue;
        var nx = Math.max(b.x, Math.min(d.x, b.x + b.w));
        var ny = Math.max(b.y, Math.min(d.y, b.y + b.h));
        if (Math.hypot(d.x - nx, d.y - ny) < d.r + 2) return true;
      }
      return false;
    };
    var collides = function (b, self) {
      if (b.x < 2 || b.x + b.w > width - 2 || b.y < 0 || b.y + b.h > height) return true;
      for (var q = 0; q < placed.length; q++) if (rectsOverlap(b, placed[q])) return true;
      return hitsDisc(b, self);
    };

    layout.forEach(function (L) {
      var c = L.c, r = L.r, ux = L.ux, uy = L.uy;
      var selected = c.id === selectedId;
      var delay = (L.i * 0.028).toFixed(3) + 's';

      var ray = node('line', {
        class: 'ray' + (selected ? ' selected' : ''),
        x1: cx.toFixed(1), y1: cy.toFixed(1),
        x2: (L.x - ux * r).toFixed(1), y2: (L.y - uy * r).toFixed(1),
      }, rayLayer);
      ray.style.setProperty('--len', Math.max(1, L.dist - r).toFixed(1));
      ray.style.setProperty('--delay', delay);

      var g = node('g', {
        class: 'floret' + (selected ? ' selected' : ''),
        role: 'button',
        tabindex: '0',
        'aria-pressed': selected ? 'true' : 'false',
        'aria-label': c.label + ': ' + c.size + ' ' + unit + (c.size === 1 ? '' : 's'),
        'data-id': String(c.id),
      }, floretLayer);
      g.style.setProperty('--delay', delay);
      g.style.transformOrigin = L.x.toFixed(1) + 'px ' + L.y.toFixed(1) + 'px';
      if (options.colorOf) {
        var col = options.colorOf(c);
        if (col) {
          g.style.setProperty('--bud-fill', col.fill);
          g.style.setProperty('--bud-stroke', col.stroke);
          ray.style.setProperty('--ray', col.ray || col.fill);
        }
      }
      node('title', null, g).textContent = c.label + ' (' + c.size + ')';
      node('circle', { class: 'disc', cx: L.x.toFixed(1), cy: L.y.toFixed(1), r: (r + 3).toFixed(1) }, g);

      // Buds on Vogel's spiral, one per record.
      var n = Math.max(1, c.size);
      var docs = c.documents || [];
      var fr = Math.max(0.85, Math.min(6.5, budRadius));
      if (n === 1) fr = Math.min(fr * 1.3, r);
      var spreadFit = Math.max(0, r - fr) / Math.sqrt(n);
      for (var k = 0; k < n; k++) {
        var rho = spreadFit * Math.sqrt(k + 0.5);
        var th = k * GOLDEN_ANGLE;
        var isShared = !selected && selectedCluster && shared.has(docs[k]);
        node('circle', {
          class: 'bud' + (isShared ? ' shared' : ''),
          cx: (L.x + rho * Math.cos(th)).toFixed(2),
          cy: (L.y + rho * Math.sin(th)).toFixed(2),
          r: fr.toFixed(2),
        }, g);
      }

      // Label outside the floret, along its ray, nudged outwards; then
      // under or over it; hidden (shown on hover and focus) if nothing fits.
      var text = truncate(c.label, maxChars);
      var h = lineH;
      var spot = function (anchor, x, top, label) {
        var w = label.length * charW;
        return { anchor: anchor, ax: x, text: label, box: { x: anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2, y: top, w: w, h: h } };
      };
      var along = function (step) {
        var ax = L.x + ux * (r + 8 + 12 * step), ay = L.y + uy * (r + 8 + 12 * step);
        var anchor = ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
        return spot(anchor, ax, uy < -0.3 ? ay - h : uy > 0.3 ? ay : ay - h / 2, text);
      };
      // Under and over the floret the label may be no wider than the map.
      var narrow = truncate(c.label, Math.max(6, Math.floor((width - 8) / charW)));
      var tries = [along(0), along(1), along(2), along(3), spot('middle', L.x, L.y + r + 5, narrow), spot('middle', L.x, L.y - r - 5 - h, narrow)];
      var pick = null;
      for (var q = 0; q < tries.length && !pick; q++) if (!collides(tries[q].box, L)) pick = tries[q];
      var hidden = !pick;
      if (!pick) pick = tries[0];
      else placed.push(pick.box);
      var anchor = pick.anchor, ax = pick.ax, box = pick.box;
      text = pick.text;
      var lineY = box.y + fs;
      var hide = hidden && !selected ? ' hidden-label' : '';
      var label = node('text', { class: 'label' + hide, x: ax.toFixed(1), y: lineY.toFixed(1), 'text-anchor': anchor }, g);
      label.textContent = text;
      var count = node('text', { class: 'count' + hide, x: ax.toFixed(1), y: (lineY + fs * 1.15).toFixed(1), 'text-anchor': anchor }, g);
      count.textContent = c.size + ' ' + unit + (c.size === 1 ? '' : 's');

      var choose = function (event) {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (options.onSelect) options.onSelect(c.id);
      };
      g.addEventListener('click', choose);
      g.addEventListener('keydown', choose);
    });

    node('circle', { class: 'center', cx: cx.toFixed(1), cy: cy.toFixed(1), r: compact ? 4 : 5.5, 'aria-hidden': 'true' }, svg);
    if (options.animate) {
      setTimeout(function () { svg.classList.remove('blooming'); }, 1800);
    }
  }

  global.BroccoliFlorets = { render: render };
})(typeof window !== 'undefined' ? window : this);
