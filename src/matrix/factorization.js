/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Matrix factorizations used to find "base vectors" (abstract concepts) in
 * a term-document matrix A (terms × documents, sparse):
 *
 *  - partial SVD          (the eigenproblem of the smaller Gram matrix, solved
 *                          densely, or by Lanczos with full reorthogonalization
 *                          for large matrices)
 *  - NMF, Euclidean       (Lee & Seung 2001, multiplicative updates)
 *  - NMF, KL divergence   (Lee & Seung 2001)
 *  - Local NMF            (Li, Hou, Zhang & Cheng 2001)
 *  - k-means              (spherical k-means; centroids are the base vectors)
 *
 * Every method returns { U, values } where U is a DenseMatrix (terms × k)
 * with unit-length columns ordered from the most to the least important
 * concept, and `values` measures each concept's importance.
 */

import { DenseMatrix } from './matrix.js';
import { symmetricEigen, tridiagonalEigen } from './eigen.js';
import { createRandom } from '../util/random.js';

export const FACTORIZATION_ITERATIONS = Object.freeze({ low: 15, medium: 30, high: 50 });
const EPS = 1e-9;

/** Flips each column so that its largest-magnitude entry is positive, then normalizes. */
function orientAndNormalize(U) {
  const { rows, cols, data } = U;
  for (let j = 0; j < cols; j++) {
    let best = 0, norm = 0;
    for (let i = 0; i < rows; i++) {
      const v = data[i * cols + j];
      norm += v * v;
      if (Math.abs(v) > Math.abs(best)) best = v;
    }
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const s = (best < 0 ? -1 : 1) / norm;
    for (let i = 0; i < rows; i++) data[i * cols + j] *= s;
  }
  return U;
}

/**
 * Top-k eigenpairs of a symmetric positive semi-definite operator by the
 * Lanczos process with full reorthogonalization (restarting on breakdown).
 * apply(x: Float64Array) → Float64Array. Returns { values, vectors } with
 * vectors as a DenseMatrix (dim × k).
 */
export function lanczos(apply, dim, k, steps, seed) {
  const rnd = createRandom(seed || 0x1a2c05);
  const J = Math.max(1, Math.min(dim, steps));
  const Q = [];
  const alpha = new Float64Array(J);
  const beta = new Float64Array(J);
  const dot = (a, b) => { let s = 0; for (let i = 0; i < dim; i++) s += a[i] * b[i]; return s; };
  const randomOrthogonal = () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const v = new Float64Array(dim);
      for (let i = 0; i < dim; i++) v[i] = rnd.gaussian();
      for (let pass = 0; pass < 2; pass++) {
        for (const q of Q) { const c = dot(v, q); for (let i = 0; i < dim; i++) v[i] -= c * q[i]; }
      }
      const nrm = Math.sqrt(dot(v, v));
      if (nrm > 1e-8) { for (let i = 0; i < dim; i++) v[i] /= nrm; return v; }
    }
    return null;
  };
  let q = randomOrthogonal();
  let prev = null;
  let b = 0;
  let used = 0;
  for (let j = 0; j < J && q; j++) {
    Q.push(q);
    used = j + 1;
    const w = apply(q);
    const a = dot(w, q);
    alpha[j] = a;
    for (let i = 0; i < dim; i++) w[i] -= a * q[i] + (prev ? b * prev[i] : 0);
    for (let pass = 0; pass < 2; pass++) {
      for (const v of Q) { const c = dot(w, v); for (let i = 0; i < dim; i++) w[i] -= c * v[i]; }
    }
    b = Math.sqrt(dot(w, w));
    if (j === J - 1) break;
    if (b < 1e-10) {
      // Invariant subspace: continue in a fresh direction (T becomes block diagonal).
      beta[j] = 0;
      prev = null;
      b = 0;
      q = randomOrthogonal();
    } else {
      beta[j] = b;
      prev = q;
      q = new Float64Array(dim);
      for (let i = 0; i < dim; i++) q[i] = w[i] / b;
    }
  }
  const { values, vectors } = tridiagonalEigen(alpha.subarray(0, used), beta.subarray(0, Math.max(0, used - 1)));
  const kk = Math.min(k, used);
  // Residual bound of each Ritz pair: |b_last · last component of its eigenvector|.
  let maxResidual = 0;
  for (let t = 0; t < kk; t++) {
    maxResidual = Math.max(maxResidual, Math.abs(b * vectors.data[(used - 1) * used + t]));
  }
  const X = new DenseMatrix(dim, kk);
  for (let t = 0; t < kk; t++) {
    for (let j = 0; j < used; j++) {
      const s = vectors.data[j * used + t];
      if (s === 0) continue;
      const qj = Q[j];
      for (let i = 0; i < dim; i++) X.data[i * kk + t] += s * qj[i];
    }
  }
  return { values: values.slice(0, kk), vectors: X, residual: maxResidual, steps: used };
}

