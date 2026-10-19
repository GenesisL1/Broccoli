/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Helpers shared by the clustering algorithms.
 */

/** Disjoint-set forest with path halving and union by size. */
export function createUnionFind(n) {
  const parent = new Int32Array(n);
  const size = new Int32Array(n).fill(1);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    let ra = find(a), rb = find(b);
    if (ra === rb) return false;
    if (size[ra] < size[rb]) { const t = ra; ra = rb; rb = t; }
    parent[rb] = ra;
    size[ra] += size[rb];
    return true;
  };
  const groups = () => {
    const map = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      let g = map.get(r);
      if (!g) { g = []; map.set(r, g); }
      g.push(i);
    }
    return [...map.values()];
  };
  return { find, union, groups };
}

/**
 * Sorts clusters by size^(1 - scoreWeight) · score^scoreWeight, descending;
 * ties are broken by label. scoreWeight = 0 sorts by size only, 1 by score only.
 */
export function sortClusters(clusters, scoreWeight = 0) {
  const w = Math.min(1, Math.max(0, scoreWeight));
  const rank = (c) => {
    const size = c.documents.length;
    const score = Math.max(c.score, 0);
    if (w === 0) return size;
    if (w === 1) return score;
    return Math.pow(size, 1 - w) * Math.pow(score, w);
  };
  return clusters
    .map((c) => ({ c, r: rank(c) }))
    .sort((a, b) => b.r - a.r || b.c.score - a.c.score || String(a.c.labels[0]).localeCompare(String(b.c.labels[0])))
    .map((x) => x.c);
}

/** Phrase-length weight for Lingo labels: 1 below `start`, falling linearly to 0 at `stop`. */
export function phraseLengthPenalty(length, start, stop) {
  if (stop < start) stop = start;
  if (length >= stop) return 0;
  if (length < start) return 1;
  const step = 1 / (stop - start + 1);
  return Math.max(0, 1 - step * (length - start + 1));
}

/**
 * Number of base vectors Lingo looks for: proportional to the desired
 * cluster count and to the square root of the number of documents
 * (30 for 100 documents at the default of 30).
 */
export function computeClusterCount(desiredClusterCount, documentCount) {
  const k = Math.floor((desiredClusterCount / 10) * Math.sqrt(documentCount));
  return Math.max(1, Math.min(k, documentCount));
}
