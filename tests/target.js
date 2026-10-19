/*
 * The library under test: the single-file build when a page has loaded it
 * (tests/dist.html sets globalThis.__BROCCOLI_TARGET__), the ES modules in
 * src/ otherwise.
 */
const target = globalThis.__BROCCOLI_TARGET__ || (await import('../src/index.js'));
export default target;