/** Leading k left singular vectors of A. */
export function partialSvd(A, k, options = {}) {
  const m = A.rows, n = A.cols;
  const d = Math.min(m, n);
  k = Math.max(0, Math.min(k, d));
  if (k === 0) return { U: new DenseMatrix(m, 0), values: new Float64Array(0) };

  let U, sigma;
  const gramLimit = options.gramLimit || 160;
  if (d <= gramLimit || d <= 2 * k + 20) {
    if (m <= n) {
      const { values, vectors } = symmetricEigen(A.gramRows());
      U = vectors.leftColumns(k);
      sigma = values.slice(0, k).map((v) => Math.sqrt(Math.max(0, v)));
    } else {
      const { values, vectors } = symmetricEigen(A.gramColumns());
      const V = vectors.leftColumns(k);
      U = A.multiplyDense(V);
      sigma = values.slice(0, k).map((v) => Math.sqrt(Math.max(0, v)));
    }
  } else {
    // Lanczos with full reorthogonalization on the smaller Gram operator,
    // doubling the Krylov dimension until the Ritz residuals are small.
    const apply = m <= n
      ? (x) => A.multiplyVector(A.transposeMultiplyVector(x))
      : (x) => A.transposeMultiplyVector(A.multiplyVector(x));
    let steps = Math.min(d, options.lanczosSteps || 4 * k + 40);
    let result;
    for (let round = 0; round < 4; round++) {
      result = lanczos(apply, d, k, steps, options.seed);
      const scale = Math.max(result.values[0] || 0, 1e-300);
      if (options.lanczosSteps || result.residual <= 1e-8 * scale || steps >= d) break;
      steps = Math.min(d, steps * 2);
    }
    U = m <= n ? result.vectors : A.multiplyDense(result.vectors);
    sigma = result.values.map((v) => Math.sqrt(Math.max(0, v)));
  }

  // Drop numerically null directions: they carry no concept.
  const tol = (sigma[0] || 0) * 1e-7;
  let rank = 0;
  while (rank < sigma.length && sigma[rank] > tol && sigma[rank] > 1e-12) rank++;
  if (rank < k) {
    U = U.leftColumns(rank);
    sigma = sigma.slice(0, rank);
  }
  return { U: orientAndNormalize(U), values: Float64Array.from(sigma) };
}

function randomNonNegative(rows, cols, rnd) {
  const M = new DenseMatrix(rows, cols);
  for (let i = 0; i < M.data.length; i++) M.data[i] = rnd() + EPS;
  return M;
}

/**
 * Starting point for the NMF iterations. "nndsvd" is the non-negative
 * double SVD of Boutsidis & Gallopoulos (2008), variant "a" (zeros filled
 * with the mean of A): deterministic and much closer to a good solution
 * than random factors. "random" draws uniform factors.
 */
