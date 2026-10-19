/*
 * The page's map code (app/colors.js, app/views.js, app/florets.js): layouts,
 * zoom path and colours. These are browser scripts; the tests run where the
 * runner pages have loaded them.
 */
import { group, test, assert, assertEqual } from './harness.js';

group('maps');

const V = typeof window !== 'undefined' ? window.BroccoliViews : null;
const C = typeof window !== 'undefined' ? window.BroccoliColors : null;
const maps = (name, fn) => test(name, () => { if (V && C) fn(); });

maps('circle packing fills the rectangle without overlaps, areas proportional to the values', () => {
  const cases = [
    [[5], 800, 400], [[3, 2], 800, 400], [[9, 2], 1400, 700],
    [[40, 28, 27, 26, 23, 20, 16, 14, 13, 12, 11, 10, 9, 8, 8, 7, 7, 6, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 2, 2], 1400, 700],
    [Array.from({ length: 44 }, (_, i) => 1 + ((i * 37) % 11)), 390, 520],
    [[12, 12, 11, 10, 8, 6, 6, 4, 4], 844, 330],
  ];
  for (const [values, w, h] of cases) {
    const gap = 6, pad = 12;
    const cs = V.packInRect(values, w, h, { gap, pad });
    assertEqual(cs.length, values.length);
    let area = 0;
    cs.forEach((c, i) => {
      area += Math.PI * c.r * c.r;
      assert(c.x - c.r >= pad - 0.5 && c.y - c.r >= pad - 0.5 && c.x + c.r <= w - pad + 0.5 && c.y + c.r <= h - pad + 0.5, 'inside: ' + JSON.stringify(c));
      for (let j = i + 1; j < cs.length; j++) {
        const d = cs[j];
        assert(Math.hypot(c.x - d.x, c.y - d.y) >= c.r + d.r + gap - 0.5, 'overlap ' + i + ',' + j);
      }
      // Areas follow the values (radii in proportion to their square roots).
      const k = cs[0].r / Math.sqrt(values[0]);
      assert(Math.abs(c.r / Math.sqrt(values[i]) - k) < k * 1e-6, 'radius of ' + i);
    });
    if (values.length > 3) assert(area / (w * h) > 0.45, 'fills the stage: ' + (area / (w * h)).toFixed(3));
  }
});

maps('equal circles for records sit on a hexagonal grid inside the rectangle', () => {
  for (const [n, w, h] of [[1, 400, 300], [7, 1400, 700], [37, 1400, 700], [600, 390, 470]]) {
    const cs = V.hexGrid(n, w, h, 10, 4);
    assertEqual(cs.length, n);
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      assert(c.x - c.r >= 10 - 1e-6 && c.x + c.r <= w - 10 + 1e-6 && c.y - c.r >= 10 - 1e-6 && c.y + c.r <= h - 10 + 1e-6, 'inside');
      for (let j = i + 1; j < Math.min(n, i + 80); j++) assert(Math.hypot(c.x - cs[j].x, c.y - cs[j].y) >= 2 * c.r + 4 - 1e-6, 'apart ' + i + ',' + j);
    }
  }
});

maps('squarified treemap fills its rectangle exactly with reasonable shapes', () => {
  const values = [40, 25, 12, 9, 6, 4, 2, 1, 1];
  const rects = V.squarify(values, 10, 20, 600, 400);
  const total = values.reduce((s, v) => s + v, 0);
  let area = 0;
  rects.forEach((r, i) => {
    area += r.w * r.h;
    assert(Math.abs((r.w * r.h) / (600 * 400) - values[i] / total) < 1e-9, 'area of ' + i);
    assert(r.x >= 10 - 1e-9 && r.y >= 20 - 1e-9 && r.x + r.w <= 610 + 1e-6 && r.y + r.h <= 420 + 1e-6, 'inside ' + i);
  });
  assert(Math.abs(area - 600 * 400) < 1e-6);
  const worst = Math.max(...rects.slice(0, 5).map((r) => Math.max(r.w / r.h, r.h / r.w)));
  assert(worst < 3, 'aspect ' + worst);
});

maps('the smooth zoom path starts and ends at the requested views', () => {
  for (const [a, b] of [[[0, 0, 100], [50, 20, 10]], [[5, 5, 40], [5, 5, 400]], [[0, 0, 10], [30, -40, 10]]]) {
    const path = V.zoomPath(a, b);
    path.at(0).forEach((v, i) => assert(Math.abs(v - a[i]) < 1e-9, 'start'));
    path.at(1).forEach((v, i) => assert(Math.abs(v - b[i]) < 1e-6, 'end ' + path.at(1)));
    assert(path.length > 0);
  }
});

function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function isConvex(poly) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[(i + 2) % poly.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-7) continue;
    if (!sign) sign = Math.sign(cr); else if (Math.sign(cr) !== sign) return false;
  }
  return true;
}

