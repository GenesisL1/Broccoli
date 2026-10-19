/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Minimal dense (row-major Float64Array) and sparse (compressed sparse
 * column) matrices with the handful of operations the clustering
 * algorithms need.
 */

export class DenseMatrix {
  constructor(rows, cols, data) {
    this.rows = rows;
    this.cols = cols;
    this.data = data || new Float64Array(rows * cols);
  }

  get(i, j) {
    return this.data[i * this.cols + j];
  }

  set(i, j, v) {
    this.data[i * this.cols + j] = v;
  }

  column(j) {
    const out = new Float64Array(this.rows);
    for (let i = 0; i < this.rows; i++) out[i] = this.data[i * this.cols + j];
    return out;
  }

  setColumn(j, values) {
    for (let i = 0; i < this.rows; i++) this.data[i * this.cols + j] = values[i];
  }

  row(i) {
    return this.data.subarray(i * this.cols, (i + 1) * this.cols);
  }

  clone() {
    return new DenseMatrix(this.rows, this.cols, this.data.slice());
  }

  transpose() {
    const out = new DenseMatrix(this.cols, this.rows);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) out.data[j * this.rows + i] = this.data[i * this.cols + j];
    }
    return out;
  }

  /** this (r × c) times other (c × k). */
  multiply(other) {
    const r = this.rows, c = this.cols, k = other.cols;
    const out = new DenseMatrix(r, k);
    const a = this.data, b = other.data, o = out.data;
    for (let i = 0; i < r; i++) {
      const oi = i * k;
      for (let t = 0; t < c; t++) {
        const v = a[i * c + t];
        if (v === 0) continue;
        const bt = t * k;
        for (let j = 0; j < k; j++) o[oi + j] += v * b[bt + j];
      }
    }
    return out;
  }

  /** this^T this (c × c), computing only half of the symmetric product. */
  gram() {
    const r = this.rows, c = this.cols, a = this.data;
    const out = new DenseMatrix(c, c);
    const o = out.data;
    for (let t = 0; t < r; t++) {
      const at = t * c;
      for (let p = 0; p < c; p++) {
        const v = a[at + p];
        if (v === 0) continue;
        const op = p * c;
        for (let q = p; q < c; q++) o[op + q] += v * a[at + q];
      }
    }
    for (let p = 0; p < c; p++) for (let q = 0; q < p; q++) o[p * c + q] = o[q * c + p];
    return out;
  }

  /** this^T (c × r) times other (r × k). */
  transposeMultiply(other) {
    const r = this.rows, c = this.cols, k = other.cols;
    const out = new DenseMatrix(c, k);
    const a = this.data, b = other.data, o = out.data;
    for (let t = 0; t < r; t++) {
      const bt = t * k;
      for (let i = 0; i < c; i++) {
        const v = a[t * c + i];
        if (v === 0) continue;
        const oi = i * k;
        for (let j = 0; j < k; j++) o[oi + j] += v * b[bt + j];
      }
    }
    return out;
  }

  columnNorm(j) {
    let s = 0;
    for (let i = 0; i < this.rows; i++) {
      const v = this.data[i * this.cols + j];
      s += v * v;
    }
    return Math.sqrt(s);
  }

  /** Scales every column to unit L2 norm (zero columns stay zero). */
  normalizeColumns() {
    for (let j = 0; j < this.cols; j++) {
      const n = this.columnNorm(j);
      if (n > 0) for (let i = 0; i < this.rows; i++) this.data[i * this.cols + j] /= n;
    }
    return this;
  }

  /** Keeps the first k columns. */
  leftColumns(k) {
    const out = new DenseMatrix(this.rows, k);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < k; j++) out.data[i * k + j] = this.data[i * this.cols + j];
    }
    return out;
  }

  /** Selects columns by index. */
  selectColumns(indices) {
    const k = indices.length;
    const out = new DenseMatrix(this.rows, k);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < k; j++) out.data[i * k + j] = this.data[i * this.cols + indices[j]];
    }
    return out;
  }
}