function initialFactors(A, k, rnd, init) {
  if (init !== 'random') {
    const { U: Us, values } = partialSvd(A, k);
    const ks = Us.cols;
    if (ks > 0) {
      const m = A.rows, n = A.cols;
      const Vs = A.transposeMultiplyDense(Us); // columns are sigma_j * v_j
      let total = 0;
      for (let p = 0; p < A.values.length; p++) total += A.values[p];
      const fill = Math.max(total / (m * n), EPS);
      const U = new DenseMatrix(m, k);
      const V = new DenseMatrix(n, k);
      for (let j = 0; j < ks; j++) {
        const sigma = values[j];
        let xp = 0, xn = 0, yp = 0, yn = 0;
        for (let i = 0; i < m; i++) {
          const x = Us.data[i * ks + j];
          if (x > 0) xp += x * x; else xn += x * x;
        }
        for (let i = 0; i < n; i++) {
          const y = Vs.data[i * ks + j] / (sigma || 1);
          if (y > 0) yp += y * y; else yn += y * y;
        }
        xp = Math.sqrt(xp); xn = Math.sqrt(xn); yp = Math.sqrt(yp); yn = Math.sqrt(yn);
        const positive = j === 0 || xp * yp >= xn * yn;
        const nu = positive ? xp : xn, nv = positive ? yp : yn;
        const scale = Math.sqrt(sigma * (j === 0 ? 1 : nu * nv));
        const sign = positive ? 1 : -1;
        for (let i = 0; i < m; i++) {
          const x = sign * Us.data[i * ks + j];
          U.data[i * k + j] = x > 0 ? (scale * x) / (j === 0 ? 1 : nu || 1) : fill;
        }
        for (let i = 0; i < n; i++) {
          const y = (sign * Vs.data[i * ks + j]) / (sigma || 1);
          V.data[i * k + j] = y > 0 ? (scale * y) / (j === 0 ? 1 : nv || 1) : fill;
        }
      }
      for (let j = ks; j < k; j++) {
        for (let i = 0; i < m; i++) U.data[i * k + j] = rnd() * fill + EPS;
        for (let i = 0; i < n; i++) V.data[i * k + j] = rnd() * fill + EPS;
      }
      return { U, V };
    }
  }
  return { U: randomNonNegative(A.rows, k, rnd), V: randomNonNegative(A.cols, k, rnd) };
}

/** Orders components by ||U_j|| · ||V_j|| (their share of the reconstruction). */
function orderComponents(U, V) {
  const k = U.cols;
  const weight = new Float64Array(k);
  for (let j = 0; j < k; j++) weight[j] = U.columnNorm(j) * V.columnNorm(j);
  const order = Array.from({ length: k }, (_, j) => j).sort((a, b) => weight[b] - weight[a]);
  const Uo = orientAndNormalize(U.selectColumns(order));
  return { U: Uo, values: Float64Array.from(order.map((j) => weight[j])) };
}

/** R = A ./ (U V^T), evaluated only at the non-zeros of A (same sparsity pattern). */
function ratioMatrix(A, U, V) {
  const k = U.cols;
  const ratio = new Float64Array(A.values.length);
  for (let j = 0; j < A.cols; j++) {
    const vj = j * k;
    for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) {
      const ui = A.rowIndex[p] * k;
      let s = 0;
      for (let t = 0; t < k; t++) s += U.data[ui + t] * V.data[vj + t];
      ratio[p] = A.values[p] / (s + EPS);
    }
  }
  return { rows: A.rows, cols: A.cols, colPtr: A.colPtr, rowIndex: A.rowIndex, values: ratio };
}

/** S (sparse, A's pattern) times B (n × k). */
function sparseTimes(S, B) {
  const k = B.cols;
  const out = new DenseMatrix(S.rows, k);
  for (let j = 0; j < S.cols; j++) {
    const bj = j * k;
    for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) {
      const v = S.values[p], oi = S.rowIndex[p] * k;
      for (let t = 0; t < k; t++) out.data[oi + t] += v * B.data[bj + t];
    }
  }
  return out;
}

/** S^T times B (m × k). */
function sparseTransposeTimes(S, B) {
  const k = B.cols;
  const out = new DenseMatrix(S.cols, k);
  for (let j = 0; j < S.cols; j++) {
    const oj = j * k;
    for (let p = S.colPtr[j]; p < S.colPtr[j + 1]; p++) {
      const v = S.values[p], bi = S.rowIndex[p] * k;
      for (let t = 0; t < k; t++) out.data[oj + t] += v * B.data[bi + t];
    }
  }
  return out;
}

