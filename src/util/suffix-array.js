/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Suffix arrays over integer sequences (SA-IS, Nong, Zhang & Chan 2009),
 * LCP arrays (Kasai et al. 2001) and bottom-up enumeration of LCP intervals
 * (Abouelhoda, Kurtz & Ohlebusch 2004). LCP intervals are the internal nodes
 * of the corresponding suffix tree, which is what both frequent-phrase
 * extraction and Suffix Tree Clustering need.
 */

/**
 * SA-IS on T, where T[n - 1] === 0 is a unique sentinel and all values are
 * in [0, K).
 */
function sais(T, K) {
  const n = T.length;
  const SA = new Int32Array(n);
  if (n === 1) {
    SA[0] = 0;
    return SA;
  }

  // Suffix types: 1 = S-type, 0 = L-type.
  const t = new Uint8Array(n);
  t[n - 1] = 1;
  for (let i = n - 2; i >= 0; i--) {
    t[i] = T[i] < T[i + 1] || (T[i] === T[i + 1] && t[i + 1] === 1) ? 1 : 0;
  }
  const isLMS = (i) => i > 0 && t[i] === 1 && t[i - 1] === 0;

  const bucketSizes = new Int32Array(K);
  for (let i = 0; i < n; i++) bucketSizes[T[i]]++;
  const bkt = new Int32Array(K);
  const toBucketEnds = () => {
    let s = 0;
    for (let c = 0; c < K; c++) { s += bucketSizes[c]; bkt[c] = s; }
  };
  const toBucketStarts = () => {
    let s = 0;
    for (let c = 0; c < K; c++) { bkt[c] = s; s += bucketSizes[c]; }
  };
  const induce = () => {
    toBucketStarts();
    for (let i = 0; i < n; i++) {
      const p = SA[i];
      if (p > 0 && t[p - 1] === 0) SA[bkt[T[p - 1]]++] = p - 1;
    }
    toBucketEnds();
    for (let i = n - 1; i >= 0; i--) {
      const p = SA[i];
      if (p > 0 && t[p - 1] === 1) SA[--bkt[T[p - 1]]] = p - 1;
    }
  };

  // Stage 1: sort LMS substrings by induced sorting.
  let lmsCount = 0;
  for (let i = 1; i < n; i++) if (isLMS(i)) lmsCount++;
  SA.fill(-1);
  toBucketEnds();
  for (let i = 1; i < n; i++) if (isLMS(i)) SA[--bkt[T[i]]] = i;
  induce();

  // Stage 2: name the sorted LMS substrings.
  const sortedLms = new Int32Array(lmsCount);
  let k = 0;
  for (let i = 0; i < n; i++) if (isLMS(SA[i])) sortedLms[k++] = SA[i];

  const names = new Int32Array(n).fill(-1);
  let name = 0;
  let prev = -1;
  for (let j = 0; j < lmsCount; j++) {
    const pos = sortedLms[j];
    let diff = false;
    for (let d = 0; ; d++) {
      if (prev === -1 || T[pos + d] !== T[prev + d] || t[pos + d] !== t[prev + d]) {
        diff = true;
        break;
      }
      if (d > 0 && (isLMS(pos + d) || isLMS(prev + d))) break;
    }
    if (diff) {
      name++;
      prev = pos;
    }
    names[pos] = name - 1;
  }

  const lmsPositions = new Int32Array(lmsCount);
  const reduced = new Int32Array(lmsCount);
  k = 0;
  for (let i = 1; i < n; i++) {
    if (isLMS(i)) {
      lmsPositions[k] = i;
      reduced[k] = names[i];
      k++;
    }
  }

  // Stage 3: sort LMS suffixes, recursing when names are not unique.
  let reducedSA;
  if (name < lmsCount) {
    reducedSA = sais(reduced, name);
  } else {
    reducedSA = new Int32Array(lmsCount);
    for (let i = 0; i < lmsCount; i++) reducedSA[reduced[i]] = i;
  }

  // Stage 4: induce the full suffix array from the sorted LMS suffixes.
  SA.fill(-1);
  toBucketEnds();
  for (let j = lmsCount - 1; j >= 0; j--) {
    const p = lmsPositions[reducedSA[j]];
    SA[--bkt[T[p]]] = p;
  }
  induce();
  return SA;
}

/**
 * Suffix array of an integer sequence with values in [0, alphabetSize).
 * Returns an Int32Array of suffix start positions in lexicographic order.
 */
export function suffixArray(sequence, alphabetSize) {
  const n = sequence.length;
  if (n === 0) return new Int32Array(0);
  const T = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const v = sequence[i];
    if (v < 0 || v >= alphabetSize) {
      throw new RangeError('suffixArray: symbol ' + v + ' at ' + i + ' is outside [0, ' + alphabetSize + ')');
    }
    T[i] = v + 1;
  }
  T[n] = 0;
  const SA = sais(T, alphabetSize + 1);
  return SA.slice(1);
}

/**
 * LCP array: lcp[i] is the length of the longest common prefix of the
 * suffixes SA[i - 1] and SA[i]; lcp[0] is 0.
 */
export function lcpArray(sequence, SA) {
  const n = sequence.length;
  const rank = new Int32Array(n);
  for (let i = 0; i < n; i++) rank[SA[i]] = i;
  const lcp = new Int32Array(n);
  let h = 0;
  for (let i = 0; i < n; i++) {
    const r = rank[i];
    if (r > 0) {
      const j = SA[r - 1];
      while (i + h < n && j + h < n && sequence[i + h] === sequence[j + h]) h++;
      lcp[r] = h;
      if (h > 0) h--;
    } else {
      h = 0;
    }
  }
  return lcp;
}

/**
 * Visits every LCP interval [lb, rb] (inclusive suffix array range) whose LCP
 * value is at least `minLcp`, children before parents. The callback receives
 * (lcpValue, lb, rb, parentLcp), where parentLcp is the LCP value of the
 * enclosing interval (0 for children of the root). An optional `cap` limits
 * LCP values, which turns deeper intervals into implicit nodes at depth `cap`.
 */
export function forEachLcpInterval(lcp, minLcp, callback, cap = Infinity) {
  const n = lcp.length;
  const stackLcp = new Int32Array(n + 1);
  const stackLb = new Int32Array(n + 1);
  let top = 0;
  stackLcp[0] = 0;
  stackLb[0] = 0;
  for (let i = 1; i <= n; i++) {
    const raw = i < n ? lcp[i] : 0;
    const cur = raw > cap ? cap : raw;
    let lb = i - 1;
    while (cur < stackLcp[top]) {
      const value = stackLcp[top];
      lb = stackLb[top];
      top--;
      const parent = Math.max(cur, stackLcp[top]);
      if (value >= minLcp) callback(value, lb, i - 1, parent);
    }
    if (cur > stackLcp[top]) {
      top++;
      stackLcp[top] = cur;
      stackLb[top] = lb;
    }
  }
}
