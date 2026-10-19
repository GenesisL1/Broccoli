/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 */

/**
 * Small, fast, seedable PRNG (mulberry32). Every randomized step in Broccoli
 * (factorization seeds, k-means initialization) draws from one of these so
 * that clustering the same input twice gives the same clusters.
 */
export function createRandom(seed = 0x2545f491) {
  let a = seed >>> 0;
  const next = function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  next.gaussian = function () {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0, v = 0;
    while (u === 0) u = next();
    v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  next.int = function (n) {
    return Math.floor(next() * n);
  };
  return next;
}
