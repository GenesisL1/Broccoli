/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 */

/** Population count of a 32-bit integer. */
export function popcount32(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * A fixed-size set of non-negative integers backed by a Uint32Array.
 * Used for document sets of labels and clusters.
 */
export class BitSet {
  constructor(size) {
    this.size = size | 0;
    this.words = new Uint32Array((this.size + 31) >>> 5);
  }

  static fromIndices(size, indices) {
    const set = new BitSet(size);
    for (let i = 0; i < indices.length; i++) set.set(indices[i]);
    return set;
  }

  set(i) {
    this.words[i >>> 5] |= 1 << (i & 31);
    return this;
  }

  clear(i) {
    this.words[i >>> 5] &= ~(1 << (i & 31));
    return this;
  }

  get(i) {
    if (i < 0 || i >= this.size) return false;
    return (this.words[i >>> 5] & (1 << (i & 31))) !== 0;
  }

  cardinality() {
    let c = 0;
    const w = this.words;
    for (let i = 0; i < w.length; i++) if (w[i] !== 0) c += popcount32(w[i]);
    return c;
  }

  isEmpty() {
    const w = this.words;
    for (let i = 0; i < w.length; i++) if (w[i] !== 0) return false;
    return true;
  }

  clone() {
    const copy = new BitSet(this.size);
    copy.words.set(this.words);
    return copy;
  }

  /** In-place union. */
  or(other) {
    const a = this.words, b = other.words;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) a[i] |= b[i];
    return this;
  }

  /** In-place intersection. */
  and(other) {
    const a = this.words, b = other.words;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) a[i] &= b[i];
    for (let i = n; i < a.length; i++) a[i] = 0;
    return this;
  }

  /** In-place difference (this minus other). */
  andNot(other) {
    const a = this.words, b = other.words;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) a[i] &= ~b[i];
    return this;
  }

  /** Size of the intersection with another set, without allocating. */
  intersectionCount(other) {
    const a = this.words, b = other.words;
    const n = Math.min(a.length, b.length);
    let c = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i] & b[i];
      if (x !== 0) c += popcount32(x);
    }
    return c;
  }

  equals(other) {
    if (other.size !== this.size) return false;
    const a = this.words, b = other.words;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  forEach(fn) {
    const w = this.words;
    for (let i = 0; i < w.length; i++) {
      let x = w[i];
      while (x !== 0) {
        const t = x & -x;
        fn((i << 5) + (31 - Math.clz32(t)));
        x ^= t;
      }
    }
  }

  toArray() {
    const out = new Array(this.cardinality());
    let k = 0;
    this.forEach((i) => { out[k++] = i; });
    return out;
  }
}