export class SparseMatrix {
  /** CSC: column j holds rowIndex[colPtr[j]..colPtr[j+1]) and the matching values. */
  constructor(rows, cols, colPtr, rowIndex, values) {
    this.rows = rows;
    this.cols = cols;
    this.colPtr = colPtr;
    this.rowIndex = rowIndex;
    this.values = values;
  }

  /** columns: Array of Map(row → value) or arrays of [row, value] pairs. */
  static fromColumns(rows, columns) {
    const cols = columns.length;
    const colPtr = new Int32Array(cols + 1);
    let nnz = 0;
    const entries = columns.map((c) => {
      const list = c instanceof Map ? [...c.entries()] : c;
      list.sort((a, b) => a[0] - b[0]);
      return list.filter((e) => e[1] !== 0);
    });
    for (let j = 0; j < cols; j++) { colPtr[j] = nnz; nnz += entries[j].length; }
    colPtr[cols] = nnz;
    const rowIndex = new Int32Array(nnz);
    const values = new Float64Array(nnz);
    for (let j = 0; j < cols; j++) {
      let p = colPtr[j];
      for (const [r, v] of entries[j]) { rowIndex[p] = r; values[p] = v; p++; }
    }
    return new SparseMatrix(rows, cols, colPtr, rowIndex, values);
  }

  get nnz() {
    return this.colPtr[this.cols];
  }

  get(i, j) {
    for (let p = this.colPtr[j]; p < this.colPtr[j + 1]; p++) {
      if (this.rowIndex[p] === i) return this.values[p];
    }
    return 0;
  }

  columnNorm(j) {
    let s = 0;
    for (let p = this.colPtr[j]; p < this.colPtr[j + 1]; p++) s += this.values[p] * this.values[p];
    return Math.sqrt(s);
  }

  normalizeColumns() {
    for (let j = 0; j < this.cols; j++) {
      const n = this.columnNorm(j);
      if (n > 0) for (let p = this.colPtr[j]; p < this.colPtr[j + 1]; p++) this.values[p] /= n;
    }
    return this;
  }

  /** this (m × n) times x (n) → m. */
  multiplyVector(x) {
    const out = new Float64Array(this.rows);
    for (let j = 0; j < this.cols; j++) {
      const xj = x[j];
      if (xj === 0) continue;
      for (let p = this.colPtr[j]; p < this.colPtr[j + 1]; p++) out[this.rowIndex[p]] += this.values[p] * xj;
    }
    return out;
  }

  /** this^T (n × m) times y (m) → n. */
  transposeMultiplyVector(y) {
    const out = new Float64Array(this.cols);
    for (let j = 0; j < this.cols; j++) {
      let s = 0;
      for (let p = this.colPtr[j]; p < this.colPtr[j + 1]; p++) s += this.values[p] * y[this.rowIndex[p]];
      out[j] = s;
    }
    return out;
  }

  /** this (m × n) times B (n × k) → m × k. */
  multiplyDense(B) {
    const k = B.cols;
    const out = new DenseMatrix(this.rows, k);
    const o = out.data, b = B.data;
    for (let j = 0; j < this.cols; j++) {
      const bj = j * k;
      for (let p = this.colPtr[j]; p < this.colPtr[j + 1]; p++) {
        const v = this.values[p];
        const oi = this.rowIndex[p] * k;
        for (let t = 0; t < k; t++) o[oi + t] += v * b[bj + t];
      }
    }
    return out;
  }

  /** this^T (n × m) times B (m × k) → n × k. */
  transposeMultiplyDense(B) {
    const k = B.cols;
    const out = new DenseMatrix(this.cols, k);
    const o = out.data, b = B.data;
    for (let j = 0; j < this.cols; j++) {
      const oj = j * k;
      for (let p = this.colPtr[j]; p < this.colPtr[j + 1]; p++) {
        const v = this.values[p];
        const bi = this.rowIndex[p] * k;
        for (let t = 0; t < k; t++) o[oj + t] += v * b[bi + t];
      }
    }
    return out;
  }

