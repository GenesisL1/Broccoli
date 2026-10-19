/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Requests for search sources. Each source gets one queue with its own
 * rate limit (shared by every search on the page), retries with backoff on
 * HTTP 429 and 5xx, a timeout, and cancellation through AbortSignal. Only
 * CORS "simple" requests are made (GET with no custom headers), so a
 * browser sends them straight to the API without a preflight.
 */

export class SourceError extends Error {
  /**
   * details = { source, kind, status, url, detail, cause }
   * kind: 'network' (unreachable, or the API refuses requests from web
   * pages), 'timeout', 'rate-limit' (HTTP 429), 'http' (any other error
   * status), 'parse' (an answer that could not be read), 'query' (the API
   * rejected the query), 'quota', 'config'.
   */
  constructor(message, details = {}) {
    super(message);
    this.name = 'SourceError';
    Object.assign(this, details);
  }
}

export function abortError() {
  try {
    return new DOMException('The operation was aborted.', 'AbortError');
  } catch (e) {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    return err;
  }
}

export function isAbortError(err) {
  return !!err && err.name === 'AbortError';
}

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(abortError()); return; }
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

/**
 * base + query string. Parameters that are undefined, null or '' are left
 * out; arrays are joined with commas.
 */
export function buildUrl(base, params) {
  const parts = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    const value = Array.isArray(v) ? v.join(',') : String(v);
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(value));
  }
  if (!parts.length) return base;
  const joiner = base.indexOf('?') < 0 ? '?' : /[?&]$/.test(base) ? '' : '&';
  return base + joiner + parts.join('&');
}

// One gate per source (or per service several sources share): it spaces
// the requests out and lets one through at a time.
const gates = new Map();

function gateFor(key, perSecond) {
  let gate = gates.get(key);
  if (!gate) {
    gate = { next: 0, queue: Promise.resolve(), interval: 0 };
    gates.set(key, gate);
  }
  gate.interval = Math.ceil(1000 / Math.max(0.05, perSecond || 3));
  return gate;
}

function takeTurn(gate, signal) {
  const turn = gate.queue.then(async () => {
    const wait = gate.next - Date.now();
    if (wait > 0) await sleep(wait, signal);
    gate.next = Date.now() + gate.interval;
  });
  gate.queue = turn.catch(() => {});
  return turn;
}

function describe(kind, name, status, detail) {
  if (kind === 'network') return 'Could not reach ' + name;
  if (kind === 'timeout') return name + ' did not answer in time';
  if (kind === 'rate-limit') return name + ' is limiting requests from this address (HTTP 429)';
  let message = name + ' answered with HTTP ' + status;
  const text = String(detail || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text) message += ': ' + text.slice(0, 200);
  return message;
}

/**
 * A requester for one source. options = {
 *   source: 'id', name: 'Name' (for messages),
 *   requestsPerSecond = 3, gateKey = source (sources that call the same
 *   service share a key, and so its limit),
 *   maxRetries = 3, timeout = 30000 (ms), signal, fetch
 * }
 * Its text(url) and json(url) return the response body; count and urls
 * record what was requested.
 */
export function createRequester(options = {}) {
  const source = options.source || 'source';
  const name = options.name || source;
  const fetchImpl = options.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  if (!fetchImpl) throw new SourceError('No fetch implementation for ' + name, { kind: 'config', source });
  const gate = gateFor(options.gateKey || source, options.requestsPerSecond);
  const maxRetries = options.maxRetries == null ? 3 : options.maxRetries;
  const timeout = options.timeout || 30000;

  const requester = {
    count: 0,
    urls: [],

    async text(url, init = {}) {
      const signal = init.signal || options.signal;
      let attempt = 0;
      for (;;) {
        await takeTurn(gate, signal);
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const onAbort = () => controller && controller.abort();
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; if (controller) controller.abort(); }, timeout);
        let response = null, failure = null, body = '';
        try {
          requester.count++;
          requester.urls.push(url);
          const req = { method: init.method || 'GET', signal: controller ? controller.signal : undefined };
          if (init.body !== undefined) req.body = init.body;
          if (init.headers) req.headers = init.headers;
          response = await fetchImpl(url, req);
          // The body is read under the same timeout and cancellation as the headers.
          if (response.ok) body = await response.text();
          else { try { body = await response.text(); } catch (e) { body = ''; } }
        } catch (err) {
          failure = err;
        } finally {
          clearTimeout(timer);
          if (signal) signal.removeEventListener('abort', onAbort);
        }
        if (signal && signal.aborted) throw abortError();
        let kind, status = 0, detail = '';
        if (failure) {
          kind = timedOut ? 'timeout' : 'network';
        } else if (response.ok) {
          return body;
        } else {
          status = response.status;
          kind = status === 429 ? 'rate-limit' : 'http';
          detail = String(body || '').slice(0, 600);
        }
        // A refusal from the browser (CORS) looks like a network error: try it once more only.
        const retry = kind === 'network' || kind === 'timeout' ? attempt < Math.min(1, maxRetries)
          : (status === 429 || status >= 500) && attempt < maxRetries;
        if (!retry) {
          throw new SourceError(describe(kind, name, status, detail), { source, kind, status, url, detail, cause: failure });
        }
        attempt++;
        let delay = Math.min(10000, 700 * Math.pow(2, attempt - 1));
        const retryAfter = response && response.headers && response.headers.get ? response.headers.get('Retry-After') : null;
        if (retryAfter && Number.isFinite(+retryAfter)) delay = Math.max(delay, Math.min(30000, +retryAfter * 1000));
        await sleep(delay, signal);
      }
    },

    async json(url, init = {}) {
      const body = await requester.text(url, init);
      try {
        return JSON.parse(body);
      } catch (e) {
        throw new SourceError(name + ' sent an answer that is not JSON', { source, kind: 'parse', url, detail: String(body).slice(0, 300) });
      }
    },
  };
  return requester;
}
