/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Symmetric eigendecomposition: Householder tridiagonalization followed by
 * the implicit QL algorithm (EISPACK tred2/tql2). This follows the
 * public-domain JAMA reference implementation (NIST / The MathWorks).
 */

import { DenseMatrix } from './matrix.js';

function hypot(a, b) {
  const x = Math.abs(a), y = Math.abs(b);
  if (x > y) { const r = y / x; return x * Math.sqrt(1 + r * r); }
  if (y !== 0) { const r = x / y; return y * Math.sqrt(1 + r * r); }
  return 0;
}

/**
 * Eigenvalues and eigenvectors of a symmetric matrix given as a DenseMatrix
 * (only symmetry is assumed, not checked). Returns { values, vectors }, with
 * eigenvalues in descending order and vectors as a DenseMatrix whose columns
 * are the corresponding unit eigenvectors.
 */
export function symmetricEigen(A) {
  const n = A.rows;
  const V = new Array(n);
  for (let i = 0; i < n; i++) V[i] = Float64Array.from(A.data.subarray(i * n, (i + 1) * n));
  const d = new Float64Array(n);
  const e = new Float64Array(n);
  if (n === 0) return { values: d, vectors: new DenseMatrix(0, 0) };

  // tred2
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0, h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) {
      e[i] = d[i - 1];
      for (let j = 0; j < i; j++) {
        d[j] = V[i - 1][j];
        V[i][j] = 0;
        V[j][i] = 0;
      }
    } else {
      for (let k = 0; k < i; k++) {
        d[k] /= scale;
        h += d[k] * d[k];
      }
      let f = d[i - 1];
      let g = Math.sqrt(h);
      if (f > 0) g = -g;
      e[i] = scale * g;
      h -= f * g;
      d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) {
        f = d[j];
        V[j][i] = f;
        g = e[j] + V[j][j] * f;
        for (let k = j + 1; k <= i - 1; k++) {
          g += V[k][j] * d[k];
          e[k] += V[k][j] * f;
        }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j++) {
        e[j] /= h;
        f += e[j] * d[j];
      }
      const hh = f / (h + h);
      for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) {
        f = d[j];
        g = e[j];
        for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k];
        d[j] = V[i - 1][j];
        V[i][j] = 0;
      }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) {
    V[n - 1][i] = V[i][i];
    V[i][i] = 1;
    const h = d[i + 1];
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
      for (let j = 0; j <= i; j++) {
        let g = 0;
        for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
        for (let k = 0; k <= i; k++) V[k][j] -= g * d[k];
      }
    }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
  }
  for (let j = 0; j < n; j++) {
    d[j] = V[n - 1][j];
    V[n - 1][j] = 0;
  }
  V[n - 1][n - 1] = 1;
  e[0] = 0;

  return tql2(d, e, V, n);
}

/**
 * Implicit QL on a symmetric tridiagonal matrix (diagonal d, sub-diagonal in
 * e[1..n-1] with e[0] = 0), accumulating rotations into V (array of rows).
 * Returns eigenvalues in descending order with eigenvectors as columns.
 */
function tql2(d, e, V, n) {
  // tql2
  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  let f = 0, tst1 = 0;
  const eps = Math.pow(2, -52);
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
    let m = l;
    while (m < n) {
      if (Math.abs(e[m]) <= eps * tst1) break;
      m++;
    }
    if (m === n) m = n - 1;
    if (m > l) {
      let iter = 0;
      do {
        iter++;
        let g = d[l];
        let p = (d[l + 1] - g) / (2 * e[l]);
        let r = hypot(p, 1);
        if (p < 0) r = -r;
        d[l] = e[l] / (p + r);
        d[l + 1] = e[l] * (p + r);
        const dl1 = d[l + 1];
        let h = g - d[l];
        for (let i = l + 2; i < n; i++) d[i] -= h;
        f += h;
        p = d[m];
        let c = 1, c2 = c, c3 = c;
        const el1 = e[l + 1];
        let s = 0, s2 = 0;
        for (let i = m - 1; i >= l; i--) {
          c3 = c2;
          c2 = c;
          s2 = s;
          g = c * e[i];
          h = c * p;
          r = hypot(p, e[i]);
          e[i + 1] = s * r;
          s = e[i] / r;
          c = p / r;
          p = c * d[i] - s * g;
          d[i + 1] = h + s * (c * g + s * d[i]);
          for (let k = 0; k < n; k++) {
            const vk = V[k];
            h = vk[i + 1];
            vk[i + 1] = s * vk[i] + c * h;
            vk[i] = c * vk[i] - s * h;
          }
        }
        p = (-s * s2 * c3 * el1 * e[l]) / dl1;
        e[l] = s * p;
        d[l] = c * p;
      } while (Math.abs(e[l]) > eps * tst1 && iter < 200);
    }
    d[l] += f;
    e[l] = 0;
  }

  // Sort descending.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => d[b] - d[a]);
  const values = new Float64Array(n);
  const data = new Float64Array(n * n);
  for (let t = 0; t < n; t++) {
    const src = order[t];
    values[t] = d[src];
    for (let k = 0; k < n; k++) data[k * n + t] = V[k][src];
  }
  return { values, vectors: new DenseMatrix(n, n, data) };
}

/**
 * Eigenvalues and eigenvectors of a symmetric tridiagonal matrix with
 * diagonal `alpha` (length n) and off-diagonal `beta` (length n - 1).
 */
export function tridiagonalEigen(alpha, beta) {
  const n = alpha.length;
  const d = Float64Array.from(alpha);
  const e = new Float64Array(n);
  for (let i = 1; i < n; i++) e[i] = beta[i - 1];
  const V = new Array(n);
  for (let i = 0; i < n; i++) { V[i] = new Float64Array(n); V[i][i] = 1; }
  if (n === 0) return { values: d, vectors: new DenseMatrix(0, 0) };
  return tql2(d, e, V, n);
}
