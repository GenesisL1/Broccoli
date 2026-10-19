/*
 * Broccoli test harness: a tiny, dependency-free test runner that works in
 * any browser (tests/index.html, tests/dist.html) and in any JavaScript
 * runtime with ES modules.
 */

const registry = [];
let currentGroup = '';

export function group(name) {
  currentGroup = name;
}

export function test(name, fn) {
  registry.push({ group: currentGroup, name, fn });
}

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

function show(v) {
  try {
    return JSON.stringify(v);
  } catch (e) {
    return String(v);
  }
}

export function assert(cond, message = 'assertion failed') {
  if (!cond) throw new AssertionError(message);
}

export function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new AssertionError((message ? message + ': ' : '') + 'expected ' + show(expected) + ', got ' + show(actual));
  }
}

export function assertDeepEqual(actual, expected, message = '') {
  const a = show(actual), e = show(expected);
  if (a !== e) throw new AssertionError((message ? message + ': ' : '') + 'expected ' + e + ', got ' + a);
}

export function assertClose(actual, expected, tolerance = 1e-9, message = '') {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new AssertionError((message ? message + ': ' : '') + 'expected ' + expected + ' ± ' + tolerance + ', got ' + actual);
  }
}

export async function assertRejects(promiseOrFn, pattern, message = '') {
  try {
    await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
  } catch (err) {
    if (pattern && !pattern.test(String(err && err.message))) {
      throw new AssertionError((message ? message + ': ' : '') + 'error ' + show(err && err.message) + ' does not match ' + pattern);
    }
    return err;
  }
  throw new AssertionError((message ? message + ': ' : '') + 'expected a rejection');
}

export function assertThrows(fn, pattern, message = '') {
  try {
    fn();
  } catch (err) {
    if (pattern && !pattern.test(String(err && err.message))) {
      throw new AssertionError((message ? message + ': ' : '') + 'error ' + show(err && err.message) + ' does not match ' + pattern);
    }
    return err;
  }
  throw new AssertionError((message ? message + ': ' : '') + 'expected an exception');
}

/** Runs all registered tests; returns { passed, failed, results }. */
export async function runAll(onResult) {
  const results = [];
  for (const t of registry) {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let error = null;
    try {
      await t.fn();
    } catch (err) {
      error = err;
    }
    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    const r = {
      group: t.group,
      name: t.name,
      ok: !error,
      ms: Math.round(ms * 10) / 10,
      error: error ? String(error && error.stack ? error.message + '\n' + error.stack.split('\n').slice(1, 4).join('\n') : error) : null,
    };
    results.push(r);
    if (onResult) onResult(r);
  }
  const failed = results.filter((r) => !r.ok).length;
  return { passed: results.length - failed, failed, results };
}