function columnSums(M) {
  const s = new Float64Array(M.cols);
  for (let i = 0; i < M.rows; i++) for (let j = 0; j < M.cols; j++) s[j] += M.data[i * M.cols + j];
  return s;
}

/** Non-negative matrix factorization minimizing the Euclidean distance. */
export function nmfEuclidean(A, k, options = {}) {
  k = Math.max(0, Math.min(k, A.rows, A.cols));
  const rnd = createRandom(options.seed || 0x5eed);
  const iterations = options.iterations || FACTORIZATION_ITERATIONS.high;
  const { U, V } = initialFactors(A, k, rnd, options.init);
  for (let it = 0; it < iterations; it++) {
    const AV = A.multiplyDense(V);
    const UVtV = U.multiply(V.gram());
    for (let i = 0; i < U.data.length; i++) U.data[i] *= AV.data[i] / (UVtV.data[i] + EPS);
    const AtU = A.transposeMultiplyDense(U);
    const VUtU = V.multiply(U.gram());
    for (let i = 0; i < V.data.length; i++) V.data[i] *= AtU.data[i] / (VUtU.data[i] + EPS);
  }
  return orderComponents(U, V);
}

/** Non-negative matrix factorization minimizing the Kullback–Leibler divergence. */
export function nmfKullbackLeibler(A, k, options = {}) {
  k = Math.max(0, Math.min(k, A.rows, A.cols));
  const rnd = createRandom(options.seed || 0x5eed);
  const iterations = options.iterations || FACTORIZATION_ITERATIONS.high;
  const { U, V } = initialFactors(A, k, rnd, options.init);
  for (let it = 0; it < iterations; it++) {
    let R = ratioMatrix(A, U, V);
    const numU = sparseTimes(R, V);
    const sumV = columnSums(V);
    for (let i = 0; i < U.rows; i++) {
      for (let t = 0; t < k; t++) U.data[i * k + t] *= numU.data[i * k + t] / (sumV[t] + EPS);
    }
    R = ratioMatrix(A, U, V);
    const numV = sparseTransposeTimes(R, U);
    const sumU = columnSums(U);
    for (let j = 0; j < V.rows; j++) {
      for (let t = 0; t < k; t++) V.data[j * k + t] *= numV.data[j * k + t] / (sumU[t] + EPS);
    }
  }
  return orderComponents(U, V);
}

/** Local non-negative matrix factorization (spatially localized parts). */
export function localNmf(A, k, options = {}) {
  k = Math.max(0, Math.min(k, A.rows, A.cols));
  const rnd = createRandom(options.seed || 0x5eed);
  const iterations = options.iterations || FACTORIZATION_ITERATIONS.high;
  const { U, V } = initialFactors(A, k, rnd, options.init);
  for (let it = 0; it < iterations; it++) {
    let R = ratioMatrix(A, U, V);
    const numV = sparseTransposeTimes(R, U);
    for (let i = 0; i < V.data.length; i++) V.data[i] = Math.sqrt(V.data[i] * numV.data[i]) + EPS;
    R = ratioMatrix(A, U, V);
    const numU = sparseTimes(R, V);
    const sumV = columnSums(V);
    for (let i = 0; i < U.rows; i++) {
      for (let t = 0; t < k; t++) U.data[i * k + t] *= numU.data[i * k + t] / (sumV[t] + EPS);
    }
    const sumU = columnSums(U);
    for (let i = 0; i < U.rows; i++) {
      for (let t = 0; t < k; t++) U.data[i * k + t] /= sumU[t] + EPS;
    }
  }
  return orderComponents(U, V);
}

/**
 * Spherical k-means over the columns of A (assumed L2-normalized).
 * Returns { assignment: Int32Array, centroids: DenseMatrix (rows × k) }.
 * Initialization is k-means++ with a seeded generator.
 */
