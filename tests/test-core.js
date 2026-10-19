import D from './target.js';
import { group, test, assert, assertEqual, assertDeepEqual, assertClose } from './harness.js';

group('suffix arrays, sets, random');

function naiveSuffixArray(s) {
  const idx = s.map((_, i) => i);
  idx.sort((a, b) => {
    let i = a, j = b;
    while (i < s.length && j < s.length) {
      if (s[i] !== s[j]) return s[i] - s[j];
      i++; j++;
    }
    return (s.length - i) - (s.length - j);
  });
  return idx;
}

test('suffix array and LCP match a naive implementation', () => {
  const rnd = D.createRandom(42);
  for (let trial = 0; trial < 400; trial++) {
    const n = 1 + rnd.int(trial < 300 ? 30 : 300);
    const K = 1 + rnd.int(trial % 3 === 0 ? 2 : 20);
    const s = Array.from({ length: n }, () => rnd.int(K));
    const sa = Array.from(D.suffixArray(s, K));
    assertEqual(sa.join(','), naiveSuffixArray(s).join(','), 'SA of ' + s.join(' '));
    const lcp = D.lcpArray(s, Int32Array.from(sa));
    for (let i = 1; i < n; i++) {
      let h = 0;
      while (sa[i] + h < n && sa[i - 1] + h < n && s[sa[i] + h] === s[sa[i - 1] + h]) h++;
      assertEqual(lcp[i], h, 'LCP at ' + i);
    }
  }
});

test('LCP intervals enumerate repeated substrings with parents', () => {
  const s = [1, 2, 1, 2, 0, 1, 2, 3];
  const sa = D.suffixArray(s, 4);
  const lcp = D.lcpArray(s, sa);
  const out = [];
  D.forEachLcpInterval(lcp, 1, (v, lb, rb, parent) => out.push([v, rb - lb + 1, parent]));
  // "1 2" occurs 3 times (lcp 2), "2" occurs 3 times (lcp 1).
  assertDeepEqual(out.sort(), [[1, 3, 0], [2, 3, 0]]);
});

test('BitSet operations', () => {
  const a = D.BitSet.fromIndices(70, [0, 5, 31, 32, 69]);
  const b = D.BitSet.fromIndices(70, [5, 32, 40]);
  assertEqual(a.cardinality(), 5);
  assertEqual(a.intersectionCount(b), 2);
  assertDeepEqual(a.clone().and(b).toArray(), [5, 32]);
  assertDeepEqual(a.clone().or(b).toArray(), [0, 5, 31, 32, 40, 69]);
  assertDeepEqual(a.clone().andNot(b).toArray(), [0, 31, 69]);
  assert(a.get(31) && !a.get(30) && !a.get(1000));
});

test('seeded random generator is deterministic', () => {
  const r1 = D.createRandom(7), r2 = D.createRandom(7);
  for (let i = 0; i < 100; i++) assertEqual(r1(), r2());
  const g = D.createRandom(1);
  let sum = 0;
  for (let i = 0; i < 2000; i++) sum += g.gaussian();
  assert(Math.abs(sum / 2000) < 0.1, 'gaussian mean');
});

group('matrices and factorizations');

function randomSparse(m, n, density, seed) {
  const rnd = D.createRandom(seed);
  const cols = [];
  for (let j = 0; j < n; j++) {
    const c = new Map();
    for (let i = 0; i < m; i++) if (rnd() < density) c.set(i, rnd());
    if (c.size === 0) c.set(rnd.int(m), 1);
    cols.push(c);
  }
  return D.SparseMatrix.fromColumns(m, cols).normalizeColumns();
}

test('symmetric eigendecomposition: A v = λ v, orthonormal vectors, sorted values', () => {
  const rnd = D.createRandom(3);
  const n = 30;
  const B = new D.DenseMatrix(n, n);
  for (let i = 0; i < n * n; i++) B.data[i] = rnd.gaussian();
  const A = B.transposeMultiply(B);
  const { values, vectors } = D.symmetricEigen(A);
  for (let j = 0; j < n; j++) {
    if (j > 0) assert(values[j] <= values[j - 1] + 1e-9, 'sorted');
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += A.get(i, k) * vectors.get(k, j);
      assertClose(s, values[j] * vectors.get(i, j), 1e-8);
    }
  }
  for (let p = 0; p < n; p++) {
    for (let q = 0; q <= p; q++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += vectors.get(k, p) * vectors.get(k, q);
      assertClose(s, p === q ? 1 : 0, 1e-9);
    }
  }
});

test('partial SVD: Gram path and Lanczos path agree', () => {
  for (const [m, n] of [[60, 90], [140, 70], [400, 500]]) {
    const A = randomSparse(m, n, 0.06, m + n);
    const exact = D.partialSvd(A, 8, { gramLimit: 100000 });
    const lanczos = D.partialSvd(A, 8, { gramLimit: 1 });
    for (let j = 0; j < 8; j++) {
      assertClose(lanczos.values[j], exact.values[j], 1e-6, 'sigma ' + j + ' of ' + m + 'x' + n);
      let c = 0;
      for (let i = 0; i < m; i++) c += exact.U.get(i, j) * lanczos.U.get(i, j);
      assert(Math.abs(c) > 0.999, 'vector ' + j + ' cosine ' + c);
    }
  }
});

test('non-negative factorizations return unit, non-negative base vectors', () => {
  const A = randomSparse(80, 60, 0.1, 5);
  for (const method of ['nmf-ed', 'nmf-kl', 'lnmf', 'kmeans']) {
    for (const init of ['nndsvd', 'random']) {
      const { U } = D.factorize(A, 6, method, { quality: 'low', init });
      assert(U.cols > 0 && U.cols <= 6, method + ' columns');
      for (let j = 0; j < U.cols; j++) {
        assertClose(U.columnNorm(j), 1, 1e-9, method + ' norm');
        for (let i = 0; i < U.rows; i++) assert(U.get(i, j) >= -1e-12, method + ' non-negative');
      }
    }
  }
});

test('NMF reduces the reconstruction error', () => {
  const A = randomSparse(50, 40, 0.15, 9);
  const dense = A.toDense();
  const err = (iterations) => {
    const out = D.nmfEuclidean(A, 5, { iterations, init: 'random' });
    // Fit V by least squares-free proxy: residual of projecting A on span(U).
    const U = out.U;
    let e = 0;
    for (let j = 0; j < A.cols; j++) {
      const a = dense.column(j);
      const proj = new Float64Array(U.rows);
      for (let t = 0; t < U.cols; t++) {
        let c = 0;
        for (let i = 0; i < U.rows; i++) c += a[i] * U.get(i, t);
        for (let i = 0; i < U.rows; i++) proj[i] += c * U.get(i, t);
      }
      for (let i = 0; i < U.rows; i++) e += (a[i] - proj[i]) ** 2;
    }
    return e;
  };
  assert(err(60) < err(1), 'more iterations should fit better');
});

test('spherical k-means separates two obvious groups', () => {
  const cols = [];
  for (let j = 0; j < 20; j++) cols.push(j < 10 ? [[0, 1], [1, 0.9]] : [[2, 1], [3, 0.8]]);
  const A = D.SparseMatrix.fromColumns(4, cols).normalizeColumns();
  const { assignment } = D.sphericalKMeans(A, 2, { seed: 1 });
  for (let j = 1; j < 10; j++) assertEqual(assignment[j], assignment[0]);
  for (let j = 11; j < 20; j++) assertEqual(assignment[j], assignment[10]);
  assert(assignment[0] !== assignment[10]);
});
