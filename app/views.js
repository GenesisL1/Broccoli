/*
 * Broccoli — GenesisL1's search page: topic maps for search results.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Zoomable topic maps drawn on a canvas: an organic treemap (a Voronoi
 * treemap), bubbles (circle packing) and a radial map (sunburst). Each shows
 * the focused group's topics; the treemap and radial map also show the
 * subtopics inside them as they are computed. Clicking a topic zooms into
 * it; the page then clusters the records of that topic and its subtopics
 * grow into place.
 *
 * Layout algorithms are written for Broccoli: the treemap's cells are a
 * weighted power diagram (Aurenhammer 1987) whose weights are solved until
 * each cell's area is its topic's share (the Voronoi treemaps of Balzer &
 * Deussen 2005), relaxed towards round shapes (Lloyd 1982), with subtopics
 * as cells inside their topic's cell and records as a honeycomb; circle
 * packing that fills the stage (each circle placed touching two others where
 * the packing keeps the stage's shape, then all grown together); a
 * partition for the radial map; and, should a power diagram not resolve, the
 * squarified treemap of Bruls, Huizing & van Wijk (2000). Shapes morph from
 * one zoom level to the next; camera moves in the bubble map follow the
 * smooth zoom path of van Wijk & Nuij (2003).
 */
(function (global) {
  'use strict';

  var C = global.BroccoliColors;
  var TAU = Math.PI * 2;
  // The page may name the font of the map's labels (window.BroccoliFont).
  var FONT = global.BroccoliFont || '"Atkinson Hyperlegible", "Segoe UI", system-ui, -apple-system, sans-serif';
  var FADE_MS = 460;
  var ZOOM_MS = 760;
  // Ring boundaries (fractions of the radius) for maps one, two or three rings deep.
  var RING_SETS = {
    1: [0, 0.34, 1, 1, 1],
    2: [0, 0.29, 0.69, 1, 1],
    3: [0, 0.25, 0.61, 0.85, 1],
  };
  var MAX_RECORDS = 600;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function now() { return global.performance && performance.now ? performance.now() : Date.now(); }
  function half(v) { return Math.round(v * 2) / 2; }

  // ------------------------------------------------------------ circle packing

  /**
   * Packs circles with areas proportional to `values` into a w × h rectangle.
   * Largest first, each circle goes where it touches two placed circles (or
   * one) and the bounding box stays smallest for the rectangle's shape. Then
   * all circles grow together, pushing overlaps apart, while they still fit.
   * Returns [{ x, y, r }] in input order, in the rectangle's coordinates.
   * opts = { pad, gap (pixels between circles), relax: false to skip growing }
   */
  function packInRect(values, w, h, opts) {
    opts = opts || {};
    var n = values.length;
    var out = new Array(n);
    if (!n) return out;
    var pad = opts.pad != null ? opts.pad : Math.round(clamp(Math.min(w, h) * 0.035, 6, 28));
    var gapPx = opts.gap != null ? opts.gap : clamp(Math.min(w, h) * 0.012, 3, 10);
    var aw = Math.max(1, w - 2 * pad), ah = Math.max(1, h - 2 * pad);
    var aspect = aw / ah;
    var radii = values.map(function (v) { return Math.sqrt(Math.max(+v || 0, 0)); });
    var maxR = Math.max.apply(null, radii) || 1;
    radii = radii.map(function (r) { return Math.max(r / maxR, 0.03); });
    if (n === 1) {
      out[0] = { x: w / 2, y: h / 2, r: Math.max(1, Math.min(aw, ah) / 2) };
      return out;
    }
    // The gap in packing units, from the scale the circles will roughly end up at.
    var area = 0;
    radii.forEach(function (r) { area += Math.PI * r * r; });
    var gap = gapPx / Math.sqrt((aw * ah * 0.6) / area);
    var order = radii.map(function (r, i) { return i; }).sort(function (a, b) { return radii[b] - radii[a] || a - b; });
    var placed = [];
    var bx0 = 0, by0 = 0, bx1 = 0, by1 = 0;
    var best = null, r = 0;
    var consider = function (x, y) {
      for (var p = 0; p < placed.length; p++) {
        var o = placed[p], dx = x - o.x, dy = y - o.y, m = o.r + r + gap - 1e-9;
        if (dx * dx + dy * dy < m * m) return;
      }
      var nx0 = Math.min(bx0, x - r), ny0 = Math.min(by0, y - r), nx1 = Math.max(bx1, x + r), ny1 = Math.max(by1, y + r);
      var fit = Math.max((nx1 - nx0) / aspect, ny1 - ny0);
      // When the box does not grow, the spot nearest its middle wins.
      var mx = (nx0 + nx1) / 2, my = (ny0 + ny1) / 2;
      var dist = ((x - mx) * (x - mx)) / (aspect * aspect) + (y - my) * (y - my);
      if (!best || fit < best.fit - 1e-9 || (fit < best.fit + 1e-9 && dist < best.dist)) {
        best = { x: x, y: y, fit: fit, dist: dist, b: [nx0, ny0, nx1, ny1] };
      }
    };
    for (var k = 0; k < n; k++) {
      var i = order[k];
      r = radii[i];
      if (!placed.length) {
        placed.push({ x: 0, y: 0, r: r, i: i });
        bx0 = by0 = -r; bx1 = by1 = r;
        continue;
      }
      best = null;
      for (var a = 0; a < placed.length; a++) {
        for (var b = a + 1; b < placed.length; b++) {
          var A = placed[a], B = placed[b];
          var ra = A.r + r + gap, rb = B.r + r + gap;
          var dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
          if (d === 0 || d > ra + rb || d < Math.abs(ra - rb)) continue;
          var al = (ra * ra - rb * rb + d2) / (2 * d);
          var hh = Math.sqrt(Math.max(0, ra * ra - al * al));
          var mx = A.x + (al * dx) / d, my = A.y + (al * dy) / d;
          consider(mx - (dy * hh) / d, my + (dx * hh) / d);
          consider(mx + (dy * hh) / d, my - (dx * hh) / d);
        }
      }
      for (var p = 0; p < placed.length; p++) {
        var o = placed[p], dd = o.r + r + gap;
        for (var s = 0; s < 24; s++) consider(o.x + COS24[s] * dd, o.y + SIN24[s] * dd);
      }
      if (!best) consider(bx1 + r + gap, (by0 + by1) / 2);
      placed.push({ x: best.x, y: best.y, r: r, i: i });
      bx0 = best.b[0]; by0 = best.b[1]; bx1 = best.b[2]; by1 = best.b[3];
    }
    var bw = bx1 - bx0, bh = by1 - by0;
    var sc = Math.min(aw / bw, ah / bh);
    var offx = pad + (aw - bw * sc) / 2, offy = pad + (ah - bh * sc) / 2;
    var cs = placed.map(function (c) { return { x: offx + (c.x - bx0) * sc, y: offy + (c.y - by0) * sc, r: c.r * sc, i: c.i }; });
    if (opts.relax !== false) inflate(cs, w, h, pad, gapPx);
    cs.forEach(function (c) { out[c.i] = { x: c.x, y: c.y, r: c.r }; });
    return out;
  }

  var COS24 = [], SIN24 = [];
  for (var s24 = 0; s24 < 24; s24++) { COS24.push(Math.cos((s24 * TAU) / 24)); SIN24.push(Math.sin((s24 * TAU) / 24)); }

  /** Grows packed circles together, pushing overlaps apart, while they still fit in the rectangle. */
  function inflate(cs, w, h, pad, gap) {
    var n = cs.length;
    var settle = function (sweeps) {
      var worst = 0;
      for (var it = 0; it < sweeps; it++) {
        worst = 0;
        for (var i = 0; i < n; i++) {
          var a = cs[i];
          for (var j = i + 1; j < n; j++) {
            var b = cs[j];
            var dx = b.x - a.x, dy = b.y - a.y;
            var d = Math.sqrt(dx * dx + dy * dy);
            var need = a.r + b.r + gap;
            if (d >= need) continue;
            var ov = need - d;
            if (ov > worst) worst = ov;
            if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
            var wa = (b.r * b.r) / (a.r * a.r + b.r * b.r);
            a.x -= (dx / d) * ov * wa; a.y -= (dy / d) * ov * wa;
            b.x += (dx / d) * ov * (1 - wa); b.y += (dy / d) * ov * (1 - wa);
          }
        }
        for (i = 0; i < n; i++) {
          var c = cs[i];
          var lo = pad + c.r, hix = w - pad - c.r, hiy = h - pad - c.r;
          if (lo > hix || lo > hiy) return Infinity;
          if (c.x < lo) { worst = Math.max(worst, lo - c.x); c.x = lo; }
          if (c.x > hix) { worst = Math.max(worst, c.x - hix); c.x = hix; }
          if (c.y < lo) { worst = Math.max(worst, lo - c.y); c.y = lo; }
          if (c.y > hiy) { worst = Math.max(worst, c.y - hiy); c.y = hiy; }
        }
        if (worst < 0.05) return worst;
      }
      return worst;
    };
    var grow = 1.03;
    for (var k = 0; k < 60 && grow > 1.0015; k++) {
      var saved = cs.map(function (c) { return [c.x, c.y, c.r]; });
      cs.forEach(function (c) { c.r *= grow; });
      if (settle(60) > 0.3) {
        cs.forEach(function (c, q) { c.x = saved[q][0]; c.y = saved[q][1]; c.r = saved[q][2]; });
        grow = 1 + (grow - 1) / 2;
      }
    }
    // Whatever overlap is left, all circles shrink together until it is gone.
    var fit = 1;
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var d = Math.sqrt((cs[i].x - cs[j].x) * (cs[i].x - cs[j].x) + (cs[i].y - cs[j].y) * (cs[i].y - cs[j].y));
        var sum = cs[i].r + cs[j].r;
        if (sum + gap > d && sum > 0) fit = Math.min(fit, Math.max(0, d - gap) / sum);
      }
    }
    if (fit < 1) cs.forEach(function (c) { c.r *= fit; });
  }

  /** n equal circles on a hexagonal grid, as large as fit in w × h, in reading order. */
  var ROW = Math.sqrt(3) / 2;  // row spacing of a hexagonal grid, in diameters

  function hexGrid(n, w, h, pad, gap, maxD) {
    var aw = Math.max(1, w - 2 * pad), ah = Math.max(1, h - 2 * pad);
    var best = null;
    for (var cols = 1; cols <= n; cols++) {
      var rows = Math.ceil(n / cols);
      var d = Math.min(aw / (cols + (rows > 1 ? 0.5 : 0)), ah / (1 + (rows - 1) * ROW));
      if (maxD) d = Math.min(d, maxD);
      // with a largest cell, ties go to the arrangement shaped most like the stage
      var shape = Math.abs(Math.log((cols * d) / (d + (rows - 1) * d * ROW) / (aw / ah)));
      if (!best || d > best.d + 1e-9 || (Math.abs(d - best.d) <= 1e-9 && shape < best.shape)) best = { cols: cols, rows: rows, d: d, shape: shape };
      if (rows === 1) break;
    }
    var out = [];
    if (!best) return out;
    var C2 = best.cols, R2 = best.rows, D = best.d;
    var gw = C2 * D + (R2 > 1 ? D / 2 : 0), gh = D + (R2 - 1) * D * ROW;
    var x0 = pad + (aw - gw) / 2 + D / 2, y0 = pad + (ah - gh) / 2 + D / 2;
    for (var i = 0; i < n; i++) {
      var row = Math.floor(i / C2), col = i % C2;
      var inRow = row === R2 - 1 ? n - row * C2 : C2;
      // The last row is centred by whole cells, so it keeps the grid's offsets.
      var shift = (row % 2 ? D / 2 : 0) + (row === R2 - 1 ? Math.floor((C2 - inRow) / 2) * D : 0);
      out.push({ x: x0 + col * D + shift, y: y0 + row * D * ROW, r: Math.max(0.5, D / 2 - gap / 2) });
    }
    return out;
  }

  // ------------------------------------------------------------ squarified treemap

  /** Squarified treemap of `values` (best given largest first) in the rectangle x, y, w, h. */
  function squarify(values, x, y, w, h) {
    var n = values.length;
    var rects = new Array(n);
    var total = 0;
    for (var i = 0; i < n; i++) total += Math.max(0, values[i]);
    if (!n) return rects;
    if (total <= 0 || w <= 0 || h <= 0) {
      for (i = 0; i < n; i++) rects[i] = { x: x, y: y, w: 0, h: 0 };
      return rects;
    }
    var scale = (w * h) / total;
    var row = [];
    var rx = x, ry = y, rw = w, rh = h;
    var worst = function (list, side) {
      var s = 0, mx = 0, mn = Infinity;
      for (var j = 0; j < list.length; j++) {
        s += list[j].a;
        if (list[j].a > mx) mx = list[j].a;
        if (list[j].a < mn) mn = list[j].a;
      }
      if (s <= 0 || mn <= 0) return Infinity;
      var s2 = s * s, side2 = side * side;
      return Math.max((side2 * mx) / s2, s2 / (side2 * mn));
    };
    var flush = function () {
      if (!row.length) return;
      var s = 0;
      row.forEach(function (it) { s += it.a; });
      if (rw >= rh) {
        var cw = rh > 0 ? s / rh : 0, cy = ry;
        row.forEach(function (it) {
          var hh = cw > 0 ? it.a / cw : 0;
          rects[it.i] = { x: rx, y: cy, w: cw, h: hh };
          cy += hh;
        });
        rx += cw; rw -= cw;
      } else {
        var ch = rw > 0 ? s / rw : 0, cx = rx;
        row.forEach(function (it) {
          var ww = ch > 0 ? it.a / ch : 0;
          rects[it.i] = { x: cx, y: ry, w: ww, h: ch };
          cx += ww;
        });
        ry += ch; rh -= ch;
      }
      row = [];
    };
    for (var k = 0; k < n; k++) {
      var item = { i: k, a: Math.max(0, values[k]) * scale };
      if (item.a <= 0) { rects[k] = { x: rx, y: ry, w: 0, h: 0 }; continue; }
      var side = Math.max(1e-9, Math.min(rw, rh));
      if (row.length && worst(row.concat([item]), side) > worst(row, side)) flush();
      row.push(item);
    }
    flush();
    return rects;
  }

  // ------------------------------------------------------------ organic treemap: power diagrams

  // A Voronoi treemap (Balzer & Deussen 2005): each topic is a cell of a
  // weighted power diagram (Aurenhammer 1987) clipped to its container, the
  // weights solved by Newton's method until every cell's area matches its
  // share of the records, then the sites moved towards their cells'
  // centroids (Lloyd 1982) a few times and the areas solved again, which
  // makes the cells round and organic. Containers are convex polygons (the
  // stage, or a topic's own cell for its subtopics), so every cell is convex.
  // Polygons are arrays of [x, y]; a drawn shape is a flat array of RES
  // points resampled along its outline, corners kept, so shapes can morph.

  var RES = 48;

  function polyInfo(p) {
    var a2 = 0, cx = 0, cy = 0;
    for (var i = 0, n = p.length; i < n; i++) {
      var a = p[i], b = p[(i + 1) % n];
      var cr = a[0] * b[1] - b[0] * a[1];
      a2 += cr; cx += (a[0] + b[0]) * cr; cy += (a[1] + b[1]) * cr;
    }
    if (Math.abs(a2) < 1e-18) return { area: 0, x: p.length ? p[0][0] : 0, y: p.length ? p[0][1] : 0, signed: 0 };
    return { area: Math.abs(a2) / 2, x: cx / (3 * a2), y: cy / (3 * a2), signed: a2 / 2 };
  }

  // Sutherland–Hodgman: the part of p with a·x + b·y <= c.
  function clipHalf(p, a, b, c) {
    var n = p.length;
    if (!n) return p;
    var out = [], prev = p[n - 1], pd = a * prev[0] + b * prev[1] - c;
    for (var i = 0; i < n; i++) {
      var cur = p[i], cd = a * cur[0] + b * cur[1] - c;
      if ((pd <= 0) !== (cd <= 0)) {
        var t = pd / (pd - cd);
        out.push([prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]);
      }
      if (cd <= 0) out.push(cur);
      prev = cur; pd = cd;
    }
    return out;
  }

  function powerCells(sites, pot, box) {
    var cells = [];
    for (var i = 0; i < sites.length; i++) {
      var s = sites[i], p = box;
      for (var j = 0; j < sites.length && p.length; j++) {
        if (i === j) continue;
        var o = sites[j];
        p = clipHalf(p, 2 * (o[0] - s[0]), 2 * (o[1] - s[1]), o[0] * o[0] + o[1] * o[1] - s[0] * s[0] - s[1] * s[1] + pot[i] - pot[j]);
      }
      var inf = polyInfo(p);
      cells.push({ points: p, area: inf.area, x: inf.x, y: inf.y });
    }
    return cells;
  }

  /** Whether (x, y) lies on the container's outline (where cell edges have no neighbour). */
  function onBox(box, x, y) {
    for (var k = 0, n = box.length; k < n; k++) {
      var a = box[k], b = box[(k + 1) % n];
      var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0 && Math.abs(dx * (y - a[1]) - dy * (x - a[0])) / len < 1e-9) return true;
    }
    return false;
  }

  // The Jacobian of the cells' areas by the weights: a shared edge of length
  // l between sites d apart gives l / 2d (a graph Laplacian).
  function areaJacobian(cells, sites, pot, box) {
    var n = sites.length, J = [];
    for (var r = 0; r < n; r++) J.push(new Float64Array(n));
    for (var i = 0; i < n; i++) {
      var pts = cells[i].points;
      for (var k = 0; k < pts.length; k++) {
        var p = pts[k], q = pts[(k + 1) % pts.length];
        var len = Math.sqrt((q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1]));
        if (len < 1e-14) continue;
        var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        if (onBox(box, mx, my)) continue;
        var best = -1, bestD = 1e-7, sep = 0;
        for (var j = 0; j < n; j++) {
          if (i === j) continue;
          var dx = sites[j][0] - sites[i][0], dy = sites[j][1] - sites[i][1], d = Math.sqrt(dx * dx + dy * dy);
          if (d < 1e-14) continue;
          var c = sites[j][0] * sites[j][0] + sites[j][1] * sites[j][1] - sites[i][0] * sites[i][0] - sites[i][1] * sites[i][1] + pot[i] - pot[j];
          var dist = Math.abs(2 * dx * mx + 2 * dy * my - c) / (2 * d);
          if (dist < bestD) { bestD = dist; best = j; sep = d; }
        }
        if (best >= 0) {
          var w = len / (4 * sep);  // half of l / 2d from each side of the edge
          J[i][i] += w; J[best][best] += w; J[i][best] -= w; J[best][i] -= w;
        }
      }
    }
    return J;
  }

  /** Solves J·x = e with one weight held at 0 (the system is singular by a constant). */
  function solveAnchored(J, e, anchor) {
    var n = e.length, idx = [];
    for (var i = 0; i < n; i++) if (i !== anchor) idx.push(i);
    var m = idx.length, rows = [];
    for (var r = 0; r < m; r++) {
      var row = new Float64Array(m + 1);
      for (var c = 0; c < m; c++) row[c] = J[idx[r]][idx[c]];
      row[r] += 1e-11;
      row[m] = e[idx[r]];
      rows.push(row);
    }
    for (var col = 0; col < m; col++) {
      var piv = col;
      for (r = col + 1; r < m; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[piv][col])) piv = r;
      var t = rows[col]; rows[col] = rows[piv]; rows[piv] = t;
      var dv = rows[col][col];
      if (Math.abs(dv) < 1e-16) return null;
      for (r = col + 1; r < m; r++) {
        var f = rows[r][col] / dv;
        if (!f) continue;
        for (c = col; c <= m; c++) rows[r][c] -= f * rows[col][c];
      }
    }
    var x = new Float64Array(n), sol = new Float64Array(m);
    for (r = m - 1; r >= 0; r--) {
      var v = rows[r][m];
      for (c = r + 1; c < m; c++) v -= rows[r][c] * sol[c];
      sol[r] = v / rows[r][r];
      if (!isFinite(sol[r])) return null;
      x[idx[r]] = sol[r];
    }
    return x;
  }

  function areaLoss(cells, targets) {
    var v = 0;
    for (var i = 0; i < targets.length; i++) { var d = cells[i].area - targets[i]; v += d * d / Math.max(targets[i], 1e-12); }
    return v;
  }

  function balanceCells(sites, targets, box) {
    var n = sites.length, pot = new Float64Array(n);
    var cells = powerCells(sites, pot, box);
    var anchor = 0;
    for (var i = 1; i < n; i++) if (targets[i] > targets[anchor]) anchor = i;
    for (var it = 0; it < 60; it++) {
      var worst = 0;
      for (i = 0; i < n; i++) worst = Math.max(worst, Math.abs(cells[i].area - targets[i]) / targets[i]);
      if (worst < 0.002) break;
      var e = new Float64Array(n);
      for (i = 0; i < n; i++) e[i] = targets[i] - cells[i].area;
      var dir = solveAnchored(areaJacobian(cells, sites, pot, box), e, anchor);
      if (!dir) break;
      var before = areaLoss(cells, targets), took = false;
      for (var tries = 0, step = 1; tries < 20; tries++, step /= 2) {
        var trial = new Float64Array(n);
        for (i = 0; i < n; i++) trial[i] = pot[i] + step * dir[i];
        var tc = powerCells(sites, trial, box), ok = true;
        for (i = 0; i < n && ok; i++) if (!(tc[i].area > targets[i] * 1e-6)) ok = false;
        if (ok && areaLoss(tc, targets) < before) { pot = trial; cells = tc; took = true; break; }
      }
      if (!took) break;
    }
    return cells;
  }

  function inside(box, x, y) {
    var s = 0;
    for (var k = 0, n = box.length; k < n; k++) {
      var a = box[k], b = box[(k + 1) % n];
      var cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (cr !== 0) { if (s === 0) s = cr > 0 ? 1 : -1; else if ((cr > 0 ? 1 : -1) !== s) return false; }
    }
    return true;
  }

  /** Starting sites: a jittered grid over a rectangle, Vogel's spiral in any other polygon (largest first in the middle). */
  function startSites(n, box, rect) {
    var inf = polyInfo(box), sites = [];
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    box.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    var w = x1 - x0, h = y1 - y0;
    if (rect) {
      var cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * w / h)))), rows = Math.ceil(n / cols);
      for (var i = 0; i < n; i++) {
        var row = Math.floor(i / cols), col = i % cols, inRow = Math.min(cols, n - row * cols);
        var jx = 0.17 * Math.sin((i + 1) * 2.399963229728653), jy = 0.17 * Math.cos((i + 1) * 2.399963229728653);
        sites.push([x0 + (col + 0.5 + jx) * w / inRow, y0 + (row + 0.5 + jy) * h / rows]);
      }
      return sites;
    }
    var golden = Math.PI * (3 - Math.sqrt(5));
    for (var shrink = 0.62; shrink > 0.05; shrink *= 0.8) {
      sites = [];
      var all = true;
      for (i = 0; i < n; i++) {
        var rho = Math.sqrt((i + 0.5) / n) * shrink, th = i * golden;
        var x = inf.x + rho * Math.cos(th) * w / 2, y = inf.y + rho * Math.sin(th) * h / 2;
        if (!inside(box, x, y)) { all = false; break; }
        sites.push([x, y]);
      }
      if (all) return sites;
    }
    for (sites = [], i = 0; i < n; i++) sites.push([inf.x + 1e-3 * Math.cos(i), inf.y + 1e-3 * Math.sin(i)]);
    return sites;
  }

  /**
   * Cells with areas proportional to `values` filling the convex polygon
   * `box` ([x, y] points), in input order; `seeds` (optional) are starting
   * sites. Null when the areas cannot be resolved.
   */
  function voronoiTreemap(values, box, seeds, rect) {
    var n = values.length;
    if (!n) return [];
    if (n === 1) return [box.map(function (p) { return p.slice(); })];
    var inf = polyInfo(box);
    if (!(inf.area > 1)) return null;
    // Unit-sized coordinates keep the solver well conditioned.
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    box.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    var sc = Math.max(x1 - x0, y1 - y0);
    var to = function (p) { return [(p[0] - x0) / sc, (p[1] - y0) / sc]; };
    var ub = box.map(to);
    var total = 0;
    values.forEach(function (v) { total += Math.max(v, 1e-9); });
    var A = polyInfo(ub).area;
    var targets = values.map(function (v) { return A * Math.max(v, 1e-9) / total; });
    var sites = seeds && seeds.length === n ? seeds.map(to) : startSites(n, ub, rect);
    // Seeds outside the box, or on top of each other, start from the spiral instead.
    for (var i = 0; i < n; i++) {
      var bad = !inside(ub, sites[i][0], sites[i][1]);
      for (var j = 0; j < i && !bad; j++) bad = Math.abs(sites[i][0] - sites[j][0]) + Math.abs(sites[i][1] - sites[j][1]) < 1e-6;
      if (bad) { sites = startSites(n, ub, rect); break; }
    }
    var cells = balanceCells(sites, targets, ub);
    for (var pass = 0; pass < 5; pass++) {
      sites = cells.map(function (c, k) { return c.area > 0 ? [0.25 * sites[k][0] + 0.75 * c.x, 0.25 * sites[k][1] + 0.75 * c.y] : sites[k]; });
      cells = balanceCells(sites, targets, ub);
    }
    for (i = 0; i < n; i++) if (!(cells[i].area > targets[i] * 0.05) || cells[i].points.length < 3) return null;
    return cells.map(function (c) { return c.points.map(function (p) { return [x0 + p[0] * sc, y0 + p[1] * sc]; }); });
  }

  /** A polygon as RES points along its outline, its corners kept, clockwise on the screen. */
  function resample(poly) {
    var p = poly.slice();
    if (polyInfo(p).signed < 0) p.reverse();
    // drop repeated points
    p = p.filter(function (q, i) { var r = p[(i + 1) % p.length]; return Math.abs(q[0] - r[0]) + Math.abs(q[1] - r[1]) > 1e-9; });
    var out = new Float64Array(2 * RES), m = p.length;
    if (m === 0) return out;
    if (m === 1) { for (var z = 0; z < RES; z++) { out[2 * z] = p[0][0]; out[2 * z + 1] = p[0][1]; } return out; }
    while (m > RES) {  // more corners than points: the shortest edges go
      var sh = 0, sl = Infinity;
      for (var e = 0; e < m; e++) {
        var a = p[e], b = p[(e + 1) % m], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l < sl) { sl = l; sh = e; }
      }
      p.splice((sh + 1) % m, 1);
      m--;
    }
    var lens = [], per = 0;
    for (e = 0; e < m; e++) { var q0 = p[e], q1 = p[(e + 1) % m]; lens.push(Math.hypot(q1[0] - q0[0], q1[1] - q0[1])); per += lens[e]; }
    var counts = lens.map(function () { return 1; }), extra = RES - m;
    var shares = lens.map(function (l, k) { return { k: k, v: per > 0 ? (l / per) * extra : extra / m }; });
    var given = 0;
    shares.forEach(function (s) { var f = Math.floor(s.v); counts[s.k] += f; given += f; s.v -= f; });
    shares.sort(function (x, y) { return y.v - x.v || x.k - y.k; });
    for (var g = 0; given < extra; g++, given++) counts[shares[g % m].k]++;
    var o = 0;
    for (e = 0; e < m; e++) {
      var s0 = p[e], s1 = p[(e + 1) % m];
      for (var t = 0; t < counts[e]; t++) {
        var f2 = t / counts[e];
        out[o++] = s0[0] + (s1[0] - s0[0]) * f2;
        out[o++] = s0[1] + (s1[1] - s0[1]) * f2;
      }
    }
    return out;
  }

  /** `to` started at the point that best matches `from`, so a morph does not twist. */
  function alignShape(from, to) {
    var n = to.length / 2;
    if (!from || from.length !== to.length || n < 3) return to;
    var best = 0, bestD = Infinity;
    for (var off = 0; off < n; off++) {
      var d = 0;
      for (var i = 0; i < n && d < bestD; i++) {
        var j = ((i + off) % n) * 2;
        var dx = to[j] - from[2 * i], dy = to[j + 1] - from[2 * i + 1];
        d += dx * dx + dy * dy;
      }
      if (d < bestD) { bestD = d; best = off; }
    }
    if (!best) return to;
    var out = new Float64Array(to.length);
    for (var k = 0; k < n; k++) { out[2 * k] = to[((k + best) % n) * 2]; out[2 * k + 1] = to[((k + best) % n) * 2 + 1]; }
    return out;
  }

  /** Centroid and area of a flat shape. */
  function shapeInfo(g) {
    var a2 = 0, cx = 0, cy = 0, n = g.length / 2;
    for (var i = 0; i < n; i++) {
      var x0 = g[2 * i], y0 = g[2 * i + 1], j = ((i + 1) % n) * 2, x1 = g[j], y1 = g[j + 1];
      var cr = x0 * y1 - x1 * y0;
      a2 += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
    }
    if (Math.abs(a2) < 1e-9) {
      var sx = 0, sy = 0;
      for (i = 0; i < n; i++) { sx += g[2 * i]; sy += g[2 * i + 1]; }
      return { x: sx / n, y: sy / n, area: 0 };
    }
    return { x: cx / (3 * a2), y: cy / (3 * a2), area: Math.abs(a2) / 2 };
  }

  /** The distance from (x, y) to the nearest edge of a flat shape. */
  function inRadius(g, x, y) {
    var r = Infinity, n = g.length / 2;
    for (var i = 0; i < n; i++) {
      var ax = g[2 * i], ay = g[2 * i + 1], j = ((i + 1) % n) * 2, bx = g[j], by = g[j + 1];
      var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      if (l2 < 1e-12) continue;
      var t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
      var px = ax + t * dx - x, py = ay + t * dy - y;
      r = Math.min(r, Math.sqrt(px * px + py * py));
    }
    return isFinite(r) ? r : 0;
  }

  /** The width of a flat convex shape along the horizontal line at y (0 outside it). */
  function chordAt(g, y) {
    var lo = Infinity, hi = -Infinity, n = g.length / 2;
    for (var i = 0; i < n; i++) {
      var ax = g[2 * i], ay = g[2 * i + 1], j = ((i + 1) % n) * 2, bx = g[j], by = g[j + 1];
      if ((ay <= y && by >= y) || (by <= y && ay >= y)) {
        var x = ay === by ? Math.min(ax, bx) : ax + (y - ay) * (bx - ax) / (by - ay);
        var x2 = ay === by ? Math.max(ax, bx) : x;
        lo = Math.min(lo, x); hi = Math.max(hi, x2);
      }
    }
    return hi > lo ? hi - lo : 0;
  }

  function shapeBox(g) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i < g.length; i += 2) { x0 = Math.min(x0, g[i]); x1 = Math.max(x1, g[i]); y0 = Math.min(y0, g[i + 1]); y1 = Math.max(y1, g[i + 1]); }
    return [x0, y0, x1 - x0, y1 - y0];
  }

  function shapeTest(g) {
    return function (px, py) {
      var inside = false, n = g.length / 2;
      for (var i = 0, j = n - 1; i < n; j = i++) {
        var xi = g[2 * i], yi = g[2 * i + 1], xj = g[2 * j], yj = g[2 * j + 1];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
  }

  /** A pointy-topped hexagon (as [x, y] points) of circumradius r. */
  function hexagon(x, y, r) {
    var out = [];
    for (var k = 0; k < 6; k++) { var a = Math.PI / 6 + k * Math.PI / 3; out.push([x + r * Math.cos(a), y + r * Math.sin(a)]); }
    return out;
  }

  // ------------------------------------------------------------ smooth zoom

  /** Van Wijk & Nuij's optimal zoom-and-pan path between two views [cx, cy, width]. */
  function zoomPath(a, b) {
    var rho = Math.SQRT2, rho2 = 2, rho4 = 4;
    var ux0 = a[0], uy0 = a[1], w0 = a[2], ux1 = b[0], uy1 = b[1], w1 = b[2];
    var dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy;
    if (d2 < 1e-12) {
      var S0 = Math.log(w1 / w0) / rho;
      return {
        length: Math.abs(S0),
        at: function (t) { return [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S0)]; },
      };
    }
    var d1 = Math.sqrt(d2);
    var b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
    var b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
    var r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
    var r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    var S = (r1 - r0) / rho;
    var coshr0 = Math.cosh(r0), sinhr0 = Math.sinh(r0);
    return {
      length: Math.abs(S),
      at: function (t) {
        var s = t * S;
        var u = (w0 / (rho2 * d1)) * (coshr0 * Math.tanh(rho * s + r0) - sinhr0);
        return [ux0 + u * dx, uy0 + u * dy, (w0 * coshr0) / Math.cosh(rho * s + r0)];
      },
    };
  }

  // ------------------------------------------------------------ text

  function makeText(ctx) {
    var cache = new Map();
    var width = function (font, s) {
      var key = font + '|' + s;
      var w = cache.get(key);
      if (w === undefined) {
        if (cache.size > 8000) cache.clear();
        ctx.font = font;
        w = ctx.measureText(s).width;
        cache.set(key, w);
      }
      return w;
    };
    var ellipsize = function (font, s, max) {
      s = String(s || '');
      if (max <= 0) return '';
      if (width(font, s) <= max) return s;
      var lo = 0, hi = s.length;
      while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (width(font, s.slice(0, mid).replace(/[\s,;:.-]+$/, '') + '…') <= max) lo = mid; else hi = mid - 1;
      }
      return lo > 0 ? s.slice(0, lo).replace(/[\s,;:.-]+$/, '') + '…' : '';
    };
    var wrap = function (font, s, max, maxLines) {
      var words = String(s || '').split(/\s+/).filter(Boolean);
      var lines = [];
      var cur = '';
      for (var i = 0; i < words.length; i++) {
        var test = cur ? cur + ' ' + words[i] : words[i];
        if (width(font, test) <= max) { cur = test; continue; }
        if (cur) { lines.push(cur); cur = ''; }
        if (lines.length >= maxLines) {
          lines[maxLines - 1] = ellipsize(font, lines[maxLines - 1] + ' ' + words.slice(i).join(' '), max);
          return lines;
        }
        if (width(font, words[i]) <= max) cur = words[i];
        else {
          lines.push(ellipsize(font, words[i], max));
          if (lines.length >= maxLines && i < words.length - 1) {
            lines[maxLines - 1] = ellipsize(font, lines[maxLines - 1] + ' ' + words.slice(i + 1).join(' '), max);
            return lines;
          }
        }
      }
      if (cur) {
        if (lines.length < maxLines) lines.push(cur);
        else lines[maxLines - 1] = ellipsize(font, lines[maxLines - 1] + ' ' + cur, max);
      }
      return lines.filter(Boolean);
    };
    return { width: width, ellipsize: ellipsize, wrap: wrap };
  }

  // ------------------------------------------------------------ tree helpers

  function readyKids(node) {
    return node && node.status === 'ready' && node.children && node.children.length ? node.children : [];
  }

  /** Largest first, "Other" last: the order in which groups are laid out. */
  function displayOrder(nodes) {
    return nodes.slice().sort(function (a, b) {
      return (a.other ? 1 : 0) - (b.other ? 1 : 0) || b.size - a.size || a.index - b.index;
    });
  }

  /** Largest first, "Other" included: squarified layouts need sizes in order. */
  function bySize(nodes) {
    return nodes.slice().sort(function (a, b) { return b.size - a.size || (a.other ? 1 : 0) - (b.other ? 1 : 0) || a.index - b.index; });
  }

  function isAncestor(a, b) {
    for (var p = b ? b.parent : null; p; p = p.parent) if (p === a) return true;
    return false;
  }

  // ------------------------------------------------------------ the view controller

  /**
   * Creates the canvas maps inside `stage` (a positioned element).
   * options = {
   *   height(width) → px, onFocus(node), onUp(), onRecord(doc),
   *   recordInfo(doc) → { title, meta }, unit: 'record'
   * }
   */
  function create(stage, options) {
    options = options || {};
    var canvas = document.createElement('canvas');
    canvas.className = 'views-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-roledescription', 'topic map');
    canvas.setAttribute('aria-label', 'Topic map. Arrow keys move between topics, Enter zooms in, Escape zooms out.');
    stage.appendChild(canvas);
    var tip = document.createElement('div');
    tip.className = 'views-tip';
    tip.hidden = true;
    stage.appendChild(tip);
    var live = document.createElement('div');
    live.className = 'visually-hidden';
    live.setAttribute('aria-live', 'polite');
    stage.appendChild(live);

    var ctx = canvas.getContext('2d');
    var text = makeText(ctx);
    var unit = options.unit || 'record';
    var S = {
      view: 'treemap',
      active: true,
      root: null,
      focus: null,
      prevFocus: null,
      colorStart: 0,
      W: 0, H: 0, dpr: 1,
      dark: false,
      hover: null,
      pointer: null,
      kbd: -1,
      hits: [],
      hoverAt: 0,
      unhover: null,
      packs: new WeakMap(),
      cells: new WeakMap(),   // treemap: a group's topics over the stage, when it is the focus
      veins: new WeakMap(),   // treemap: a topic's subtopics inside its own cell
      dots: new WeakMap(),    // treemap: where the record dots of a leaf topic's cell go
      hexes: new WeakMap(),   // treemap: the honeycomb of a focus's records
      born: new WeakMap(),
      grown: new WeakSet(),
      records: new WeakMap(),
      cam: { cx: 0, cy: 0, w: 2000 },
      camAnim: null,
      items: new Map(),
      tween: null,
      viewStart: 0,
      raf: 0,
      animEnd: 0,
      rings: RING_SETS[1].slice(),
      ringsFrom: null,
      ringsTo: null,
    };

    var reduced = function () {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    };
    var plural = function (n) { return n.toLocaleString('en-US') + ' ' + unit + (n === 1 ? '' : 's'); };

    // ---------------------------------------------------------- sizing

    function resize() {
      var w = Math.max(240, Math.round(stage.clientWidth || 800));
      var h = Math.round(options.height ? options.height(w) : Math.max(380, Math.min(640, w * 0.62)));
      var dpr = Math.min(3, global.devicePixelRatio || 1);
      if (w === S.W && h === S.H && dpr === S.dpr) return false;
      S.W = w; S.H = h; S.dpr = dpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      return true;
    }

    // ---------------------------------------------------------- records as map units

    function recordNodes(focus) {
      var list = S.records.get(focus);
      if (!list) {
        list = focus.docs.slice(0, MAX_RECORDS).map(function (doc, k) {
          var info = options.recordInfo ? options.recordInfo(doc) : null;
          return {
            id: focus.id + '~' + doc, record: doc, docs: [doc], size: 1, index: k,
            label: (info && info.title) || 'Record ' + (doc + 1),
            depth: focus.depth + 1, parent: focus, children: null, status: 'record',
          };
        });
        S.records.set(focus, list);
      }
      return list;
    }

    // ---------------------------------------------------------- colours

    function colorFor(node, focus) {
      if (node === focus || isAncestor(node, focus) || isAncestor(focus, node)) return C.relative(node, focus, S.dark);
      // Outside the focus: a faint wash of the node's own hue.
      return C.mix(C.identity(node, S.dark), C.stage(S.dark), S.dark ? 0.78 : 0.82);
    }

    function colorProgress(t) {
      if (!S.colorStart) return 1;
      var p = smooth((t - S.colorStart) / ZOOM_MS);
      if (p >= 1) S.colorStart = 0;
      return p;
    }

    // ---------------------------------------------------------- bubbles: packings, frames and camera

    // Every group packs its topics (or, when it has none, its records) into a
    // stage-sized rectangle of its own. One level up, that rectangle sits
    // inside the group's circle with its corners on the circle, so zooming
    // into a circle until it circumscribes the stage shows its contents
    // filling the stage.

    function packKey() { return S.W + 'x' + S.H; }

    function packGap() { return clamp(Math.min(S.W, S.H) * 0.013, 3, 11); }
    function packPad() { return Math.round(clamp(Math.min(S.W, S.H) * 0.035, 8, 30)); }

    /** The packed contents of `node` in its own frame, or null while they are not known. */
    function packing(node) {
      var kids = readyKids(node);
      var records = !kids.length && node.status === 'leaf';
      if (!kids.length && !records) return null;
      var key = packKey();
      var p = S.packs.get(node);
      if (p && p.key === key && p.kids === (records ? null : kids)) return p;
      var items;
      if (records) {
        var recs = recordNodes(node);
        var grid = hexGrid(recs.length, S.W, S.H, packPad(), packGap());
        items = recs.map(function (rn, i) { return { node: rn, x: grid[i].x, y: grid[i].y, r: grid[i].r }; });
      } else {
        var circles = packInRect(kids.map(function (k) { return Math.max(1, k.size); }), S.W, S.H, { pad: packPad(), gap: packGap() });
        items = kids.map(function (k, i) { return { node: k, x: circles[i].x, y: circles[i].y, r: circles[i].r }; });
      }
      var byId = new Map();
      items.forEach(function (it) { byId.set(it.node.id, it); });
      p = { key: key, kids: records ? null : kids, records: records, items: items, byId: byId };
      S.packs.set(node, p);
      return p;
    }

    var ROOT_FRAME = { s: 1, tx: 0, ty: 0 };

    /** The frame of a circle's contents: local stage coordinates → world. */
    function childFrame(fr, it) {
      var s = it.r / (Math.sqrt(S.W * S.W + S.H * S.H) / 2);
      return { s: fr.s * s, tx: fr.tx + fr.s * (it.x - (s * S.W) / 2), ty: fr.ty + fr.s * (it.y - (s * S.H) / 2) };
    }

    function frameOf(node) {
      if (!node || !node.parent) return ROOT_FRAME;
      var pf = frameOf(node.parent);
      var p = packing(node.parent);
      var it = p && p.byId.get(node.id);
      return it ? childFrame(pf, it) : pf;
    }

    function fitCam(node) {
      var f = frameOf(node);
      return { cx: f.tx + (f.s * S.W) / 2, cy: f.ty + (f.s * S.H) / 2, w: f.s * S.W };
    }

    function camAt(t) {
      var a = S.camAnim;
      if (!a) return S.cam;
      var p = (t - a.start) / a.dur;
      if (p >= 1) { S.cam = a.to; S.camAnim = null; return S.cam; }
      var e = ease(clamp(p, 0, 1));
      a.e = e;
      var v = a.path.at(e);
      return { cx: v[0], cy: v[1], w: v[2] };
    }

    function onPath(n, target) { return n === target || isAncestor(n, target); }

    /**
     * How far each group is opened: 1 for the focus and its ancestors, 0 for
     * the rest, and in between while the camera moves from one focus to another.
     */
    function opener() {
      var a = S.camAnim, f = S.focus;
      if (!a) return function (n) { return onPath(n, f) ? 1 : 0; };
      var e = a.e || 0;
      return function (n) {
        var o0 = a.from.has(n) ? a.from.get(n) : 0;
        var o1 = onPath(n, a.toFocus) ? 1 : 0;
        return o0 === o1 ? o0 : lerp(o0, o1, e);
      };
    }

    function moveCamera(target, fromFocus, toFocus, animate) {
      var t = now();
      var from = camAt(t);
      var before = S.camAnim ? opener() : function (n) { return onPath(n, fromFocus) ? 1 : 0; };
      if (!animate) { S.cam = target; S.camAnim = null; return; }
      // Remember how open everything is now, so a zoom that interrupts another starts where it stands.
      var openNow = new Map();
      var mark = function (n) { for (; n; n = n.parent) if (!openNow.has(n)) openNow.set(n, before(n)); };
      mark(fromFocus);
      if (S.camAnim) { mark(S.camAnim.toFocus); S.camAnim.from.forEach(function (v, n) { mark(n); }); }
      var path = zoomPath([from.cx, from.cy, from.w], [target.cx, target.cy, target.w]);
      var dur = clamp(path.length * 430, 520, 1100);
      S.camAnim = { start: t, dur: dur, path: path, to: target, toFocus: toFocus, from: openNow, e: 0 };
      S.animEnd = Math.max(S.animEnd, t + dur);
    }

    /** Fade-in of groups that just appeared (or the opening bloom). */
    function bornAlpha(node, t) {
      var b = S.born.get(node);
      if (!b) return 1;
      var p = (t - b) / FADE_MS;
      if (p >= 1) { S.born.delete(node); return 1; }
      return p <= 0 ? 0 : smooth(p);
    }

    /** Notes the time children appear, so they fade in. */
    function noteBirths(node, t, stagger) {
      if (!node) return;
      var kids = readyKids(node);
      if (kids.length && !S.grown.has(node)) {
        S.grown.add(node);
        if (t) {
          displayOrder(kids).forEach(function (k, i) { S.born.set(k, t + (stagger ? i * stagger : 0)); });
        }
      }
      kids.forEach(function (k) { noteBirths(k, t, 0); });
    }

    /** Hover grows a bubble a little; this eases it in and out. */
    function hoverValue(node, t) {
      var h = S.hover, u = S.unhover;
      if (h && h.node === node && h.kind !== 'up') return smooth((t - S.hoverAt) / 160);
      if (u && u.node === node) return 1 - smooth((t - u.at) / 160);
      return 0;
    }

    // ---------------------------------------------------------- treemap and radial: targets and tweens

    // The treemap's stage, a little inside the canvas.
    function stageRect() {
      var p = clamp(Math.round(Math.min(S.W, S.H) * 0.01), 3, 7);
      return [p, p, S.W - 2 * p, S.H - 2 * p];
    }

    function rectPoly(r) { return [[r[0], r[1]], [r[0] + r[2], r[1]], [r[0] + r[2], r[1] + r[3]], [r[0], r[1] + r[3]]]; }

    function layoutKey() { return S.W + 'x' + S.H; }

    function weightOf(n) { return Math.max(1, n.size); }

    /** Squarified rectangles as polygons: what the treemap falls back on. */
    function squarePolys(list, r) {
      return squarify(list.map(weightOf), r[0], r[1], r[2], r[3]).map(function (q) { return rectPoly([q.x, q.y, q.w, q.h]); });
    }

    /**
     * A group's topics as cells over the whole stage (when it is the focus).
     * A topic's cells start from where its subtopics were drawn inside its
     * cell one level up, so zooming in keeps their places.
     */
    function stageCells(node) {
      var kids = readyKids(node);
      if (!kids.length) return null;
      var key = layoutKey();
      var c = S.cells.get(node);
      if (c && c.key === key && c.kids === kids) return c;
      var list = bySize(kids);
      var r = stageRect(), box = rectPoly(r);
      var seeds = null;
      var up = node.parent ? stageCells(node.parent) : null;
      var mine = up ? up.polys.get(node.id) : null;
      if (mine) {
        var v = veinCells(node, mine, true);
        if (v) {
          var from = shapeBox(v.cellShape);
          seeds = list.map(function (k) {
            var g = v.shapes.get(k.id), inf = shapeInfo(g);
            return [r[0] + (inf.x - from[0]) / (from[2] || 1) * r[2], r[1] + (inf.y - from[1]) / (from[3] || 1) * r[3]];
          });
        }
      }
      var polys = voronoiTreemap(list.map(weightOf), box, seeds, true) || squarePolys(list, r);
      c = { key: key, kids: kids, order: list, polys: new Map(), shapes: new Map() };
      list.forEach(function (k, i) { c.polys.set(k.id, polys[i]); c.shapes.set(k.id, resample(polys[i])); });
      S.cells.set(node, c);
      return c;
    }

    /**
     * A topic's subtopics as cells inside its own cell `poly` (null when they
     * are not known, or the cell is too small to show them; `always` lays
     * them out regardless of size, for the zoom's starting places).
     */
    function veinCells(node, poly, always) {
      var kids = readyKids(node);
      if (!kids.length) return null;
      var key = layoutKey();
      var v = S.veins.get(node);
      if (!v || v.key !== key || v.kids !== kids || v.poly !== poly) {
        var list = bySize(kids);
        var polys = voronoiTreemap(list.map(weightOf), poly, null, false);
        var inf = polyInfo(poly);
        v = { key: key, kids: kids, poly: poly, order: list, shapes: polys ? new Map() : null, cellShape: resample(poly), area: inf.area };
        if (polys) list.forEach(function (k, i) { v.shapes.set(k.id, resample(polys[i])); });
        S.veins.set(node, v);
      }
      if (!v.shapes) return null;
      if (!always) {
        var c = shapeInfo(v.cellShape);
        if (v.area < 5200 || inRadius(v.cellShape, c.x, c.y) < 30) return null;
      }
      return v;
    }

    /** A focus with no subtopics shows its records: a honeycomb of hexagons. */
    function recordShapes(recs) {
      var key = layoutKey() + ':' + recs.length;
      var list = S.hexes.get(recs);
      if (list && list.key === key) return list.shapes;
      var r = stageRect();
      var grid = hexGrid(recs.length, r[2], r[3], 2, Math.max(2, packGap() * 0.5), clamp(Math.min(r[2], r[3]) * 0.42, 150, 300));
      var shapes = grid.map(function (c) { return resample(hexagon(r[0] + c.x, r[1] + c.y, (c.r + 0.6) * 2 / Math.sqrt(3))); });
      S.hexes.set(recs, { key: key, shapes: shapes });
      return shapes;
    }

    function treemapItems(focus) {
      var items = new Map();
      var kids = readyKids(focus);
      if (kids.length) {
        var sc = stageCells(focus);
        sc.order.forEach(function (n) {
          var poly = sc.polys.get(n.id);
          var v = veinCells(n, poly, false);
          items.set(n.id, { node: n, level: 1, geom: sc.shapes.get(n.id), alpha: 1, color: colorFor(n, focus), nested: !!v });
          if (v) v.order.forEach(function (c) {
            items.set(c.id, { node: c, level: 2, geom: v.shapes.get(c.id), alpha: 1, color: colorFor(c, focus) });
          });
        });
      } else if (focus.status !== 'ready') {
        var recs = recordNodes(focus);
        var shapes = recordShapes(recs);
        recs.forEach(function (rn, i) { items.set(rn.id, { node: rn, level: 1, geom: shapes[i], alpha: 1, color: colorFor(rn, focus) }); });
      }
      return items;
    }

    function radialItems(focus) {
      var items = new Map();
      items.set(focus.id, { node: focus, level: 0, geom: [0, TAU, 0, 1], alpha: 1, color: colorFor(focus, focus) });
      var place = function (nodes, a0, a1, depth) {
        var total = 0;
        nodes.forEach(function (n) { total += Math.max(1, n.size); });
        var a = a0;
        nodes.forEach(function (n) {
          var span = ((a1 - a0) * Math.max(1, n.size)) / total;
          items.set(n.id, { node: n, level: depth, geom: [a, a + span, depth, depth + 1], alpha: 1, color: colorFor(n, focus) });
          if (depth < 3) {
            var g = readyKids(n);
            if (g.length) place(displayOrder(g), a, a + span, depth + 1);
          }
          a += span;
        });
      };
      var kids = readyKids(focus);
      var ring = displayOrder(kids.length ? kids : focus.status === 'ready' ? [] : recordNodes(focus));
      if (ring.length) place(ring, 0, TAU, 1);
      return items;
    }

    function targetItems(focus) {
      return S.view === 'treemap' ? treemapItems(focus) : radialItems(focus);
    }

    function ringsFor(items) {
      var deepest = 1;
      items.forEach(function (it) { if (!it.exiting && it.level > deepest) deepest = it.level; });
      return RING_SETS[Math.min(3, deepest)].slice();
    }

    function currentItems(t) {
      var tw = S.tween;
      if (!tw) {
        if (S.ringsTo) { S.rings = S.ringsTo; S.ringsFrom = S.ringsTo = null; }
        return S.items;
      }
      var p = (t - tw.start) / tw.dur;
      if (p >= 1) {
        S.tween = null;
        if (S.ringsTo) { S.rings = S.ringsTo; S.ringsFrom = S.ringsTo = null; }
        return S.items;
      }
      var e = ease(clamp(p, 0, 1));
      if (S.ringsTo) S.rings = S.ringsFrom.map(function (v, i) { return lerp(v, S.ringsTo[i], e); });
      var out = new Map();
      tw.to.forEach(function (b, id) {
        var a = tw.from.get(id) || b;
        var lag = b.delay ? clamp((t - tw.start - b.delay) / (tw.dur - b.delay), 0, 1) : null;
        var f = lag == null ? e : ease(lag);
        var ga = a.geom, gb = b.geom, geom = gb;
        if (ga !== gb && ga.length === gb.length) {
          geom = new Float64Array(gb.length);
          for (var k = 0; k < gb.length; k++) geom[k] = ga[k] + (gb[k] - ga[k]) * f;
        }
        out.set(id, {
          node: b.node, level: b.level, exiting: b.exiting, nested: b.nested,
          geom: geom,
          alpha: lerp(a.alpha, b.alpha, f),
          color: C.mix(a.color, b.color, f),
        });
      });
      return out;
    }

    /**
     * Moves the treemap or radial map to a new set of items. `map` (optional)
     * carries the zoom: map.fwd places old items in the new frame and map.inv
     * new items in the old one. `enter(item)` gives the starting geometry of
     * new items when there is no zoom.
     */
    function retarget(next, dur, map, enter) {
      var t = now();
      var cur = currentItems(t);
      var from = new Map(), to = new Map();
      next.forEach(function (b, id) {
        var a = cur.get(id);
        // A shape morphs from the point of the old outline nearest its own start;
        // one that has not moved keeps the array it had (no motion, its dots kept).
        if (a && S.view === 'treemap' && a.geom.length === b.geom.length && a.geom.length > 8 && a.geom !== b.geom) {
          var al = alignShape(a.geom, b.geom), same = true;
          for (var q = 0; q < al.length && same; q++) same = Math.abs(al[q] - a.geom[q]) < 1e-6;
          b = Object.assign({}, b, { geom: same ? a.geom : al });
          next.set(id, b);
        }
        to.set(id, b);
        if (a) from.set(id, a);
        else {
          var g = map ? map.inv(b.geom) : enter ? enter(b) : b.geom.slice();
          from.set(id, { node: b.node, level: b.level, geom: g, alpha: 0, color: b.color, nested: b.nested });
        }
      });
      cur.forEach(function (a, id) {
        if (next.has(id) || a.alpha < 0.02) return;
        from.set(id, a);
        to.set(id, { node: a.node, level: a.level, geom: map ? map.fwd(a.geom) : a.geom.slice(), alpha: 0, color: a.color, exiting: true, nested: a.nested });
      });
      S.items = next;
      S.tween = dur > 0 ? { start: t, dur: dur, from: from, to: to } : null;
      if (dur > 0) S.animEnd = Math.max(S.animEnd, t + dur);
      if (S.view === 'radial') {
        var target = ringsFor(next);
        if (dur > 0) { S.ringsFrom = S.rings.slice(); S.ringsTo = target; }
        else { S.rings = target; S.ringsFrom = S.ringsTo = null; }
      }
    }

    /** Shapes carried from one rectangle (a cell's bounding box) to another (the stage). */
    function shapeMap(from, to) {
      var sx = to[2] / (from[2] || 1e-6), sy = to[3] / (from[3] || 1e-6);
      var move = function (g, ax, ay, bx, by, kx, ky) {
        var out = new Float64Array(g.length);
        for (var i = 0; i < g.length; i += 2) { out[i] = bx + (g[i] - ax) * kx; out[i + 1] = by + (g[i + 1] - ay) * ky; }
        return out;
      };
      return {
        fwd: function (g) { return move(g, from[0], from[1], to[0], to[1], sx, sy); },
        inv: function (g) { return move(g, to[0], to[1], from[0], from[1], 1 / sx, 1 / sy); },
      };
    }

    function arcMap(from, to) {
      var sx = (to[1] - to[0]) / ((from[1] - from[0]) || 1e-6);
      var dy = to[2] - from[2];
      return {
        fwd: function (g) { return [to[0] + (g[0] - from[0]) * sx, to[0] + (g[1] - from[0]) * sx, g[2] + dy, g[3] + dy]; },
        inv: function (g) { return [from[0] + (g[0] - to[0]) / sx, from[0] + (g[1] - to[0]) / sx, g[2] - dy, g[3] - dy]; },
      };
    }

    /** The zoom between the old and the new focus, if one is the other's ancestor. */
    function zoomMap(oldFocus, newFocus, cur, next) {
      var tree = S.view === 'treemap';
      var whole = tree ? stageRect() : [0, TAU, 0, 1];
      var mapper = tree ? shapeMap : arcMap;
      var frame = function (g) { return tree ? shapeBox(g) : g; };
      var visibleAncestor = function (node, items) {
        for (var n = node; n; n = n.parent) if (items.has(n.id) && items.get(n.id).alpha > 0.5) return n;
        return null;
      };
      if (isAncestor(oldFocus, newFocus)) {
        var shown = visibleAncestor(newFocus, cur);
        if (!shown || shown === oldFocus) return null;
        return mapper(frame(cur.get(shown.id).geom), whole);
      }
      if (isAncestor(newFocus, oldFocus)) {
        var inNew = visibleAncestor(oldFocus, next);
        if (!inNew || inNew === newFocus) return null;
        return mapper(whole, frame(next.get(inNew.id).geom));
      }
      return null;
    }

    function introFrom(item) {
      var g = item.geom;
      if (S.view === 'treemap') {
        // a cell grows from its middle
        var c = shapeInfo(g), out = new Float64Array(g.length);
        for (var i = 0; i < g.length; i += 2) { out[i] = c.x + (g[i] - c.x) * 0.04; out[i + 1] = c.y + (g[i + 1] - c.y) * 0.04; }
        return out;
      }
      if (item.level === 0) return [0, TAU, 0, 0];
      return [g[0], g[0], g[2], g[3]];
    }

    // ---------------------------------------------------------- drawing helpers

    var patterns = new Map();
    var canPattern = typeof global.DOMMatrix === 'function';

    /**
     * A tile of diagonal lines, 7 px apart, at the screen's pixel density:
     * black on the light theme, white on the dark one. Black at 45% of the
     * hatch's opacity darkens a fill exactly as lines of the fill mixed 45%
     * with black would (white lightens it alike), so one tile serves every
     * colour of a theme.
     */
    function hatchPattern() {
      var key = S.dpr + (S.dark ? 'd' : 'l');
      var pat = patterns.get(key);
      if (pat !== undefined) return pat;
      pat = null;
      try {
        var T = Math.max(1, Math.round(7 * S.dpr));
        var tile = document.createElement('canvas');
        tile.width = tile.height = T;
        var tc = tile.getContext('2d');
        tc.strokeStyle = S.dark ? '#fff' : '#000';
        tc.lineWidth = Math.max(1, S.dpr);
        tc.beginPath();
        tc.moveTo(-1, T + 1); tc.lineTo(T + 1, -1);
        tc.moveTo(-1, 1); tc.lineTo(1, -1);
        tc.moveTo(T - 1, T + 1); tc.lineTo(T + 1, T - 1);
        tc.stroke();
        pat = ctx.createPattern(tile, 'repeat');
        if (pat && typeof pat.setTransform !== 'function') pat = null;
      } catch (e) { pat = null; }
      patterns.set(key, pat);
      return pat;
    }

    /** Hatches the current path, darkening its fill: the mark of groups outside any topic. */
    function hatch(x, y, w, h, alpha) {
      var pat = canPattern ? hatchPattern() : null;
      if (pat) {
        // A pattern fill is far cheaper than clipping and stroking; it moves with the shape.
        // Anchored on whole device pixels, so the tile is copied rather than resampled.
        pat.setTransform(new global.DOMMatrix([1 / S.dpr, 0, 0, 1 / S.dpr, Math.round(x * S.dpr) / S.dpr, Math.round(y * S.dpr) / S.dpr]));
        var ga = ctx.globalAlpha;
        ctx.globalAlpha = ga * alpha * 0.45;
        ctx.fillStyle = pat;
        ctx.fill();
        ctx.globalAlpha = ga;
        return;
      }
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = (S.dark ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (0.45 * alpha).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var d = -h; d < w; d += 7) {
        ctx.moveTo(x + d, y + h);
        ctx.lineTo(x + d + h, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    function shimmer(x, y, w, h, t) {
      var span = w + h;
      var pos = ((t / 1300) % 1) * (span + 120) - 60;
      var g = ctx.createLinearGradient(x + pos - 60, y, x + pos + 60, y + h * 0.3);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, S.dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.32)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.clip();
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }

    function spinner(x, y, r, t, color) {
      var a = (t / 380) % TAU;
      ctx.beginPath();
      ctx.arc(x, y, r, a, a + 1.25);
      ctx.strokeStyle = C.css(color, 0.75);
      ctx.lineWidth = Math.max(1.5, Math.min(3, r * 0.05));
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    function drawLines(lines, x, y0, lh, font, color, alpha, align, halo) {
      ctx.font = font;
      ctx.textAlign = align || 'center';
      ctx.textBaseline = 'middle';
      if (halo) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = C.css(halo, 0.85 * alpha);
        for (var j = 0; j < lines.length; j++) ctx.strokeText(lines[j], x, y0 + j * lh);
      }
      ctx.fillStyle = C.css(color, alpha);
      for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y0 + i * lh);
    }

    function countText(node) {
      return plural(node.record != null ? 1 : node.size);
    }

    // ---------------------------------------------------------- bubbles

    function drawBubbles(t) {
      var cam = camAt(t);
      var k = S.W / cam.w;
      var ox = S.W / 2 - cam.cx * k, oy = S.H / 2 - cam.cy * k;
      var focus = S.focus;
      var openOf = opener();
      var busy = !!S.camAnim;
      var labels = [];
      var hits = [];
      var keyed = kbdNode();

      var drawItem = function (node, fr, it, a, oc) {
        var c = it.node;
        var x = (fr.tx + fr.s * it.x) * k + ox, y = (fr.ty + fr.s * it.y) * k + oy, r = fr.s * it.r * k;
        var born = bornAlpha(c, t);
        if (born < 1) { busy = true; r *= 0.6 + 0.4 * easeOut(born); }
        if (oc <= 0 && (r < 0.4 || x + r < -4 || x - r > S.W + 4 || y + r < -4 || y - r > S.H + 4)) return;
        var hv = oc > 0 ? 0 : hoverValue(c, t);
        if (hv > 0 && hv < 1) busy = true;
        var fill = ballColor(c);
        var shown = drawBall(c, x, y, r, a, oc, hv, keyed === c, fill);
        if (oc > 0) level(c, childFrame(fr, it), a * smooth((oc - 0.2) / 0.6));
        else if (shown.r >= 40) drawNecklace(c, x, y, shown.r, a, t);
        var la = a * (1 - smooth(oc / 0.3));
        if (la > 0.02) labels.push({ node: c, x: x, y: y, r: shown.r, alpha: la, fill: shown.fill, moving: !!S.camAnim || born < 1 });
        if (node === focus && oc < 0.5 && a > 0.3) {
          hits.push({ kind: c.record != null ? 'record' : 'node', node: c, doc: c.record, owner: node, x: x, y: y, r: shown.r, test: circleTest(x, y, shown.r) });
        }
      };

      var level = function (node, fr, A) {
        if (A < 0.004) return;
        var p = packing(node);
        if (!p) return;
        var items = p.items;
        var opens = items.map(function (it) { return it.node.record != null ? 0 : openOf(it.node); });
        var maxO = 0;
        opens.forEach(function (o) { if (o > maxO) maxO = o; });
        // Closed circles first; an opening one is drawn over its neighbours as it grows.
        items.forEach(function (it, i) {
          if (opens[i] > 0) return;
          var a = A * (1 - maxO);
          if (a > 0.004) drawItem(node, fr, it, a, 0);
        });
        items.forEach(function (it, i) { if (opens[i] > 0) drawItem(node, fr, it, A, opens[i]); });
      };

      level(S.root, ROOT_FRAME, 1);
      if (focus.status === 'pending' || focus.status === 'idle') {
        spinner(S.W / 2, S.H / 2, clamp(Math.min(S.W, S.H) * 0.06, 16, 30), t, C.ink(S.dark));
        busy = true;
      }
      labels.forEach(drawBallLabel);
      S.hits = hits;
      return busy;
    }

    function circleTest(x, y, r) {
      return function (px, py) { return (px - x) * (px - x) + (py - y) * (py - y) <= r * r; };
    }

    function ballColor(node) {
      if (node.record != null) return C.relative(node, node.parent, S.dark);
      return C.identity(node, S.dark);
    }

    /**
     * One bubble: a faint shadow, a matte body lit softly from the top left
     * and a rim of the stage's colour. `open` (0–1) turns it into the faint
     * wash it becomes once zoomed into.
     */
    function drawBall(node, x, y, r, a, open, hv, keyed, base) {
      var wash = smooth(open / 0.85);
      var closed = 1 - wash;
      var stage = C.stage(S.dark);
      var fill = wash > 0 ? C.mix(base, stage, wash * (S.dark ? 0.66 : 0.62)) : base;
      var rr = r * (1 + 0.035 * hv);
      // A circle around the whole stage is just its background.
      var far = function (px, py) { return (px - x) * (px - x) + (py - y) * (py - y) <= rr * rr; };
      if (far(0, 0) && far(S.W, 0) && far(0, S.H) && far(S.W, S.H)) {
        ctx.fillStyle = C.css(fill, a);
        ctx.fillRect(0, 0, S.W, S.H);
        return { r: rr, fill: fill };
      }
      if (open <= 0 && rr > 6 && !S.dark) {
        var sy = y + rr * 0.05 + 1.5;
        var sr = rr * 1.1 + 2;
        var sg = ctx.createRadialGradient(x, sy, rr * 0.86, x, sy, sr);
        var sa = (0.07 + 0.06 * hv) * a;
        sg.addColorStop(0, 'rgba(24,40,64,' + sa.toFixed(3) + ')');
        sg.addColorStop(1, 'rgba(24,40,64,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(x, sy, sr, 0, TAU);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, TAU);
      if (rr > 7 && wash < 0.4) {
        // The light fades as the bubble opens, so it never needs painting stage-sized.
        var lit = 1 - wash / 0.4;
        var g = ctx.createLinearGradient(x - rr * 0.72, y - rr * 0.72, x + rr * 0.6, y + rr * 0.78);
        g.addColorStop(0, C.css(C.mix(fill, C.topOf(fill, S.dark), lit), a));
        g.addColorStop(1, C.css(fill, a));
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = C.css(fill, a);
      }
      ctx.fill();
      if (node.other && rr > 8) {
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, TAU);
        hatch(x - rr, y - rr, 2 * rr, 2 * rr, (S.dark ? 0.2 : 0.14) * a * (0.4 + 0.6 * closed));
      }
      if (rr > 3) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, rr - 0.7), 0, TAU);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = wash > 0.5 ? C.css(C.edgeOf(base, S.dark), 0.35 * wash * a) : C.css(stage, (S.dark ? 0.55 : 0.9) * closed * a);
        ctx.stroke();
      }
      if ((hv > 0.01 || keyed) && closed > 0.5) {
        ctx.beginPath();
        ctx.arc(x, y, rr + 3, 0, TAU);
        ctx.lineWidth = keyed ? 2.5 : 2;
        ctx.setLineDash(keyed ? [6, 4] : []);
        ctx.strokeStyle = keyed ? C.css(C.ink(S.dark), 0.85 * a) : C.css(C.edgeOf(base, S.dark), 0.95 * hv * a);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      return { r: rr, fill: fill };
    }

    /** A string of small beads along the bottom of a bubble: its subtopics, in their own colours. */
    function drawNecklace(node, x, y, r, a, t) {
      var kids = readyKids(node);
      if (!kids.length) return;
      var shown = displayOrder(kids).filter(function (c) { return !c.other; }).slice(0, 9);
      if (shown.length < 2) return;
      var b = bornAlpha(kids[0], t);
      var alpha = a * b * smooth((r - 40) / 14);
      if (alpha < 0.02) return;
      var n = shown.length;
      var br = clamp(r * 0.055, 2.6, 6.5);
      var rho = r - br * 2.6;
      var step = Math.min((2.7 * br) / rho, 2.2 / (n - 1));
      for (var i = 0; i < n; i++) {
        var th = Math.PI / 2 + (i - (n - 1) / 2) * step;
        var px = x + rho * Math.cos(th), py = y + rho * Math.sin(th);
        ctx.beginPath();
        ctx.arc(px, py, br, 0, TAU);
        ctx.fillStyle = C.css(C.markOf(shown[i], S.dark), alpha);
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = C.css(C.stage(S.dark), 0.9 * alpha);
        ctx.stroke();
      }
    }

    function drawBallLabel(L) {
      var node = L.node, r = L.r;
      var tc = C.textOn(L.fill, S.dark);
      if (node.record != null) {
        if (r < 30) return;
        // A record: its title, and under it the journal and year when there is room.
        var fsR = half(clamp(r / 8.5, 10, 21));
        var fontR = (r > 90 ? '700 ' : '400 ') + fsR + 'px ' + FONT;
        var info = options.recordInfo ? options.recordInfo(node.record) : null;
        var linesR = text.wrap(fontR, info ? info.title : node.label, r * 1.5, r > 120 ? 6 : r > 74 ? 5 : r > 48 ? 4 : 3);
        var lhR = fsR * 1.22;
        var meta = r > 70 && info && info.meta ? info.meta : '';
        var mfs = half(Math.max(10, fsR * 0.72));
        var totalR = linesR.length * lhR + (meta ? mfs * 1.7 : 0);
        var y0R = L.y - totalR / 2 + lhR / 2;
        var aR = L.alpha * smooth((r - 30) / 3);
        drawLines(linesR, L.x, y0R, lhR, fontR, tc, aR, 'center');
        if (meta) drawLines([text.ellipsize('400 ' + mfs + 'px ' + FONT, meta, r * 1.4)], L.x, y0R + (linesR.length - 0.5) * lhR + mfs * 1.1, 0, '400 ' + mfs + 'px ' + FONT, tc, aR * 0.8, 'center');
        return;
      }
      if (r < 13) return;
      // Too small for a name: the number of records. The two cross-fade while a
      // bubble grows or shrinks; at rest it shows one or the other.
      var nameA = L.moving ? smooth((r - 31) / 2.5) : r >= 32.25 ? 1 : 0;
      if (nameA < 1) {
        var nfs = half(clamp(r * 0.56, 10, 17));
        drawLines([node.size.toLocaleString('en-US')], L.x, L.y + 0.5, 0, '700 ' + nfs + 'px ' + FONT, tc, L.alpha * (1 - nameA) * smooth((r - 13) / 2.5), 'center');
        if (nameA <= 0) return;
      }
      var fs = half(clamp(r / 4.4, 11.5, 26));
      var maxLines = r > 120 ? 4 : r > 52 ? 3 : 2;
      var font = '700 ' + fs + 'px ' + FONT;
      var lines = text.wrap(font, node.label, r * 1.56, maxLines);
      // A long label gets a smaller size before it gets an ellipsis.
      if (lines.length && /…$/.test(lines[lines.length - 1]) && fs > 12) {
        fs = half(Math.max(11.5, fs * 0.84));
        font = '700 ' + fs + 'px ' + FONT;
        lines = text.wrap(font, node.label, r * 1.6, maxLines + (r > 70 ? 1 : 0));
      }
      var lh = fs * 1.14;
      var cfs = half(clamp(fs * 0.66, 10, 16));
      var cfont = '400 ' + cfs + 'px ' + FONT;
      var count = countText(node);
      var showCount = r > 38 && text.width(cfont, count) < r * 1.45;
      var total = lines.length * lh + (showCount ? cfs * 1.45 : 0);
      var y0 = L.y - total / 2 + lh / 2;
      var fade = L.alpha * nameA;
      drawLines(lines, L.x, y0, lh, font, tc, fade, 'center');
      if (showCount) drawLines([count], L.x, y0 + (lines.length - 0.5) * lh + cfs * 0.95, 0, cfont, tc, fade * 0.86, 'center');
    }

    // ---------------------------------------------------------- treemap

    function tracePath(g) {
      ctx.beginPath();
      ctx.moveTo(g[0], g[1]);
      for (var i = 2; i < g.length; i += 2) ctx.lineTo(g[i], g[i + 1]);
      ctx.closePath();
    }

    function drawTreemap(t) {
      var items = currentItems(t);
      var busy = !!S.tween || colorProgress(t) < 1;
      var list = [];
      items.forEach(function (it) { list.push(it); });
      list.sort(function (a, b) { return (b.exiting ? 1 : 0) - (a.exiting ? 1 : 0) || a.level - b.level; });
      var stage = C.stage(S.dark);
      var keyed = kbdNode();
      var hits = [];
      var shown = [];
      // separators: the stage between cells, wider between topics than between subtopics
      var sep = clamp(Math.min(S.W, S.H) * 0.0045, 2, 3.2);
      list.forEach(function (it) {
        if (it.alpha < 0.01) return;
        var g = it.geom, bb = shapeBox(g);
        if (bb[2] < 0.5 || bb[3] < 0.5) return;
        if (bb[0] > S.W || bb[1] > S.H || bb[0] + bb[2] < 0 || bb[1] + bb[3] < 0) return;
        var fill = it.color;
        tracePath(g);
        if (bb[2] > 24 && bb[3] > 20) {
          var gr = ctx.createLinearGradient(bb[0], bb[1], bb[0] + bb[2] * 0.75, bb[1] + bb[3]);
          gr.addColorStop(0, C.css(C.topOf(fill, S.dark), it.alpha));
          gr.addColorStop(1, C.css(fill, it.alpha));
          ctx.fillStyle = gr;
        } else {
          ctx.fillStyle = C.css(fill, it.alpha);
        }
        ctx.fill();
        if (it.node.other && it.level === 1 && bb[2] > 10 && bb[3] > 10) {
          tracePath(g);
          hatch(bb[0], bb[1], bb[2], bb[3], (S.dark ? 0.16 : 0.12) * it.alpha);
        }
        if (it.node.status === 'pending' && it.level >= 1) {
          tracePath(g);
          shimmer(bb[0], bb[1], bb[2], bb[3], t);
          busy = true;
        }
        shown.push(it);
      });
      ctx.lineJoin = 'round';
      [2, 1].forEach(function (level) {
        shown.forEach(function (it) {
          if (it.level !== level) return;
          tracePath(it.geom);
          ctx.lineWidth = level === 1 ? sep : 1;
          ctx.strokeStyle = C.css(stage, (level === 1 ? 1 : S.dark ? 0.7 : 0.62) * it.alpha);
          ctx.stroke();
        });
      });
      shown.forEach(function (it) {
        var hovered = S.hover && S.hover.node === it.node && !it.exiting;
        if (it.level === 1 && (hovered || keyed === it.node)) {
          // an outline inside the cell, in its hue (dashed ink for the keyboard)
          ctx.save();
          tracePath(it.geom);
          ctx.clip();
          tracePath(it.geom);
          ctx.lineWidth = keyed === it.node ? 5 : 4.5;
          ctx.setLineDash(keyed === it.node ? [7, 5] : []);
          ctx.strokeStyle = keyed === it.node ? C.css(C.ink(S.dark), 0.85 * it.alpha) : C.css(C.edgeOf(it.color, S.dark), 0.95 * it.alpha);
          ctx.stroke();
          ctx.restore();
          ctx.setLineDash([]);
        }
        if (!it.exiting && it.alpha > 0.3 && it.level === 1) {
          hits.push({ kind: it.node.record != null ? 'record' : 'node', node: it.node, doc: it.node.record, test: shapeTest(it.geom) });
        }
      });
      shown.forEach(function (it) {
        if (it.level !== 1) return;
        var box = drawCellLabel(it);
        if (box && it.node.record == null && !it.nested && it.node.status !== 'ready') drawCellDots(it, box, t);
      });
      S.hits = hits;
      return busy;
    }

    /**
     * One dot per record in a topic's cell when it has no subtopics shown,
     * gathered at the bottom, clear of its name; worked out once per shape.
     */
    function drawCellDots(it, box, t) {
      var n = Math.min((it.node.docs || []).length, 400);
      if (!n) return;
      var g = it.geom, d = S.dots.get(g);
      if (!d) {
        // worked out at rest only: a shape on the move has a new outline every frame
        if (S.tween) return;
        d = { pts: [], r: 0 };
        var inf = shapeInfo(g), bb = shapeBox(g), test = shapeTest(g);
        var free = Math.max(1, inf.area - (box[2] - box[0]) * (box[3] - box[1]));
        var step = clamp(Math.sqrt(free * 0.42 / n), 5, 22);
        for (var tries = 0; tries < 5; tries++, step *= 0.82) {
          var pts = [], m = step * 0.9;
          for (var row = 0, y = bb[1] + bb[3] - m; y > bb[1] + m; y -= step * 0.866, row++) {
            for (var x = bb[0] + m + (row % 2 ? step / 2 : 0); x < bb[0] + bb[2] - m; x += step) {
              if (x > box[0] - m && x < box[2] + m && y > box[1] - m && y < box[3] + m) continue;
              if (!test(x, y) || inRadius(g, x, y) < m) continue;
              pts.push(x, y);
            }
          }
          if (pts.length / 2 >= n || step < 5.5) { d = { pts: pts.slice(0, 2 * n), r: step * 0.24 }; break; }
        }
        S.dots.set(g, d);
      }
      if (!d.pts.length || d.r < 1.2) return;
      var pending = it.node.status === 'pending';
      var a = it.alpha * (S.dark ? 0.34 : 0.26) * (pending ? 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t / 240)) : 1);
      ctx.beginPath();
      for (var i = 0; i < d.pts.length; i += 2) {
        ctx.moveTo(d.pts[i] + d.r, d.pts[i + 1]);
        ctx.arc(d.pts[i], d.pts[i + 1], d.r, 0, TAU);
      }
      ctx.fillStyle = C.css(C.textOn(it.color, S.dark), a);
      ctx.fill();
    }

    /**
     * A cell's name and count at its middle, as large as the cell allows and
     * kept inside it; a cell too small for a name shows its number of records.
     * Returns the box the text takes (or null).
     */
    function drawCellLabel(it) {
      var g = it.geom, node = it.node, a = it.alpha < 1 ? Math.pow(it.alpha, 2.5) : 1;
      if (a < 0.05) return null;
      var c = shapeInfo(g), cx = c.x, cy = c.y;
      var r = inRadius(g, cx, cy);
      if (r < 9) return null;
      var tc = C.textOn(it.color, S.dark);
      var halo = it.nested ? C.mix(C.topOf(it.color, S.dark), it.color, 0.6) : null;
      if (node.record != null) {
        if (r < 30) return null;
        // a record: its title, and under it the journal and year when there is room
        var fsR = half(clamp(r / 7, 10, 15));
        var fontR = '400 ' + fsR + 'px ' + FONT;
        var info = options.recordInfo ? options.recordInfo(node.record) : null;
        var linesR = text.wrap(fontR, info ? info.title : node.label, r * 1.62, r > 90 ? 6 : r > 60 ? 5 : r > 42 ? 4 : 3);
        var lhR = fsR * 1.2;
        var meta = r > 62 && info && info.meta ? info.meta : '';
        var mfs = half(Math.max(10, fsR * 0.78));
        var totalR = linesR.length * lhR + (meta ? mfs * 1.7 : 0);
        var y0R = cy - totalR / 2 + lhR / 2;
        var aR = a * smooth((r - 30) / 4);
        drawLines(linesR, cx, y0R, lhR, fontR, tc, aR, 'center');
        if (meta) drawLines([text.ellipsize('400 ' + mfs + 'px ' + FONT, meta, r * 1.5)], cx, y0R + (linesR.length - 0.5) * lhR + mfs * 1.1, 0, '400 ' + mfs + 'px ' + FONT, tc, aR * 0.75, 'center');
        return [cx - r, cy - totalR / 2, cx + r, cy + totalR / 2];
      }
      var moving = !!S.tween;
      // Too small for a name: the number of records; the two cross-fade while a cell grows or shrinks.
      var nameA = moving ? smooth((r - 22) / 3) : r >= 23.5 ? 1 : 0;
      var num = node.size.toLocaleString('en-US');
      if (nameA < 1) {
        var nfs = half(clamp(r * 0.62, 10, 16));
        drawLines([num], cx, cy + 0.5, 0, '600 ' + nfs + 'px ' + FONT, tc, a * (1 - nameA) * smooth((r - 9) / 3), 'center', halo);
        if (nameA <= 0) return [cx - nfs, cy - nfs, cx + nfs, cy + nfs];
      }
      var chord = chordAt(g, cy);
      var maxW = Math.max(r * 1.7, Math.min(chord - 20, r * 3.1));
      var maxLines = r > 100 ? 4 : r > 46 ? 3 : 2;
      var fs = half(clamp(r / 3.9, 11.5, 24));
      var font = '600 ' + fs + 'px ' + FONT;
      var lines = text.wrap(font, node.label, maxW, maxLines);
      // A long label gets a smaller size before it gets an ellipsis.
      if (lines.length && /…$/.test(lines[lines.length - 1]) && fs > 12) {
        fs = half(Math.max(11.5, fs * 0.84));
        font = '600 ' + fs + 'px ' + FONT;
        lines = text.wrap(font, node.label, maxW, maxLines + (r > 64 ? 1 : 0));
      }
      var lh = fs * 1.15;
      var cfs = half(clamp(fs * 0.66, 10, 15));
      var cfont = '400 ' + cfs + 'px ' + FONT;
      var count = countText(node);
      var showCount = r > 34 && text.width(cfont, count) < maxW;
      var total = lines.length * lh + (showCount ? cfs * 1.5 : 0);
      // the block's top and bottom lines must fit where the cell narrows
      var narrow = Math.min(chordAt(g, cy - total / 2 + 1), chordAt(g, cy + total / 2 - 1)) - 18;
      if (narrow < maxW && narrow > 36) {
        lines = text.wrap(font, node.label, narrow, maxLines);
        total = lines.length * lh + (showCount ? cfs * 1.5 : 0);
      }
      var y0 = cy - total / 2 + lh / 2;
      var fade = a * nameA;
      drawLines(lines, cx, y0, lh, font, tc, fade, 'center', halo);
      if (showCount) drawLines([count], cx, y0 + (lines.length - 0.5) * lh + cfs * 0.95, 0, cfont, tc, fade * 0.74, 'center', halo);
      var w = 0;
      lines.forEach(function (l) { w = Math.max(w, text.width(font, l)); });
      if (showCount) w = Math.max(w, text.width(cfont, count));
      return [cx - w / 2 - 6, cy - total / 2 - 5, cx + w / 2 + 6, cy + total / 2 + 5];
    }

    // ---------------------------------------------------------- radial

    function ringRadius(y, R) {
      var rings = S.rings;
      if (y <= 0) return 0;
      if (y >= rings.length - 1) return R;
      var i = Math.floor(y), f = y - i;
      return lerp(rings[i], rings[i + 1], f) * R;
    }

    function drawRadial(t) {
      var items = currentItems(t);
      var busy = !!S.tween || colorProgress(t) < 1;
      var cx = S.W / 2, cy = S.H / 2;
      var R = Math.max(40, Math.min(S.W, S.H) / 2 - 10);
      var list = [];
      items.forEach(function (it) { list.push(it); });
      list.sort(function (a, b) { return (b.exiting ? 1 : 0) - (a.exiting ? 1 : 0) || a.level - b.level; });
      var hits = [];
      var labels = [];
      var keyed = kbdNode();
      list.forEach(function (it) {
        var g = it.geom;
        var a0 = clamp(g[0], 0, TAU), a1 = clamp(g[1], 0, TAU);
        if (a1 - a0 < 1e-4 || it.alpha < 0.01) return;
        var r0 = ringRadius(Math.max(0, g[2]), R), r1 = ringRadius(Math.max(0, g[3]), R);
        if (r1 - r0 < 0.6) return;
        var full = a1 - a0 > TAU - 1e-6 && r0 < 0.5;
        var fill = it.color;
        var path = function () {
          ctx.beginPath();
          if (full) {
            ctx.arc(cx, cy, r1, 0, TAU);
            return;
          }
          var ri = r0 + (r0 > 0 ? 1 : 0), ro = r1 - 1;
          var po = Math.min(0.9 / Math.max(ro, 1), (a1 - a0) * 0.2), pi = ri > 1 ? Math.min(0.9 / ri, (a1 - a0) * 0.2) : 0;
          ctx.arc(cx, cy, ro, a0 - Math.PI / 2 + po, a1 - Math.PI / 2 - po);
          if (ri > 0) ctx.arc(cx, cy, ri, a1 - Math.PI / 2 - pi, a0 - Math.PI / 2 + pi, true);
          else ctx.lineTo(cx, cy);
          ctx.closePath();
        };
        path();
        if (!full && r1 - r0 > 12) {
          var gr = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
          gr.addColorStop(0, C.css(C.topOf(fill, S.dark), it.alpha));
          gr.addColorStop(1, C.css(fill, it.alpha));
          ctx.fillStyle = gr;
        } else {
          ctx.fillStyle = C.css(fill, it.alpha);
        }
        ctx.fill();
        if (it.node.other && !full) hatch(cx - r1, cy - r1, 2 * r1, 2 * r1, (S.dark ? 0.16 : 0.12) * it.alpha);
        var hovered = S.hover && S.hover.node === it.node && !it.exiting;
        if ((hovered || keyed === it.node) && !full) {
          path();
          ctx.lineWidth = keyed === it.node ? 2.5 : 2;
          ctx.setLineDash(keyed === it.node ? [6, 4] : []);
          ctx.strokeStyle = keyed === it.node ? C.css(C.ink(S.dark), 0.9) : C.css(C.edgeOf(fill, S.dark), 0.95);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (it.node.status === 'pending' && !full) busy = true;
        if (!it.exiting && it.alpha > 0.3) {
          if (it.level === 0) {
            if (it.node.parent) hits.push({ kind: 'up', node: it.node, test: polarTest(cx, cy, 0, r1, 0, TAU) });
          } else {
            hits.push({ kind: it.node.record != null ? 'record' : 'node', node: it.node, doc: it.node.record, test: polarTest(cx, cy, r0, r1, a0, a1) });
          }
        }
        labels.push({ it: it, a0: a0, a1: a1, r0: r0, r1: r1, full: full });
      });
      var focusItem = items.get(S.focus.id);
      if (S.focus.status === 'pending' && focusItem) {
        spinner(cx, cy, ringRadius(1, R) + 4, t, C.ink(S.dark));
        busy = true;
      }
      labels.forEach(function (L) { drawArcLabel(L, cx, cy); });
      S.hits = hits;
      return busy;
    }

    function polarTest(cx, cy, r0, r1, a0, a1) {
      return function (px, py) {
        var dx = px - cx, dy = py - cy;
        var r = Math.sqrt(dx * dx + dy * dy);
        if (r < r0 || r > r1) return false;
        var a = Math.atan2(dx, -dy);
        if (a < 0) a += TAU;
        return a >= a0 && a <= a1;
      };
    }

    function drawArcLabel(L, cx, cy) {
      var it = L.it, node = it.node;
      var tc = C.textOn(it.color, S.dark);
      if (L.full) {
        // The centre: the focus label.
        var r = L.r1;
        if (r < 30) return;
        var fs = half(clamp(r / 6.5, 11, 18));
        var font = '700 ' + fs + 'px ' + FONT;
        var lines = text.wrap(font, node.label, r * 1.55, r > 90 ? 4 : 3);
        var lh = fs * 1.16;
        var cfs = half(Math.max(10, fs * 0.74));
        var total = lines.length * lh + cfs * 1.4;
        var y0 = cy - total / 2 + lh / 2;
        var ink = C.textOn(it.color, S.dark);
        drawLines(lines, cx, y0, lh, font, ink, it.alpha);
        var sub = countText(node);
        if (node.parent && S.hover && S.hover.kind === 'up') sub = 'Zoom out';
        drawLines([sub], cx, y0 + lines.length * lh + cfs * 0.35, 0, '400 ' + cfs + 'px ' + FONT, ink, it.alpha * 0.85);
        return;
      }
      var thick = L.r1 - L.r0;
      var mid = (L.a0 + L.a1) / 2;
      var rm = (L.r0 + L.r1) / 2;
      var arcLen = (L.a1 - L.a0) * rm;
      var record = node.record != null;
      var fs2 = half(it.level === 1 && !record ? clamp(thick / 7.5, 10.5, 13.5) : clamp(thick / 7, 9.5, 12));
      if (arcLen < fs2 + 3 || thick < 26) return;
      var font2 = (it.level === 1 && !record ? '700 ' : '400 ') + fs2 + 'px ' + FONT;
      var label = text.ellipsize(font2, node.label, thick - 12);
      if (!label) return;
      var fade = it.alpha * smooth((arcLen - fs2 - 3) / 3);
      ctx.save();
      ctx.translate(cx, cy);
      var rot = mid - Math.PI / 2;
      ctx.rotate(rot);
      var flip = Math.cos(rot) < 0;
      if (flip) ctx.rotate(Math.PI);
      drawLines([label], flip ? -rm : rm, 0, 0, font2, tc, fade);
      ctx.restore();
    }

    // ---------------------------------------------------------- frame loop

    function frame() {
      S.raf = 0;
      if (!S.active || !S.root || !S.focus) return;
      var t = now();
      var stats = S.stats || (S.stats = { frames: 0, total: 0, max: 0 });
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      ctx.clearRect(0, 0, S.W, S.H);
      var fade = S.viewStart ? smooth((t - S.viewStart) / (S.snap ? 380 : 260)) : 1;
      if (fade >= 1) { S.viewStart = 0; S.snap = null; }
      if (S.snap && S.snap.width === canvas.width && S.snap.height === canvas.height) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1 - fade * fade;  // fades a little later, so the stage does not show through midway
        ctx.drawImage(S.snap, 0, 0);
        ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      }
      ctx.globalAlpha = fade;
      var busy;
      if (S.view === 'bubbles') busy = drawBubbles(t);
      else if (S.view === 'treemap') busy = drawTreemap(t);
      else busy = drawRadial(t);
      ctx.globalAlpha = 1;
      var spent = now() - t;
      stats.frames++;
      stats.total += spent;
      if (spent > stats.max) stats.max = spent;
      if (S.pendingUpdate && !S.tween) { api.update(); return; }
      if (S.pointer && !busy) updateHover(false);
      if (busy || fade < 1) invalidate();
    }

    function invalidate() {
      if (!S.raf && S.active) S.raf = global.requestAnimationFrame(frame);
    }

    // ---------------------------------------------------------- interaction

    function hitAt(x, y) {
      for (var i = S.hits.length - 1; i >= 0; i--) if (S.hits[i].test(x, y)) return S.hits[i];
      // In the bubbles, the space between them is the zoomed-into group: clicking it zooms out.
      if (S.view === 'bubbles' && S.focus && S.focus.parent && !S.camAnim) return { kind: 'up', node: S.focus };
      return null;
    }

    function sameHit(a, b) {
      if (!a || !b) return a === b;
      return a.kind === b.kind && a.node === b.node && a.doc === b.doc;
    }

    function updateHover(redraw) {
      if (!S.pointer) return;
      var h = hitAt(S.pointer.x, S.pointer.y);
      canvas.style.cursor = h ? (h.kind === 'up' ? 'zoom-out' : 'pointer') : 'default';
      if (!sameHit(h, S.hover)) {
        var t = now();
        if (S.hover && S.hover.node) {
          // Ease out from wherever the last hover had got to.
          var was = hoverValue(S.hover.node, t);
          S.unhover = { node: S.hover.node, at: t - (1 - was) * 160 };
        }
        S.hover = h;
        S.hoverAt = t;
        if (h) showTip(h, S.pointer.x, S.pointer.y); else hideTip();
        invalidate();
      } else if (h) {
        placeTip(S.pointer.x, S.pointer.y);
      }
    }

    function add(tag, cls, content) {
      var el = document.createElement(tag);
      if (cls) el.className = cls;
      el.textContent = content;
      tip.appendChild(el);
    }

    function showTip(h, x, y) {
      tip.textContent = '';
      if (h.kind === 'record') {
        var info = options.recordInfo ? options.recordInfo(h.doc) : null;
        add('strong', null, info ? info.title : 'Record');
        if (info && info.meta) add('span', 'meta', info.meta);
        add('span', 'hint', 'Click to show it in the list');
      } else if (h.kind === 'up') {
        var parent = S.focus && S.focus.parent;
        add('span', 'hint', parent ? 'Zoom out to ' + parent.label : 'Zoom out');
      } else {
        var n = h.node;
        add('strong', null, n.label);
        var share = S.focus && S.focus.size ? Math.round((100 * n.size) / S.focus.size) : null;
        var inFocus = n === S.focus || isAncestor(S.focus, n);
        add('span', 'meta', plural(n.size) + (share != null && inFocus && share < 100 ? ', ' + share + '% of ' + S.focus.label : ''));
        var kids = readyKids(n).filter(function (c) { return !c.other; });
        if (kids.length) {
          add('span', 'sub', 'Subtopics: ' + kids.slice(0, 4).map(function (c) { return c.label; }).join('; ') + (kids.length > 4 ? '; and ' + (kids.length - 4) + ' more' : ''));
        }
        var hint = n.status === 'leaf' ? 'Click to read its records'
          : n.status === 'ready' ? 'Click to zoom in'
          : 'Click to zoom in and find its subtopics';
        add('span', 'hint', hint);
      }
      tip.hidden = false;
      placeTip(x, y);
    }

    function placeTip(x, y) {
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var left = x + 16;
      if (left + w > S.W - 4) left = Math.max(4, x - 16 - w);
      var top = y + 18;
      if (top + h > S.H - 4) top = Math.max(4, y - 14 - h);
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }

    function hideTip() { tip.hidden = true; }

    function activate(h) {
      if (!h) return;
      hideTip();
      if (h.kind === 'record') { if (options.onRecord) options.onRecord(h.doc, h.owner || (h.node && h.node.parent)); return; }
      if (h.kind === 'up') { if (options.onUp) options.onUp(); return; }
      if (h.node && h.node !== S.focus && options.onFocus) options.onFocus(h.node);
    }

    canvas.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      S.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      updateHover(true);
    });
    canvas.addEventListener('pointerleave', function () {
      S.pointer = null;
      if (S.hover) {
        if (S.hover.node) S.unhover = { node: S.hover.node, at: now() };
        S.hover = null;
        invalidate();
      }
      hideTip();
      canvas.style.cursor = 'default';
    });
    canvas.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      S.kbd = -1;
      activate(hitAt(x, y));
    });

    // Keyboard: arrows walk the focused group's topics, Enter zooms in, Escape zooms out.
    function kbdList() {
      if (!S.focus) return [];
      var kids = readyKids(S.focus);
      if (kids.length) return displayOrder(kids);
      // the treemap shows a focus's records while its subtopics are being found, too
      if (S.focus.status === 'leaf' || (S.view === 'treemap' && S.focus.status !== 'ready')) return recordNodes(S.focus);
      return [];
    }

    function kbdNode() {
      if (S.kbd < 0) return null;
      var list = kbdList();
      return list[S.kbd] || null;
    }

    canvas.addEventListener('keydown', function (e) {
      var list = kbdList();
      var key = e.key;
      if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
        if (!list.length) return;
        e.preventDefault();
        if (key === 'Home') S.kbd = 0;
        else if (key === 'End') S.kbd = list.length - 1;
        else {
          var step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
          S.kbd = S.kbd < 0 ? (step > 0 ? 0 : list.length - 1) : (S.kbd + step + list.length) % list.length;
        }
        var n = list[S.kbd];
        live.textContent = (S.kbd + 1) + ' of ' + list.length + ': ' + n.label + ', ' + countText(n) + '.';
        invalidate();
      } else if (key === 'Enter' || key === ' ') {
        var target = list[S.kbd];
        if (!target) return;
        e.preventDefault();
        if (target.record != null) { if (options.onRecord) options.onRecord(target.record); }
        else if (options.onFocus) options.onFocus(target);
      } else if (key === 'Escape' || key === 'Backspace') {
        if (S.focus && S.focus.parent && options.onUp) {
          e.preventDefault();
          options.onUp();
        }
      }
    });

    // ---------------------------------------------------------- public API

    function refreshColors() {
      S.dark = C.isDark();
      if (S.root && S.view !== 'bubbles') {
        retarget(targetItems(S.focus), 0, null, null);
      }
    }

    var api = {
      /** A new tree (a new search or a new clustering). */
      setData: function (root, focus, opts) {
        opts = opts || {};
        S.root = root;
        S.focus = focus || root;
        S.prevFocus = null;
        S.colorStart = 0;
        S.packs = new WeakMap();
        S.cells = new WeakMap();
        S.veins = new WeakMap();
        S.dots = new WeakMap();
        S.hexes = new WeakMap();
        S.born = new WeakMap();
        S.grown = new WeakSet();
        S.records = new WeakMap();
        S.hover = null;
        S.unhover = null;
        S.kbd = -1;
        hideTip();
        S.dark = C.isDark();
        resize();
        var t = now();
        var animate = opts.animate && !reduced();
        noteBirths(root, animate ? t + 60 : 0, animate ? 34 : 0);
        S.cam = fitCam(S.focus);
        S.camAnim = null;
        S.items = new Map();
        S.tween = null;
        if (S.view !== 'bubbles') retarget(targetItems(S.focus), animate ? 900 : 0, null, animate ? introFrom : null);
        invalidate();
      },

      /** Zooms to another group. */
      setFocus: function (node, opts) {
        opts = opts || {};
        if (!node || !S.root || node === S.focus) return;
        var animate = opts.animate !== false && !reduced();
        var old = S.focus;
        S.prevFocus = old;
        S.focus = node;
        S.colorStart = animate ? now() : 0;
        S.kbd = -1;
        S.hover = null;
        S.unhover = null;
        hideTip();
        noteBirths(S.root, 0, 0);
        moveCamera(fitCam(node), old, node, animate && S.view === 'bubbles');
        if (S.view !== 'bubbles') {
          var cur = currentItems(now());
          var next = targetItems(node);
          var map = animate ? zoomMap(old, node, cur, next) : null;
          retarget(next, animate ? (map ? ZOOM_MS : FADE_MS) : 0, map, null);
        }
        live.textContent = node.label + ', ' + countText(node) + '.';
        invalidate();
      },

      /** Some groups gained subtopics (or finished trying): grow them in. */
      update: function () {
        if (!S.root) return;
        // In the treemap and radial map a zoom in progress finishes first; the new groups then fade in.
        if (S.view !== 'bubbles' && S.tween && S.tween.dur > FADE_MS) { S.pendingUpdate = true; invalidate(); return; }
        S.pendingUpdate = false;
        var t = now();
        noteBirths(S.root, reduced() ? 0 : t, 0);
        if (S.view !== 'bubbles') retarget(targetItems(S.focus), reduced() ? 0 : FADE_MS, null, null);
        invalidate();
      },

      setView: function (view) {
        var canvasView = view === 'bubbles' || view === 'treemap' || view === 'radial';
        var wasShown = S.active && !canvas.hidden && S.root && canvas.width > 0;
        S.active = canvasView;
        canvas.hidden = !canvasView;
        hideTip();
        if (!canvasView) return;
        var changed = S.view !== view;
        // From one canvas map to another, the old picture dissolves into the new one.
        S.snap = null;
        if (changed && wasShown && !reduced()) {
          try {
            var snap = document.createElement('canvas');
            snap.width = canvas.width;
            snap.height = canvas.height;
            snap.getContext('2d').drawImage(canvas, 0, 0);
            S.snap = snap;
          } catch (e) { S.snap = null; }
        }
        S.view = view;
        S.hover = null;
        S.kbd = -1;
        resize();
        if (S.root) {
          S.dark = C.isDark();
          if (view !== 'bubbles') { S.items = new Map(); S.tween = null; retarget(targetItems(S.focus), 0, null, null); }
          else { S.cam = fitCam(S.focus); S.camAnim = null; }
        }
        if (changed && !reduced()) S.viewStart = now();
        invalidate();
      },

      /** Size or theme changed. */
      refresh: function () {
        var resized = resize();
        refreshColors();
        if (resized && S.root) {
          if (S.view !== 'bubbles') { S.tween = null; retarget(targetItems(S.focus), 0, null, null); }
          S.cam = fitCam(S.focus);
          S.camAnim = null;
        }
        invalidate();
      },

      focusCanvas: function () { canvas.focus(); },
      /** Milliseconds until the current zoom or fade ends (0 when idle or hidden). */
      busyFor: function () { return S.active ? Math.max(0, S.animEnd - now()) : 0; },
      get view() { return S.view; },
      get size() { return { width: S.W, height: S.H }; },
      _state: S,
    };
    return api;
  }

  global.BroccoliViews = {
    create: create,
    packInRect: packInRect,
    hexGrid: hexGrid,
    squarify: squarify,
    voronoiTreemap: voronoiTreemap,
    zoomPath: zoomPath,
  };
})(typeof window !== 'undefined' ? window : this);