export function sphericalKMeans(A, k, options = {}) {
  const n = A.cols, m = A.rows;
  k = Math.max(1, Math.min(k, n));
  const rnd = createRandom(options.seed || 0x5eed);
  const iterations = options.iterations || 15;
  const columns = options.columns || null; // optional subset of column indices
  const idx = columns || Array.from({ length: n }, (_, j) => j);
  const cnt = idx.length;
  const dot = (c, j) => {
    let s = 0;
    for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) s += A.values[p] * c[A.rowIndex[p]];
    return s;
  };
  const centroids = [];
  // k-means++ seeding on cosine distance.
  const first = idx[rnd.int(cnt)];
  centroids.push(A.column(first));
  const dist = new Float64Array(cnt).fill(Infinity);
  while (centroids.length < Math.min(k, cnt)) {
    const c = centroids[centroids.length - 1];
    let total = 0;
    for (let t = 0; t < cnt; t++) {
      const d = Math.max(0, 1 - dot(c, idx[t]));
      if (d < dist[t]) dist[t] = d;
      total += dist[t] * dist[t];
    }
    if (total <= 0) break;
    let r = rnd() * total;
    let pick = cnt - 1;
    for (let t = 0; t < cnt; t++) {
      r -= dist[t] * dist[t];
      if (r <= 0) { pick = t; break; }
    }
    centroids.push(A.column(idx[pick]));
  }
  const K = centroids.length;
  const assignment = new Int32Array(cnt).fill(-1);
  for (let it = 0; it < iterations; it++) {
    let changed = false;
    for (let t = 0; t < cnt; t++) {
      let best = 0, bestSim = -Infinity;
      for (let c = 0; c < K; c++) {
        const s = dot(centroids[c], idx[t]);
        if (s > bestSim) { bestSim = s; best = c; }
      }
      if (assignment[t] !== best) { assignment[t] = best; changed = true; }
    }
    // Recompute centroids.
    for (let c = 0; c < K; c++) centroids[c].fill(0);
    for (let t = 0; t < cnt; t++) {
      const c = centroids[assignment[t]], j = idx[t];
      for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) c[A.rowIndex[p]] += A.values[p];
    }
    for (let c = 0; c < K; c++) {
      let norm = 0;
      for (let i = 0; i < m; i++) norm += centroids[c][i] * centroids[c][i];
      norm = Math.sqrt(norm);
      if (norm > 0) for (let i = 0; i < m; i++) centroids[c][i] /= norm;
    }
    if (!changed && it > 0) break;
  }
  const C = new DenseMatrix(m, K);
  for (let c = 0; c < K; c++) C.setColumn(c, centroids[c]);
  return { assignment, centroids: C, columns: idx };
}

/** k-means "factorization": base vectors are the k-means centroids, ordered by cluster size. */
export function kMeansFactorization(A, k, options = {}) {
  const { assignment, centroids } = sphericalKMeans(A, k, {
    seed: options.seed,
    iterations: options.iterations || FACTORIZATION_ITERATIONS.high,
  });
  const K = centroids.cols;
  const sizes = new Float64Array(K);
  for (let t = 0; t < assignment.length; t++) sizes[assignment[t]]++;
  const order = Array.from({ length: K }, (_, j) => j).filter((j) => sizes[j] > 0).sort((a, b) => sizes[b] - sizes[a]);
  return { U: orientAndNormalize(centroids.selectColumns(order)), values: Float64Array.from(order.map((j) => sizes[j])) };
}

export const FACTORIZATIONS = Object.freeze({
  svd: partialSvd,
  'nmf-ed': nmfEuclidean,
  'nmf-kl': nmfKullbackLeibler,
  lnmf: localNmf,
  kmeans: kMeansFactorization,
});

/** Factorizes A with the named method. */
export function factorize(A, k, method = 'svd', options = {}) {
  const fn = FACTORIZATIONS[method];
  if (!fn) throw new Error('Unknown factorization "' + method + '". Known: ' + Object.keys(FACTORIZATIONS).join(', '));
  const iterations = FACTORIZATION_ITERATIONS[options.quality || 'high'] || FACTORIZATION_ITERATIONS.high;
  return fn(A, k, Object.assign({ iterations }, options));
}