  /** A A^T (m × m), dense. */
  gramRows() {
    const m = this.rows;
    const out = new DenseMatrix(m, m);
    const o = out.data;
    for (let j = 0; j < this.cols; j++) {
      const s = this.colPtr[j], e = this.colPtr[j + 1];
      for (let p = s; p < e; p++) {
        const r1 = this.rowIndex[p], v1 = this.values[p];
        const base = r1 * m;
        for (let q = s; q < e; q++) o[base + this.rowIndex[q]] += v1 * this.values[q];
      }
    }
    return out;
  }

  /** A^T A (n × n), dense. */
  gramColumns() {
    const n = this.cols;
    const out = new DenseMatrix(n, n);
    const o = out.data;
    // Row-wise lists of (column, value).
    const rowCols = new Array(this.rows);
    for (let i = 0; i < this.rows; i++) rowCols[i] = [];
    for (let j = 0; j < n; j++) {
      for (let p = this.colPtr[j]; p < this.colPtr[j + 1]; p++) rowCols[this.rowIndex[p]].push(j, this.values[p]);
    }
    for (let i = 0; i < this.rows; i++) {
      const l = rowCols[i];
      for (let a = 0; a < l.length; a += 2) {
        const ca = l[a], va = l[a + 1];
        const base = ca * n;
        for (let b = 0; b < l.length; b += 2) o[base + l[b]] += va * l[b + 1];
      }
    }
    return out;
  }

  toDense() {
    const out = new DenseMatrix(this.rows, this.cols);
    for (let j = 0; j < this.cols; j++) {
      for (let p = this.colPtr[j]; p < this.colPtr[j + 1]; p++) out.data[this.rowIndex[p] * this.cols + j] = this.values[p];
    }
    return out;
  }

  /** Column j as a dense vector. */
  column(j) {
    const out = new Float64Array(this.rows);
    for (let p = this.colPtr[j]; p < this.colPtr[j + 1]; p++) out[this.rowIndex[p]] = this.values[p];
    return out;
  }

  /** Sub-matrix with the given columns (in that order). */
  selectColumns(indices) {
    const colPtr = new Int32Array(indices.length + 1);
    let nnz = 0;
    for (let t = 0; t < indices.length; t++) {
      colPtr[t] = nnz;
      nnz += this.colPtr[indices[t] + 1] - this.colPtr[indices[t]];
    }
    colPtr[indices.length] = nnz;
    const rowIndex = new Int32Array(nnz);
    const values = new Float64Array(nnz);
    for (let t = 0; t < indices.length; t++) {
      const j = indices[t];
      const s = this.colPtr[j], e = this.colPtr[j + 1];
      rowIndex.set(this.rowIndex.subarray(s, e), colPtr[t]);
      values.set(this.values.subarray(s, e), colPtr[t]);
    }
    return new SparseMatrix(this.rows, indices.length, colPtr, rowIndex, values);
  }
}

/** Orthonormalizes the columns of a dense matrix in place (modified Gram-Schmidt, two passes). */
export function orthonormalizeColumns(M) {
  const r = M.rows, c = M.cols, d = M.data;
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < c; j++) {
      for (let q = 0; q < j; q++) {
        let dot = 0;
        for (let i = 0; i < r; i++) dot += d[i * c + j] * d[i * c + q];
        for (let i = 0; i < r; i++) d[i * c + j] -= dot * d[i * c + q];
      }
      let norm = 0;
      for (let i = 0; i < r; i++) norm += d[i * c + j] * d[i * c + j];
      norm = Math.sqrt(norm);
      if (norm > 1e-12) for (let i = 0; i < r; i++) d[i * c + j] /= norm;
      else for (let i = 0; i < r; i++) d[i * c + j] = 0;
    }
  }
  return M;
}