maps('organic treemap: convex cells tile the stage, each with its share of the area', () => {
  const W = 600, H = 400;
  const box = [[10, 20], [10 + W, 20], [10 + W, 20 + H], [10, 20 + H]];
  for (const values of [[40, 25, 12, 9, 6, 4, 2, 1, 1], [5, 5], [21, 17, 15, 13, 11, 9, 8, 7, 6, 5, 4, 3, 3, 2, 2, 1]]) {
    const cells = V.voronoiTreemap(values, box, null, true);
    assert(cells && cells.length === values.length, 'one cell per value');
    const total = values.reduce((s, v) => s + v, 0);
    let sum = 0;
    cells.forEach((poly, i) => {
      const a = Math.abs(polyArea(poly));
      sum += a;
      const share = values[i] / total;
      assert(Math.abs(a / (W * H) - share) / share < 0.01, 'area of ' + i + ': ' + (a / (W * H)).toFixed(4) + ' for ' + share.toFixed(4));
      assert(isConvex(poly), 'cell ' + i + ' is convex');
      poly.forEach(([x, y]) => assert(x >= 10 - 1e-6 && x <= 10 + W + 1e-6 && y >= 20 - 1e-6 && y <= 20 + H + 1e-6, 'inside'));
    });
    assert(Math.abs(sum - W * H) < 0.5, 'the cells cover the stage: ' + sum.toFixed(2));
  }
  // The same values give the same map.
  const a = JSON.stringify(V.voronoiTreemap([8, 5, 3, 2], box, null, true));
  assertEqual(JSON.stringify(V.voronoiTreemap([8, 5, 3, 2], box, null, true)), a);
});

maps('organic treemap: subtopics divide their topic\'s cell', () => {
  // a hexagon, as a topic's cell might be
  const hex = Array.from({ length: 6 }, (_, k) => [300 + 160 * Math.cos(k * Math.PI / 3), 200 + 140 * Math.sin(k * Math.PI / 3)]);
  const values = [6, 4, 3, 2, 1];
  const cells = V.voronoiTreemap(values, hex, null, false);
  assert(cells && cells.length === values.length, 'one cell per subtopic');
  const whole = Math.abs(polyArea(hex));
  const total = values.reduce((s, v) => s + v, 0);
  let sum = 0;
  cells.forEach((poly, i) => {
    const a = Math.abs(polyArea(poly));
    sum += a;
    assert(Math.abs(a / whole - values[i] / total) / (values[i] / total) < 0.01, 'area of ' + i);
    assert(isConvex(poly), 'cell ' + i + ' is convex');
  });
  assert(Math.abs(sum - whole) < 0.5, 'the subtopics fill the cell');
});

maps('florets: one floret per topic and one bud per record', () => {
  const F = typeof window !== 'undefined' ? window.BroccoliFlorets : null;
  if (!F) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svg);
  const clusters = [
    { id: 0, label: 'Senolytic Drugs', size: 9, documents: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
    { id: 1, label: 'Telomere Length', size: 5, documents: [9, 10, 11, 12, 13] },
    { id: 2, label: 'Caloric Restriction', size: 3, documents: [2, 14, 15] },
    { id: 3, label: 'Other topics', size: 4, documents: [16, 17, 18, 19], other: true },
  ];
  F.render(svg, { clusters, selected: 0, width: 900, height: 520, animate: false, colorOf: () => ({ fill: '#5b90d2', stroke: '#476fa3', ray: '#a9c4e6' }) });
  assertEqual(svg.querySelectorAll('.floret').length, 3, 'florets (Other is left out)');
  assertEqual(svg.querySelectorAll('.bud').length, 17, 'buds');
  // the selected topic's records are marked where other florets share them
  assert(svg.querySelectorAll('.bud.shared').length >= 1, 'shared buds');
  svg.remove();
});

maps('topic colours: fills and marks in a fixed order, variants below them, grey for "Other"', () => {
  const root = { depth: 0, parent: null, index: 0 };
  const kids = Array.from({ length: 10 }, (_, i) => ({ depth: 1, parent: root, index: i }));
  const other = { depth: 1, parent: root, index: 10, other: true };
  for (const dark of [false, true]) {
    const mode = dark ? 'dark' : 'light';
    const fills = kids.map((k) => C.hex(C.relative(k, root, dark)));
    assertEqual(new Set(fills).size, fills.length, 'sibling fills differ');
    assertEqual(fills[0], C.PALETTE[mode].fill[0]);
    const marks = kids.map((k) => C.hex(C.markOf(k, dark)));
    assertEqual(new Set(marks).size, marks.length, 'sibling marks differ');
    assertEqual(marks[0], C.PALETTE[mode].mark[0]);
    assertEqual(C.hex(C.relative(other, root, dark)), C.OTHER[mode].fill);
    assertEqual(C.hex(C.markOf(other, dark)), C.OTHER[mode].mark);
    const grand = { depth: 2, parent: kids[2], index: 0 };
    assert(C.hex(C.relative(grand, root, dark)) !== C.hex(C.relative(kids[2], root, dark)), 'a subtopic is a variant of its topic');
    // Names read at 4.5:1 or better on every fill and on the light end of its gradient.
    fills.forEach((h) => {
      const f = C.rgb(h), ink = C.textOn(f, dark);
      assert(C.contrast(f, ink) >= 4.5, 'label contrast on ' + h);
      assert(C.contrast(C.topOf(f, dark), ink) >= 4.5, 'label contrast on the top of ' + h);
    });
    // The eight base marks stand out from the stage at 3:1, for small marks without labels.
    C.PALETTE[mode].mark.forEach((h) => assert(C.contrast(C.rgb(h), C.stage(dark)) >= 3, 'mark contrast of ' + h));
  }
});
